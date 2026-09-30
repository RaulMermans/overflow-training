import {
  GoogleCalendarError,
  shouldReconnect,
  toGoogleCalendarError,
} from '../src/features/googleCalendar/googleCalendarErrors'

describe('toGoogleCalendarError', () => {
  it('returns the same instance when already normalized', () => {
    const error = new GoogleCalendarError('syncFailed', 'Boom')

    expect(toGoogleCalendarError(error)).toBe(error)
  })

  it('classifies missing config errors', () => {
    const error = toGoogleCalendarError(new Error('Google client ID is not configured'))

    expect(error.code).toBe('missingConfig')
  })

  it('classifies oauth denial errors', () => {
    const error = toGoogleCalendarError(new Error('access_denied from Google'))

    expect(error.code).toBe('oauthDenied')
  })

  it('classifies state mismatch errors', () => {
    const error = toGoogleCalendarError(new Error('OAuth state mismatch'))

    expect(error.code).toBe('stateMismatch')
  })

  it('classifies token refresh failures as reconnectable', () => {
    const error = toGoogleCalendarError(new Error('token refresh failed'))

    expect(error.code).toBe('notConnected')
  })
})

describe('shouldReconnect', () => {
  it('returns true for reconnectable connection errors', () => {
    expect(shouldReconnect(new GoogleCalendarError('oauthDenied', 'Denied'))).toBe(true)
    expect(shouldReconnect(new GoogleCalendarError('stateMismatch', 'Mismatch'))).toBe(true)
    expect(shouldReconnect(new GoogleCalendarError('notConnected', 'Missing token'))).toBe(true)
  })

  it('returns false for non-reconnectable errors', () => {
    expect(
      shouldReconnect(new GoogleCalendarError('calendarListFailed', 'Calendar API failed')),
    ).toBe(false)
  })
})
