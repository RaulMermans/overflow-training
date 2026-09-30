import React from 'react'
import renderer, { act } from 'react-test-renderer'

var mockGetInitialURLWithTimeout = jest.fn()
var mockExchangeCodeForSession = jest.fn()
var mockSetSessionFromTokens = jest.fn()
var mockUpdatePassword = jest.fn()
var mockRouterReplace = jest.fn()
var mockAddEventListener = jest.fn(() => ({ remove: jest.fn() }))

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}))

jest.mock('expo-linking', () => ({
  addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
}))

jest.mock('../src/auth/linkingTimeout', () => ({
  getInitialURLWithTimeout: (...args: unknown[]) => mockGetInitialURLWithTimeout(...args),
}))

jest.mock('../src/auth/useAuth', () => ({
  useAuth: () => ({
    exchangeCodeForSession: mockExchangeCodeForSession,
    setSessionFromTokens: mockSetSessionFromTokens,
    updatePassword: mockUpdatePassword,
  }),
}))

jest.mock('../src/auth/resetPasswordLink', () =>
  jest.requireActual('../src/auth/resetPasswordLink'),
)

jest.mock('../src/components/ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MockReact = require('react')
  const RN = jest.requireActual('react-native')
  return {
    Box: RN.View,
    Text: RN.Text,
    Input: RN.TextInput,
    Screen: ({ children }: { children: unknown }) =>
      MockReact.createElement(RN.View, null, children),
    Button: ({
      title,
      onPress,
      disabled,
    }: {
      title: string
      onPress?: () => void
      disabled?: boolean
    }) =>
      MockReact.createElement(
        RN.TouchableOpacity,
        { onPress, testID: 'submit-button', disabled },
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

jest.mock('../src/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

jest.mock('../src/theme', () => ({
  colors: { accent: { primary: '#000' } },
}))

jest.mock('../src/utils/errorMessages', () => ({
  sanitizeErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}))

import ResetPasswordScreen from '../app/(auth)/reset-password'

function render() {
  let tree: ReturnType<typeof renderer.create>
  act(() => {
    tree = renderer.create(React.createElement(ResetPasswordScreen))
  })
  return tree!
}

const flushMicrotasks = () =>
  act(async () => {
    await new Promise((resolve) => setImmediate(resolve))
  })

beforeEach(() => {
  jest.clearAllMocks()
  mockExchangeCodeForSession.mockResolvedValue(undefined)
  mockSetSessionFromTokens.mockResolvedValue(undefined)
  mockUpdatePassword.mockResolvedValue(undefined)
  mockGetInitialURLWithTimeout.mockResolvedValue(null)
})

describe('ResetPasswordScreen', () => {
  it('exchanges code from initial URL', async () => {
    mockGetInitialURLWithTimeout.mockResolvedValue(
      'workout-tracker-ios://reset-password?code=reset-code-1',
    )

    render()
    await flushMicrotasks()

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('reset-code-1')
  })

  it('sets session from tokens in initial URL', async () => {
    mockGetInitialURLWithTimeout.mockResolvedValue(
      'workout-tracker-ios://reset-password#access_token=at-2&refresh_token=rt-2',
    )

    render()
    await flushMicrotasks()

    expect(mockSetSessionFromTokens).toHaveBeenCalledWith('at-2', 'rt-2')
  })

  it('shows error when initial URL is null', async () => {
    mockGetInitialURLWithTimeout.mockResolvedValue(null)

    let tree: ReturnType<typeof renderer.create>
    act(() => {
      tree = renderer.create(React.createElement(ResetPasswordScreen))
    })
    await flushMicrotasks()

    const jsonStr = JSON.stringify(tree!.toJSON())
    expect(jsonStr).toContain('auth.reset.openLink')
  })

  it('shows error when code exchange fails', async () => {
    mockGetInitialURLWithTimeout.mockResolvedValue(
      'workout-tracker-ios://reset-password?code=bad-code',
    )
    mockExchangeCodeForSession.mockRejectedValue(new Error('code expired'))

    let tree: ReturnType<typeof renderer.create>
    act(() => {
      tree = renderer.create(React.createElement(ResetPasswordScreen))
    })
    await flushMicrotasks()

    const jsonStr = JSON.stringify(tree!.toJSON())
    expect(jsonStr).toContain('code expired')
  })

  it('navigates to root after successful password update', async () => {
    mockGetInitialURLWithTimeout.mockResolvedValue(
      'workout-tracker-ios://reset-password?code=good-code',
    )

    let tree: ReturnType<typeof renderer.create>
    act(() => {
      tree = renderer.create(React.createElement(ResetPasswordScreen))
    })
    await flushMicrotasks()

    // Simulate entering matching passwords and submitting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputs = tree!.root.findAllByType('TextInput' as any)
    await act(async () => {
      inputs[0].props.onChangeText('newPass123!')
      inputs[1].props.onChangeText('newPass123!')
    })

    const submitButton = tree!.root.findByProps({ testID: 'submit-button' })
    await act(async () => {
      await submitButton.props.onPress()
    })

    expect(mockUpdatePassword).toHaveBeenCalledWith('newPass123!')
    expect(mockRouterReplace).toHaveBeenCalledWith('/')
  })

  it('registers URL event listener for deep links arriving after mount', async () => {
    mockGetInitialURLWithTimeout.mockResolvedValue(null)

    render()
    await flushMicrotasks()

    expect(mockAddEventListener).toHaveBeenCalledWith('url', expect.any(Function))
  })
})
