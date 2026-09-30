jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(),
}))

import * as Linking from 'expo-linking'
import { getInitialURLWithTimeout } from '../src/auth/linkingTimeout'

const mockGetInitialURL = Linking.getInitialURL as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('getInitialURLWithTimeout', () => {
  it('returns the URL when Linking resolves before timeout', async () => {
    mockGetInitialURL.mockResolvedValue('workout-tracker-ios://login-callback?code=abc')

    const promise = getInitialURLWithTimeout()
    jest.advanceTimersByTime(100)
    const result = await promise

    expect(result).toBe('workout-tracker-ios://login-callback?code=abc')
  })

  it('returns null when Linking resolves with null', async () => {
    mockGetInitialURL.mockResolvedValue(null)

    const promise = getInitialURLWithTimeout()
    jest.advanceTimersByTime(100)
    const result = await promise

    expect(result).toBeNull()
  })

  it('returns null when Linking hangs past 5 seconds', async () => {
    mockGetInitialURL.mockReturnValue(new Promise(() => {}))

    const promise = getInitialURLWithTimeout()
    jest.advanceTimersByTime(5_000)
    const result = await promise

    expect(result).toBeNull()
  })

  it('returns the URL if Linking resolves just before timeout', async () => {
    mockGetInitialURL.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('workout-tracker-ios://reset-password?code=xyz'), 4_999)
        }),
    )

    const promise = getInitialURLWithTimeout()
    jest.advanceTimersByTime(4_999)
    const result = await promise

    expect(result).toBe('workout-tracker-ios://reset-password?code=xyz')
  })
})
