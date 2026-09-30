import { supabase, supabaseStartupError } from './supabase'

type ErrorLike =
  | {
      message?: string | null
      code?: string | null
      details?: string | null
      hint?: string | null
      status?: number | null
    }
  | Error
  | null

export class DatabaseError extends Error {
  code: string | null
  details: string | null
  hint: string | null
  status: number | null

  constructor(input: {
    message: string
    code?: string | null
    details?: string | null
    hint?: string | null
    status?: number | null
  }) {
    super(input.message)
    this.name = 'DatabaseError'
    this.code = input.code ?? null
    this.details = input.details ?? null
    this.hint = input.hint ?? null
    this.status = input.status ?? null
  }
}

export function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseStartupError ?? 'Supabase client is not initialized.')
  }
  return supabase
}

export function normalizeDbResult<T>(result: { data: T | null; error: ErrorLike }): {
  data: T | null
  error: Error | null
} {
  if (!result.error) {
    return { data: result.data, error: null }
  }

  if (result.error instanceof Error) {
    return { data: result.data, error: result.error }
  }

  const message = typeof result.error.message === 'string' ? result.error.message.trim() : ''
  const code = typeof result.error.code === 'string' ? result.error.code.trim() : null
  const details =
    typeof result.error.details === 'string' ? result.error.details : (result.error.details ?? null)
  const hint =
    typeof result.error.hint === 'string' ? result.error.hint : (result.error.hint ?? null)
  const status =
    typeof result.error.status === 'number' && Number.isFinite(result.error.status)
      ? result.error.status
      : null

  return {
    data: result.data,
    error: new DatabaseError({
      message: message && message.length > 0 ? message : 'Unknown database error.',
      code,
      details,
      hint,
      status,
    }),
  }
}
