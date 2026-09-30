export type GoogleCalendarErrorCode =
  | 'missingConfig'
  | 'oauthDenied'
  | 'invalidCallback'
  | 'stateMismatch'
  | 'notConnected'
  | 'calendarListFailed'
  | 'connectFailed'
  | 'syncFailed'
  | 'disconnectFailed'
  | 'unknown'

export class GoogleCalendarError extends Error {
  code: GoogleCalendarErrorCode
  detail: string | null

  constructor(code: GoogleCalendarErrorCode, message: string, detail?: string | null) {
    super(message)
    this.name = 'GoogleCalendarError'
    this.code = code
    this.detail = detail ?? null
  }
}

export function toGoogleCalendarError(
  error: unknown,
  fallbackCode: GoogleCalendarErrorCode = 'unknown',
): GoogleCalendarError {
  if (error instanceof GoogleCalendarError) return error

  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (normalized.includes('client id') || normalized.includes('not configured')) {
    return new GoogleCalendarError('missingConfig', message, message)
  }

  if (normalized.includes('access_denied')) {
    return new GoogleCalendarError('oauthDenied', message, message)
  }

  if (normalized.includes('state')) {
    return new GoogleCalendarError('stateMismatch', message, message)
  }

  if (normalized.includes('callback') || normalized.includes('authorization code')) {
    return new GoogleCalendarError('invalidCallback', message, message)
  }

  if (
    normalized.includes('not connected') ||
    normalized.includes('refresh') ||
    normalized.includes('token')
  ) {
    return new GoogleCalendarError('notConnected', message, message)
  }

  if (normalized.includes('calendar')) {
    return new GoogleCalendarError('calendarListFailed', message, message)
  }

  return new GoogleCalendarError(fallbackCode, message, message)
}

export function shouldReconnect(error: GoogleCalendarError): boolean {
  return (
    error.code === 'oauthDenied' || error.code === 'stateMismatch' || error.code === 'notConnected'
  )
}
