import * as SecureStore from 'expo-secure-store'
import {
  getExerciseDefault,
  loadExerciseDefaults,
  setExerciseDefault,
} from '../src/lib/exerciseDefaults'

describe('exercise defaults storage', () => {
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

  it('returns empty map when no defaults are stored', async () => {
    await expect(loadExerciseDefaults('user-1')).resolves.toEqual({})
  })

  it('sets and gets defaults', async () => {
    await setExerciseDefault('user-1', 'bench-press', {
      defaultSets: 4,
      defaultReps: 8,
    })

    await expect(getExerciseDefault('user-1', 'bench-press')).resolves.toEqual({
      defaultSets: 4,
      defaultReps: 8,
    })
  })

  it('patches one field without clearing the other', async () => {
    await setExerciseDefault('user-1', 'bench-press', {
      defaultSets: 3,
      defaultReps: 10,
    })
    await setExerciseDefault('user-1', 'bench-press', { defaultSets: 5 })

    await expect(getExerciseDefault('user-1', 'bench-press')).resolves.toEqual({
      defaultSets: 5,
      defaultReps: 10,
    })
  })

  it('drops defaults when values are invalid', async () => {
    await setExerciseDefault('user-1', 'bench-press', {
      defaultSets: 3,
      defaultReps: 8,
    })
    await setExerciseDefault('user-1', 'bench-press', {
      defaultSets: 99,
      defaultReps: 0,
    })

    await expect(getExerciseDefault('user-1', 'bench-press')).resolves.toBeNull()
  })

  it('isolates defaults by user key', async () => {
    await setExerciseDefault('user-1', 'bench-press', { defaultSets: 3 })
    await setExerciseDefault('user-2', 'bench-press', { defaultSets: 5 })

    await expect(getExerciseDefault('user-1', 'bench-press')).resolves.toEqual({
      defaultSets: 3,
      defaultReps: undefined,
    })
    await expect(getExerciseDefault('user-2', 'bench-press')).resolves.toEqual({
      defaultSets: 5,
      defaultReps: undefined,
    })
  })

  it('returns empty map when secure storage read fails', async () => {
    getItemAsyncSpy.mockImplementation(async () => {
      throw new Error('storage unavailable')
    })

    await expect(loadExerciseDefaults('user-1')).resolves.toEqual({})
    await expect(getExerciseDefault('user-1', 'bench-press')).resolves.toBeNull()
  })

  it('returns empty defaults for malformed payloads', async () => {
    storage.set('exercise.defaults.v1.user-1', '{"broken": true')

    await expect(loadExerciseDefaults('user-1')).resolves.toEqual({})
    await expect(getExerciseDefault('user-1', 'bench-press')).resolves.toBeNull()
  })

  it('does not throw when secure storage write fails', async () => {
    setItemAsyncSpy.mockImplementation(async () => {
      throw new Error('storage unavailable')
    })

    await expect(
      setExerciseDefault('user-1', 'bench-press', {
        defaultSets: 4,
        defaultReps: 8,
      }),
    ).resolves.toBeUndefined()
  })
})
