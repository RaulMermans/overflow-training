/**
 * Deterministic sync error taxonomy.
 * Classifies Supabase/PostgREST/fetch errors into stable codes for analytics and UI.
 * Pure functions — no heuristics that change across runs.
 */

export enum SyncErrorCode {
  AUTH = 'AUTH',
  RLS = 'RLS',
  CONSTRAINT = 'CONSTRAINT',
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER = 'SERVER',
  CONFLICT = 'CONFLICT',
  UNKNOWN_RETRYABLE = 'UNKNOWN_RETRYABLE',
  UNKNOWN_FATAL = 'UNKNOWN_FATAL',
  // Backward-compatible alias retained for callers that still reference UNKNOWN.
  UNKNOWN = 'UNKNOWN',
}

export interface SyncErrorClassification {
  code: SyncErrorCode
  retryable: boolean
  httpStatus?: number
  pgCode?: string
  constraint?: string
  messageSafe?: string
  provider?: 'postgrest' | 'fetch' | 'supabase' | 'unknown'
}

const MAX_SAFE_MESSAGE_LEN = 200

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}

function extractHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  if (!('status' in err)) return undefined
  const raw = (err as { status?: unknown }).status
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

function extractPgCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  if (!('code' in err)) return undefined
  const raw = (err as { code?: unknown }).code
  return typeof raw === 'string' ? raw.toLowerCase() : undefined
}

function extractPgDetails(err: unknown): { constraint?: string } {
  if (!err || typeof err !== 'object') return {}
  const details = (err as { details?: string }).details
  if (typeof details !== 'string') return {}
  const constraintMatch = details.match(/Key\s*\([^)]+\)\s*=\s*\([^)]+\)\s*already exists/i)
  if (constraintMatch) return { constraint: 'unique_violation' }
  return {}
}

function extractSafeMessage(err: unknown): string | undefined {
  if (err == null) return undefined
  let msg: string
  if (typeof err === 'string') msg = err
  else if (err instanceof Error) msg = err.message
  else if (
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    msg = (err as { message: string }).message
  } else {
    msg = String(err)
  }
  const sanitized = msg.replace(/\s+/g, ' ').trim()
  return sanitized ? truncate(sanitized, MAX_SAFE_MESSAGE_LEN) : undefined
}

function extractProvider(err: unknown): SyncErrorClassification['provider'] {
  if (!err || typeof err !== 'object') return 'unknown'
  if ('code' in err && 'details' in err) return 'postgrest'
  if ('status' in err && typeof (err as { status: number }).status === 'number') return 'fetch'
  return 'unknown'
}

const AUTH_MESSAGE_PATTERNS = [
  'jwt',
  'not authenticated',
  'invalid token',
  'token expired',
  'auth session missing',
  'authentication failed',
]

const RLS_MESSAGE_PATTERNS = [
  'row-level security',
  'new row violates row-level security',
  'permission denied',
]

function messageHasAnyPattern(msg: string, patterns: string[]): boolean {
  return patterns.some((pattern) => msg.includes(pattern))
}

export function classifySyncError(err: unknown): SyncErrorClassification {
  const httpStatus = extractHttpStatus(err)
  const pgCode = extractPgCode(err)
  const { constraint } = extractPgDetails(err)
  const messageSafe = extractSafeMessage(err)
  const provider = extractProvider(err)
  const msg = (messageSafe ?? '').toLowerCase()
  const hasAuthMessage = messageHasAnyPattern(msg, AUTH_MESSAGE_PATTERNS)
  const hasRlsMessage = messageHasAnyPattern(msg, RLS_MESSAGE_PATTERNS)

  // HTTP 401 / 419 => AUTH
  if (httpStatus === 401 || httpStatus === 419) {
    return {
      code: SyncErrorCode.AUTH,
      retryable: false,
      httpStatus,
      messageSafe,
      provider,
    }
  }

  if (pgCode === '42501') {
    return {
      code: SyncErrorCode.RLS,
      retryable: false,
      pgCode,
      messageSafe,
      provider,
    }
  }
  // HTTP 403 can indicate auth/session issues or RLS policy failures.
  if (httpStatus === 403) {
    if (hasAuthMessage) {
      return {
        code: SyncErrorCode.AUTH,
        retryable: false,
        httpStatus,
        messageSafe,
        provider,
      }
    }
    if (hasRlsMessage) {
      return {
        code: SyncErrorCode.RLS,
        retryable: false,
        httpStatus,
        messageSafe,
        provider,
      }
    }
    // Default 403 to AUTH to pause and avoid bricking on session-related denials.
    return {
      code: SyncErrorCode.AUTH,
      retryable: false,
      httpStatus,
      messageSafe,
      provider,
    }
  }

  // pg constraint codes
  if (pgCode === '23505') {
    return {
      code: SyncErrorCode.CONSTRAINT,
      retryable: false,
      pgCode,
      constraint: constraint ?? 'unique_violation',
      messageSafe,
      provider,
    }
  }
  if (pgCode === '23503') {
    return {
      code: SyncErrorCode.CONSTRAINT,
      retryable: false,
      pgCode,
      constraint: 'foreign_key_violation',
      messageSafe,
      provider,
    }
  }
  if (pgCode === '23502') {
    return {
      code: SyncErrorCode.CONSTRAINT,
      retryable: false,
      pgCode,
      constraint: 'not_null_violation',
      messageSafe,
      provider,
    }
  }
  if (pgCode === '23514') {
    return {
      code: SyncErrorCode.CONSTRAINT,
      retryable: false,
      pgCode,
      constraint: 'check_violation',
      messageSafe,
      provider,
    }
  }

  // 22xxx => VALIDATION (invalid input, format, etc.)
  if (pgCode && pgCode.startsWith('22')) {
    return {
      code: SyncErrorCode.VALIDATION,
      retryable: false,
      pgCode,
      messageSafe,
      provider,
    }
  }

  // HTTP 429 => RATE_LIMIT
  if (httpStatus === 429) {
    return {
      code: SyncErrorCode.RATE_LIMIT,
      retryable: true,
      httpStatus,
      messageSafe,
      provider,
    }
  }

  // HTTP 5xx => SERVER
  if (httpStatus && httpStatus >= 500 && httpStatus < 600) {
    return {
      code: SyncErrorCode.SERVER,
      retryable: true,
      httpStatus,
      messageSafe,
      provider,
    }
  }

  // HTTP 409 => CONFLICT
  if (httpStatus === 409) {
    return {
      code: SyncErrorCode.CONFLICT,
      retryable: true,
      httpStatus,
      messageSafe,
      provider,
    }
  }

  // Network / connectivity
  const networkPatterns = [
    'failed to fetch',
    'network request failed',
    'internet connection appears to be offline',
    'could not connect',
    'load failed',
    'unable to resolve host',
    'name resolution',
    'econnrefused',
    'enotfound',
    'econnreset',
    'econnaborted',
    'enetunreach',
    'ehostunreach',
    'enetdown',
    'socket hang up',
  ]
  if (networkPatterns.some((p) => msg.includes(p))) {
    return {
      code: SyncErrorCode.NETWORK,
      retryable: true,
      messageSafe,
      provider,
    }
  }

  // Timeout
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return {
      code: SyncErrorCode.TIMEOUT,
      retryable: true,
      messageSafe,
      provider,
    }
  }

  // RLS / permission in message (when no status)
  if (hasRlsMessage) {
    return {
      code: SyncErrorCode.RLS,
      retryable: false,
      messageSafe,
      provider,
    }
  }

  // Auth in message
  if (hasAuthMessage) {
    return {
      code: SyncErrorCode.AUTH,
      retryable: false,
      messageSafe,
      provider,
    }
  }

  // HTTP 400 => VALIDATION (client error, usually not retryable)
  if (httpStatus === 400) {
    return {
      code: SyncErrorCode.VALIDATION,
      retryable: false,
      httpStatus,
      messageSafe,
      provider,
    }
  }

  // Default: split UNKNOWN into retryable/fatal for deterministic handling.
  const looksTransient =
    !httpStatus ||
    (httpStatus >= 500 && httpStatus < 600) ||
    msg.includes('timeout') ||
    msg.includes('network')
  return {
    code: looksTransient ? SyncErrorCode.UNKNOWN_RETRYABLE : SyncErrorCode.UNKNOWN_FATAL,
    retryable: looksTransient,
    httpStatus,
    pgCode,
    messageSafe,
    provider,
  }
}
