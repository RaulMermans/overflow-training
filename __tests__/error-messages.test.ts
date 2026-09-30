import { buildActionableErrorState, sanitizeErrorMessage } from '../src/utils/errorMessages'

describe('error message utilities', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation()
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('maps schema mismatch to calm sync guidance', () => {
    expect(sanitizeErrorMessage('column workouts.ended_at does not exist')).toBe(
      'Your data is out of sync with this app version. Try again after updating the app.',
    )
  })

  it('maps missing relation to sync guidance', () => {
    expect(sanitizeErrorMessage('relation "workouts" does not exist')).toBe(
      'Part of your workout data is unavailable right now. Please try again.',
    )
  })

  it('maps auth and permission issues', () => {
    expect(sanitizeErrorMessage('new row violates row-level security policy')).toBe(
      'You do not have permission for this action.',
    )
    expect(sanitizeErrorMessage('JWT expired')).toBe('Your session expired. Please sign in again.')
  })

  it('maps invalid login credentials with Google hint', () => {
    expect(sanitizeErrorMessage('Invalid login credentials')).toBe(
      'Email or password is incorrect. If you signed up with Google, use "Continue with Google" instead.',
    )
  })

  it('maps connectivity issues to offline-safe language', () => {
    expect(sanitizeErrorMessage('Failed to fetch')).toBe(
      'You appear to be offline. Check your connection and try again.',
    )
    expect(sanitizeErrorMessage('The Internet connection appears to be offline.')).toBe(
      'You appear to be offline. Check your connection and try again.',
    )
    expect(sanitizeErrorMessage('Load failed')).toBe(
      'You appear to be offline. Check your connection and try again.',
    )
    expect(sanitizeErrorMessage('request timeout')).toBe(
      'The request timed out. Check your connection and try again.',
    )
  })

  it('returns generic fallback for unknown or empty errors', () => {
    expect(sanitizeErrorMessage('unexpected unknown error')).toBe(
      'We could not complete that action. Please try again.',
    )
    expect(sanitizeErrorMessage(null)).toBe('We could not complete that action. Please try again.')
  })

  it('returns actionable state for offline errors', () => {
    expect(buildActionableErrorState('Network request failed')).toEqual({
      kind: 'offline',
      message: 'You appear to be offline. Check your connection and try again.',
      rawMessage: 'Network request failed',
      primaryAction: 'check_connection',
    })
  })

  it('returns actionable state for sync errors', () => {
    expect(buildActionableErrorState('column workouts.updated_at does not exist')).toEqual({
      kind: 'sync',
      message: 'Your data is out of sync with this app version. Try again after updating the app.',
      rawMessage: 'column workouts.updated_at does not exist',
      primaryAction: 'retry',
    })
  })

  it('returns generic actionable state for unknown errors', () => {
    expect(buildActionableErrorState({ code: 500 })).toEqual({
      kind: 'generic',
      message: 'We could not complete that action. Please try again.',
      rawMessage: null,
      primaryAction: 'retry',
    })
  })

  it('logs incoming errors for debugging in dev', () => {
    sanitizeErrorMessage(new Error('some message'))
    expect(warnSpy).toHaveBeenCalledWith('[Supabase]', 'some message')
  })
})
