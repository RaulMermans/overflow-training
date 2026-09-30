const GENERIC_MESSAGE = 'We could not complete that action. Please try again.'

type ActionableErrorKind = 'offline' | 'sync' | 'generic'

interface ErrorRule {
  pattern: RegExp
  message: string
  kind: ActionableErrorKind
}

const ERROR_RULES: ErrorRule[] = [
  // Schema mismatch / backend compatibility
  {
    pattern: /column .+ does not exist/i,
    message: 'Your data is out of sync with this app version. Try again after updating the app.',
    kind: 'sync',
  },
  {
    pattern: /relation .+ does not exist/i,
    message: 'Part of your workout data is unavailable right now. Please try again.',
    kind: 'sync',
  },
  {
    pattern: /PGRST106|the schema must be one of/i,
    message: 'Could not load some data. Try again or update the app.',
    kind: 'sync',
  },

  // RLS / permissions
  {
    pattern: /new row violates row-level security/i,
    message: 'You do not have permission for this action.',
    kind: 'generic',
  },
  {
    pattern: /permission denied/i,
    message: 'You do not have permission for this action.',
    kind: 'generic',
  },

  // Auth
  {
    pattern: /jwt expired/i,
    message: 'Your session expired. Please sign in again.',
    kind: 'generic',
  },
  {
    pattern: /not authenticated/i,
    message: 'Please sign in to continue.',
    kind: 'generic',
  },
  {
    pattern: /invalid.*token/i,
    message: 'Your session is no longer valid. Please sign in again.',
    kind: 'generic',
  },
  {
    pattern: /invalid login credentials/i,
    message:
      'Email or password is incorrect. If you signed up with Google, use "Continue with Google" instead.',
    kind: 'generic',
  },
  {
    pattern: /google oauth session failed/i,
    message: 'Google sign-in could not be completed. Please try again.',
    kind: 'generic',
  },

  // Constraint violations
  {
    pattern: /duplicate key value/i,
    message: 'This item already exists.',
    kind: 'generic',
  },
  {
    pattern: /violates check constraint/i,
    message: 'Some values are not valid. Please review and try again.',
    kind: 'generic',
  },
  {
    pattern: /violates foreign key constraint/i,
    message: 'A related item is no longer available. Refresh and try again.',
    kind: 'generic',
  },
  {
    pattern: /violates unique constraint/i,
    message: 'This item already exists.',
    kind: 'generic',
  },
  {
    pattern: /violates not-null constraint/i,
    message: 'A required value is missing.',
    kind: 'generic',
  },

  // Network / connectivity
  {
    pattern: /failed to fetch/i,
    message: 'You appear to be offline. Check your connection and try again.',
    kind: 'offline',
  },
  {
    pattern: /network request failed/i,
    message: 'You appear to be offline. Check your connection and try again.',
    kind: 'offline',
  },
  {
    pattern: /the internet connection appears to be offline/i,
    message: 'You appear to be offline. Check your connection and try again.',
    kind: 'offline',
  },
  {
    pattern: /could not connect to server/i,
    message: 'You appear to be offline. Check your connection and try again.',
    kind: 'offline',
  },
  {
    pattern: /load failed/i,
    message: 'You appear to be offline. Check your connection and try again.',
    kind: 'offline',
  },
  {
    pattern: /unable to resolve host|name resolution/i,
    message: 'You appear to be offline. Check your connection and try again.',
    kind: 'offline',
  },
  {
    pattern: /socket hang up|econnreset|econnaborted|enetunreach|ehostunreach|enetdown/i,
    message: 'You appear to be offline. Check your connection and try again.',
    kind: 'offline',
  },
  {
    pattern: /connection (?:was )?(?:lost|reset|aborted)/i,
    message: 'You appear to be offline. Check your connection and try again.',
    kind: 'offline',
  },
  {
    pattern: /timeout/i,
    message: 'The request timed out. Check your connection and try again.',
    kind: 'offline',
  },

  // Rate limiting
  {
    pattern: /too many requests/i,
    message: 'Too many requests right now. Please wait a moment and try again.',
    kind: 'generic',
  },
]

function toMessageString(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'string') return raw || null
  if (raw instanceof Error) return raw.message || null
  if (
    typeof raw === 'object' &&
    'message' in raw &&
    typeof (raw as { message: unknown }).message === 'string'
  ) {
    return (raw as { message: string }).message || null
  }
  const str = String(raw)
  return str === '[object Object]' ? null : str || null
}

export interface ActionableErrorState {
  kind: ActionableErrorKind
  message: string
  rawMessage: string | null
  primaryAction: 'retry' | 'check_connection'
}

export function buildActionableErrorState(raw: unknown): ActionableErrorState {
  const message = toMessageString(raw)
  if (!message) {
    return {
      kind: 'generic',
      message: GENERIC_MESSAGE,
      rawMessage: null,
      primaryAction: 'retry',
    }
  }

  const matched = ERROR_RULES.find((rule) => rule.pattern.test(message))
  if (matched) {
    return {
      kind: matched.kind,
      message: matched.message,
      rawMessage: message,
      primaryAction: matched.kind === 'offline' ? 'check_connection' : 'retry',
    }
  }

  return {
    kind: 'generic',
    message: GENERIC_MESSAGE,
    rawMessage: message,
    primaryAction: 'retry',
  }
}

export function sanitizeErrorMessage(raw: unknown): string {
  const message = toMessageString(raw)

  if (__DEV__) {
    if (message) {
      console.warn('[Supabase]', message)
    } else {
      console.warn('[Supabase]', raw)
    }
  }

  return buildActionableErrorState(raw).message
}
