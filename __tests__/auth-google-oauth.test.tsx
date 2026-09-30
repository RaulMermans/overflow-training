import React from 'react'
import renderer, { act } from 'react-test-renderer'

var mockCurrentState = 'active'
var latestAuthContext: ReturnType<typeof import('../src/auth/useAuth').useAuth> | null = null

var mockSignInWithOAuth = jest.fn()
var mockExchangeCodeForSession = jest.fn()
var mockSetSession = jest.fn()
var mockOpenAuthSessionAsync = jest.fn()

jest.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mockCurrentState
    },
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}))

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'workout-tracker-ios://login-callback'),
}))

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSessionAsync(...args),
}))

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
      getSession: jest.fn().mockResolvedValue({
        data: { session: null },
      }),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
  supabaseStartupError: null,
  missingSupabaseEnvVars: [],
}))

jest.mock('../src/lib/supabaseClient', () => ({
  requireSupabase: jest.fn(() => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
      exchangeCodeForSession: mockExchangeCodeForSession,
      setSession: mockSetSession,
    },
  })),
}))

jest.mock('../src/features/sync/sessionCleanup', () => ({
  cleanupUserSessionBeforeSignOut: jest.fn(),
}))

jest.mock('../src/db/account', () => ({
  deleteCurrentUserAccount: jest.fn(),
}))

import { AuthProvider, useAuth } from '../src/auth/useAuth'

function AuthConsumer() {
  latestAuthContext = useAuth()
  return null
}

function renderProvider() {
  let tree: ReturnType<typeof renderer.create>
  act(() => {
    tree = renderer.create(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )
  })
  return tree!
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCurrentState = 'active'
  latestAuthContext = null
  mockSignInWithOAuth.mockResolvedValue({
    data: { url: 'https://example.com/oauth/google' },
    error: null,
  })
  mockExchangeCodeForSession.mockResolvedValue({ error: null })
  mockSetSession.mockResolvedValue({ error: null })
})

describe('signInWithGoogle', () => {
  it('completes the PKCE exchange from a successful auth session callback URL', async () => {
    renderProvider()
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'workout-tracker-ios://login-callback?code=google-code-1',
    })

    await act(async () => {
      await latestAuthContext!.signInWithGoogle()
    })

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'workout-tracker-ios://login-callback',
        skipBrowserRedirect: true,
      },
    })
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      'https://example.com/oauth/google',
      'workout-tracker-ios://login-callback',
      { dismissButtonStyle: 'cancel' },
    )
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('google-code-1')
    expect(mockSetSession).not.toHaveBeenCalled()
  })

  it('restores the session from returned tokens when the callback uses a hash fragment', async () => {
    renderProvider()
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'workout-tracker-ios://login-callback#access_token=access-1&refresh_token=refresh-1',
    })

    await act(async () => {
      await latestAuthContext!.signInWithGoogle()
    })

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
    })
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('returns cleanly when the auth session is cancelled', async () => {
    renderProvider()
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' })

    await act(async () => {
      await latestAuthContext!.signInWithGoogle()
    })

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
    expect(mockSetSession).not.toHaveBeenCalled()
  })

  it('throws a specific error when the auth session returns an invalid callback URL', async () => {
    renderProvider()
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'workout-tracker-ios://login-callback?state=missing-auth-data',
    })

    let thrownError: unknown = null

    try {
      await act(async () => {
        await latestAuthContext!.signInWithGoogle()
      })
    } catch (error: unknown) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(Error)
    expect((thrownError as Error).message).toBe('Google OAuth session failed: invalid callback URL')
  })
})
