import * as SecureStore from 'expo-secure-store'
import {
  runAccountUpgrade,
  clearAccountUpgradeMarker,
} from '../src/features/accountUpgrade/runAccountUpgrade'

// Mock all dependencies so this test exercises only the versioning logic.
jest.mock('../src/features/sync/routinesPlans/migrateLocalToCloud', () => ({
  migrateLocalRoutinesAndPlansForSync: jest.fn().mockResolvedValue({
    applied: false,
    routinesCount: 0,
  }),
}))

jest.mock('../src/db/workouts', () => ({
  fetchExerciseDefinitionSyncIndex: jest.fn().mockResolvedValue({
    data: [],
    error: null,
  }),
}))

jest.mock('../src/lib/routines', () => ({
  loadRoutines: jest.fn().mockResolvedValue([]),
  replaceRoutinesSnapshot: jest.fn().mockResolvedValue(undefined),
}))

describe('runAccountUpgrade versioning', () => {
  const storage = new Map<string, string>()
  let getItemSpy: jest.SpyInstance
  let setItemSpy: jest.SpyInstance
  let deleteItemSpy: jest.SpyInstance

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
    deleteItemSpy = jest
      .spyOn(SecureStore, 'deleteItemAsync')
      .mockImplementation(async (key: string) => {
        storage.delete(key)
      })
  })

  afterEach(() => {
    getItemSpy.mockRestore()
    setItemSpy.mockRestore()
    deleteItemSpy.mockRestore()
    jest.clearAllMocks()
  })

  it('runs steps and writes the v2 upgrade marker on first run', async () => {
    const result = await runAccountUpgrade('user-1')

    expect(result.userId).toBe('user-1')
    expect(result.steps).toHaveLength(2)
    expect(result.repairForced).toBe(false)

    const markerKey = 'account.upgrade.v2.user-1'
    expect(storage.get(markerKey)).toBe('2')
  })

  it('skips all steps and returns empty result when upgrade marker already set', async () => {
    storage.set('account.upgrade.v2.user-1', '2')

    const result = await runAccountUpgrade('user-1')

    expect(result.steps).toHaveLength(0)
    expect(result.legacyItemsScanned).toBe(0)
  })

  it('re-runs upgrade when forced=true even if marker is set', async () => {
    storage.set('account.upgrade.v2.user-1', '2')

    const result = await runAccountUpgrade('user-1', { forced: true })

    expect(result.steps).toHaveLength(2)
    expect(result.repairForced).toBe(true)
  })

  it('clears the upgrade marker for a given user', async () => {
    storage.set('account.upgrade.v2.user-1', '2')

    await clearAccountUpgradeMarker('user-1')

    expect(storage.get('account.upgrade.v2.user-1')).toBeUndefined()
  })

  it('returns empty result for empty userId', async () => {
    const result = await runAccountUpgrade('')

    expect(result.userId).toBe('')
    expect(result.steps).toHaveLength(0)
  })

  it('records step error without throwing when a step fails', async () => {
    const workouts = jest.requireMock('../src/db/workouts') as {
      fetchExerciseDefinitionSyncIndex: jest.Mock & {
        mockRejectedValueOnce: (value: unknown) => jest.Mock
      }
    }
    workouts.fetchExerciseDefinitionSyncIndex.mockRejectedValueOnce(new Error('Network error'))

    const result = await runAccountUpgrade('user-2')

    const repairStep = result.steps.find((s) => s.stepId === 'repair_exercise_refs')
    expect(repairStep).toBeDefined()
    expect(repairStep?.applied).toBe(false)
    expect(repairStep?.error).toContain('Network error')

    // Marker still written so we don't retry on every session start.
    expect(storage.get('account.upgrade.v2.user-2')).toBe('2')
  })

  it('skips repair_exercise_refs when exercise index is empty', async () => {
    const { fetchExerciseDefinitionSyncIndex } = jest.requireMock('../src/db/workouts') as {
      fetchExerciseDefinitionSyncIndex: jest.Mock
    }
    fetchExerciseDefinitionSyncIndex.mockResolvedValueOnce({ data: [], error: null })

    const result = await runAccountUpgrade('user-3')

    const repairStep = result.steps.find((s) => s.stepId === 'repair_exercise_refs')
    expect(repairStep?.applied).toBe(false)
    expect(repairStep?.skipped).toBe(true)
    expect(repairStep?.error).toBeNull()
  })
})
