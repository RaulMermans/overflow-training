/**
 * Tests for AppState-driven auto-refresh lifecycle in AuthProvider.
 *
 * AC1: foreground (active)   → startAutoRefresh called
 * AC2: background/inactive   → stopAutoRefresh called
 * AC3: session null/sign-out → stopAutoRefresh called
 */

import React from 'react'
import renderer, { act } from 'react-test-renderer'

// ── Mutable state shared with hoisted mock factories ─────────────────────────
// Must be `var` because jest.mock is hoisted before declarations; `var` avoids TDZ.
var capturedAppStateHandler: ((state: string) => void) | null = null
var mockCurrentState = 'active'
var capturedAuthStateHandler: ((_event: string, session: object | null) => void) | null = null

// ── AppState mock ─────────────────────────────────────────────────────────────
jest.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mockCurrentState
    },
    addEventListener: jest.fn((_event: string, handler: (state: string) => void) => {
      capturedAppStateHandler = handler
      return { remove: jest.fn() }
    }),
  },
}))

// expo-linking triggers expo-modules-core native deps; mock the surface used by useAuth
jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'workout-tracker-ios://mock'),
  openURL: jest.fn(),
}))

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}))

// ── Supabase mock ─────────────────────────────────────────────────────────────
// IMPORTANT: jest.fn() instances must live INSIDE the factory (not in outer const/let
// declarations) because all `import` statements are hoisted before regular statements by
// babel-jest. If we used outer `const mockStart = jest.fn()`, that const would not yet be
// initialised when the factory runs (the factory executes when '../src/auth/useAuth' is
// first require()'d as part of the hoisted import block). Accessing those from the mock
// module reference below is safe because both sides see the same factory-created instances.
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'u1' } } },
      }),
      onAuthStateChange: jest.fn((handler: (_event: string, session: object | null) => void) => {
        capturedAuthStateHandler = handler
        return { data: { subscription: { unsubscribe: jest.fn() } } }
      }),
    },
  },
  supabaseStartupError: null,
  missingSupabaseEnvVars: [],
}))

jest.mock('../src/lib/supabaseClient', () => ({ requireSupabase: jest.fn() }))
jest.mock('../src/features/sync/sessionCleanup', () => ({
  cleanupUserSessionBeforeSignOut: jest.fn(),
}))
jest.mock('../src/db/account', () => ({ deleteCurrentUserAccount: jest.fn() }))

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { supabase } from '../src/lib/supabase'
import { AuthProvider } from '../src/auth/useAuth'

// Typed helpers to reference the jest.fn() instances inside the factory
const startFn = () =>
  (supabase!.auth as unknown as { startAutoRefresh: jest.MockedFunction<() => Promise<void>> })
    .startAutoRefresh
const stopFn = () =>
  (supabase!.auth as unknown as { stopAutoRefresh: jest.MockedFunction<() => Promise<void>> })
    .stopAutoRefresh

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderProvider() {
  let tree: ReturnType<typeof renderer.create>
  act(() => {
    tree = renderer.create(
      <AuthProvider>
        <></>
      </AuthProvider>,
    )
  })
  return tree!
}

// ── Tests ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks()
  capturedAppStateHandler = null
  capturedAuthStateHandler = null
  mockCurrentState = 'active'
})

describe('AuthProvider AppState auto-refresh', () => {
  it('AC1: calls startAutoRefresh when AppState transitions to active', () => {
    mockCurrentState = 'background'
    renderProvider()

    // Simulate app coming to foreground
    act(() => {
      capturedAppStateHandler!('active')
    })

    expect(startFn()).toHaveBeenCalled()
  })

  it('AC2: calls stopAutoRefresh when AppState transitions to background', () => {
    renderProvider()

    act(() => {
      capturedAppStateHandler!('background')
    })

    expect(stopFn()).toHaveBeenCalled()
  })

  it('AC2b: calls stopAutoRefresh when AppState transitions to inactive', () => {
    renderProvider()

    act(() => {
      capturedAppStateHandler!('inactive')
    })

    expect(stopFn()).toHaveBeenCalled()
  })

  it('AC3: calls stopAutoRefresh when onAuthStateChange fires with null session', () => {
    renderProvider()
    stopFn().mockClear()

    act(() => {
      capturedAuthStateHandler!('SIGNED_OUT', null)
    })

    expect(stopFn()).toHaveBeenCalled()
  })

  it('does not call stopAutoRefresh when onAuthStateChange fires with a valid session', () => {
    renderProvider()
    stopFn().mockClear()

    act(() => {
      capturedAuthStateHandler!('TOKEN_REFRESHED', { user: { id: 'u1' } })
    })

    expect(stopFn()).not.toHaveBeenCalled()
  })
})
