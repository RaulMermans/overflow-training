import React from 'react'
import renderer, { act } from 'react-test-renderer'

var mockGetInitialURLWithTimeout = jest.fn()
var mockExchangeCodeForSession = jest.fn()
var mockSetSessionFromTokens = jest.fn()
var mockSignInWithGoogle = jest.fn()
var mockRouterReplace = jest.fn()
var mockCodeParam: string | undefined

const mockRouter = { replace: (...args: unknown[]) => mockRouterReplace(...args) }
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ code: mockCodeParam }),
}))

jest.mock('../src/auth/linkingTimeout', () => ({
  getInitialURLWithTimeout: (...args: unknown[]) => mockGetInitialURLWithTimeout(...args),
}))

jest.mock('../src/auth/useAuth', () => ({
  useAuth: () => ({
    exchangeCodeForSession: mockExchangeCodeForSession,
    setSessionFromTokens: mockSetSessionFromTokens,
    signInWithGoogle: mockSignInWithGoogle,
  }),
}))

let mockHandledCodes: Set<string>

jest.mock('../src/auth/resetPasswordLink', () => {
  return {
    get hasHandledAuthCallbackCode() {
      return (code: string) => mockHandledCodes.has(code)
    },
    get markAuthCallbackCodeHandled() {
      return (code: string) => mockHandledCodes.add(code)
    },
    parseAuthCallbackParams: jest.requireActual('../src/auth/resetPasswordLink')
      .parseAuthCallbackParams,
  }
})

jest.mock('../src/components/ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MockReact = require('react')
  const RN = jest.requireActual('react-native')
  return {
    Box: RN.View,
    Text: RN.Text,
    Screen: ({ children }: { children: unknown }) =>
      MockReact.createElement(RN.View, null, children),
    Button: ({ title, onPress }: { title: string; onPress?: () => void }) =>
      MockReact.createElement(
        RN.TouchableOpacity,
        { onPress, testID: 'button' },
        MockReact.createElement(RN.Text, null, title),
      ),
    Pressable: ({
      children,
      ...props
    }: {
      children: ((state: { pressed: boolean }) => unknown) | unknown
      onPress?: () => void
    }) => {
      const resolved = typeof children === 'function' ? children({ pressed: false }) : children
      return MockReact.createElement(RN.TouchableOpacity, props, resolved)
    },
  }
})

const mockT = (key: string) => key
jest.mock('../src/i18n/useI18n', () => ({
  useI18n: () => ({ t: mockT }),
}))

jest.mock('../src/theme', () => ({
  colors: { accent: { primary: '#000' } },
}))

jest.mock('../src/utils/errorMessages', () => ({
  sanitizeErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}))

import LoginCallbackScreen from '../app/(auth)/login-callback'

const flushMicrotasks = () =>
  act(async () => {
    await new Promise((resolve) => setImmediate(resolve))
  })

beforeEach(() => {
  jest.clearAllMocks()
  mockCodeParam = undefined
  mockHandledCodes = new Set()
  mockExchangeCodeForSession.mockResolvedValue(undefined)
  mockSetSessionFromTokens.mockResolvedValue(undefined)
  mockGetInitialURLWithTimeout.mockResolvedValue(null)
})

describe('LoginCallbackScreen', () => {
  it('exchanges code from route params and navigates to root', async () => {
    mockCodeParam = 'route-code-1'

    await act(async () => {
      renderer.create(React.createElement(LoginCallbackScreen))
    })

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('route-code-1')
    expect(mockRouterReplace).toHaveBeenCalledWith('/')
  })

  it('exchanges code from initial URL when no route param', async () => {
    mockGetInitialURLWithTimeout.mockResolvedValue(
      'workout-tracker-ios://login-callback?code=url-code-1',
    )

    act(() => {
      renderer.create(React.createElement(LoginCallbackScreen))
    })
    await flushMicrotasks()

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('url-code-1')
    expect(mockRouterReplace).toHaveBeenCalledWith('/')
  })

  it('sets session from tokens in initial URL hash fragment', async () => {
    mockGetInitialURLWithTimeout.mockResolvedValue(
      'workout-tracker-ios://login-callback#access_token=at-1&refresh_token=rt-1',
    )

    act(() => {
      renderer.create(React.createElement(LoginCallbackScreen))
    })
    await flushMicrotasks()

    expect(mockSetSessionFromTokens).toHaveBeenCalledWith('at-1', 'rt-1')
    expect(mockRouterReplace).toHaveBeenCalledWith('/')
  })

  it('shows timeout error when initial URL is null', async () => {
    mockGetInitialURLWithTimeout.mockResolvedValue(null)

    let tree: ReturnType<typeof renderer.create>
    act(() => {
      tree = renderer.create(React.createElement(LoginCallbackScreen))
    })
    await flushMicrotasks()

    const jsonStr = JSON.stringify(tree!.toJSON())
    expect(jsonStr).toContain('auth.oauth.callbackTimeout')
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('shows error when code exchange fails', async () => {
    mockCodeParam = 'bad-code'
    mockExchangeCodeForSession.mockRejectedValue(new Error('exchange failed'))

    let tree: ReturnType<typeof renderer.create>
    await act(async () => {
      tree = renderer.create(React.createElement(LoginCallbackScreen))
    })
    await flushMicrotasks()

    const jsonStr = JSON.stringify(tree!.toJSON())
    expect(jsonStr).toContain('exchange failed')
  })
})
