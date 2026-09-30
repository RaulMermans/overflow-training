import * as SecureStore from 'expo-secure-store'
import { loadProfilePreferences, saveProfilePreferences } from '../src/lib/profilePreferences'

describe('profile preferences user-scoped storage', () => {
  const storage = new Map<string, string>()
  let getItemSpy: jest.SpyInstance
  let setItemSpy: jest.SpyInstance

  beforeEach(() => {
    storage.clear()
    getItemSpy = jest
      .spyOn(SecureStore, 'getItemAsync')
      .mockImplementation(async (key: string) => storage.get(key) ?? null)
    setItemSpy = jest
      .spyOn(SecureStore, 'setItemAsync')
      .mockImplementation(async (key: string, value: string) => {
        storage.set(key, value)
      })
  })

  afterEach(() => {
    getItemSpy.mockRestore()
    setItemSpy.mockRestore()
  })

  it('returns defaults when no stored preferences exist', async () => {
    const prefs = await loadProfilePreferences('user-1')
    expect(prefs.units).toBe('kg')
    expect(prefs.restTimerSeconds).toBe(90)
  })

  it('saves to and loads from user-scoped v2 key', async () => {
    await saveProfilePreferences('user-1', { units: 'kg', restTimerSeconds: 120 })

    const v2Key = 'profile.preferences.v2.user-1'
    expect(storage.has(v2Key)).toBe(true)

    const loaded = await loadProfilePreferences('user-1')
    expect(loaded.units).toBe('kg')
    expect(loaded.restTimerSeconds).toBe(120)
  })

  it('isolates preferences across different users', async () => {
    await saveProfilePreferences('user-1', { units: 'kg', restTimerSeconds: 60 })
    await saveProfilePreferences('user-2', { units: 'lb', restTimerSeconds: 180 })

    const p1 = await loadProfilePreferences('user-1')
    const p2 = await loadProfilePreferences('user-2')

    expect(p1.units).toBe('kg')
    expect(p2.units).toBe('lb')
    expect(p1.restTimerSeconds).toBe(60)
    expect(p2.restTimerSeconds).toBe(180)
  })

  it('migrates legacy global v1 prefs to v2 key on first user-scoped load', async () => {
    // Seed the legacy global key.
    storage.set('profile.preferences.v1', JSON.stringify({ units: 'kg', restTimerSeconds: 60 }))

    const loaded = await loadProfilePreferences('user-migrated')

    expect(loaded.units).toBe('kg')
    expect(loaded.restTimerSeconds).toBe(60)

    // Verify migration persisted the prefs under the v2 user-scoped key.
    const v2Key = 'profile.preferences.v2.user-migrated'
    expect(storage.has(v2Key)).toBe(true)
  })

  it('v2 user key takes precedence over legacy global key', async () => {
    storage.set('profile.preferences.v1', JSON.stringify({ units: 'lb', restTimerSeconds: 90 }))
    storage.set(
      'profile.preferences.v2.user-priority',
      JSON.stringify({ units: 'kg', restTimerSeconds: 30 }),
    )

    const loaded = await loadProfilePreferences('user-priority')
    // v2 wins; units coerced to kg regardless
    expect(loaded.units).toBe('kg')
    expect(loaded.restTimerSeconds).toBe(30)
  })

  it('legacy call without userId reads from global v1 key', async () => {
    storage.set('profile.preferences.v1', JSON.stringify({ units: 'kg', restTimerSeconds: 120 }))

    const loaded = await loadProfilePreferences()

    expect(loaded.units).toBe('kg')
    expect(loaded.restTimerSeconds).toBe(120)
  })

  it('legacy save without userId writes to global v1 key', async () => {
    await saveProfilePreferences({ units: 'kg', restTimerSeconds: 60 })

    expect(storage.has('profile.preferences.v1')).toBe(true)
    expect(storage.has('profile.preferences.v2.undefined')).toBe(false)
  })
})
