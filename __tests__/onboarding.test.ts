import * as SecureStore from 'expo-secure-store'
import { loadOnboardingCompleted, setOnboardingCompleted } from '../src/lib/onboarding'

describe('onboarding persistence', () => {
  const storage = new Map<string, string>()
  let getItemAsyncSpy: jest.SpyInstance
  let setItemAsyncSpy: jest.SpyInstance

  beforeEach(() => {
    storage.clear()
    getItemAsyncSpy = jest.spyOn(SecureStore, 'getItemAsync')
    setItemAsyncSpy = jest.spyOn(SecureStore, 'setItemAsync')

    getItemAsyncSpy.mockImplementation(async (key: string) => storage.get(key) ?? null)
    setItemAsyncSpy.mockImplementation(async (key: string, value: string) => {
      storage.set(key, value)
    })
  })

  afterEach(() => {
    getItemAsyncSpy.mockRestore()
    setItemAsyncSpy.mockRestore()
  })

  it('returns false by default when no onboarding flag is stored', async () => {
    await expect(loadOnboardingCompleted('user-1')).resolves.toBe(false)
  })

  it('returns true after onboarding is marked complete', async () => {
    await setOnboardingCompleted('user-1')
    await expect(loadOnboardingCompleted('user-1')).resolves.toBe(true)
  })

  it('isolates completion flags by user id key', async () => {
    await setOnboardingCompleted('user-1', true)
    await setOnboardingCompleted('user-2', false)

    await expect(loadOnboardingCompleted('user-1')).resolves.toBe(true)
    await expect(loadOnboardingCompleted('user-2')).resolves.toBe(false)
  })

  it('returns false when secure storage read fails', async () => {
    getItemAsyncSpy.mockImplementation(async () => {
      throw new Error('storage unavailable')
    })
    await expect(loadOnboardingCompleted('user-1')).resolves.toBe(false)
  })
})
