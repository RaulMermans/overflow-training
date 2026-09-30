import * as SecureStore from 'expo-secure-store'
import {
  getWorkoutProgramContext,
  getWorkoutRoutine,
  loadWorkoutMeta,
  setWorkoutProgramContext,
  setWorkoutRoutine,
  setWorkoutCreatedFromManual,
} from '../src/lib/workoutMetadata'

describe('workout metadata storage', () => {
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

  it('loads empty map by default', async () => {
    await expect(loadWorkoutMeta('user-1')).resolves.toEqual({})
  })

  it('sets and gets routine mapping', async () => {
    await setWorkoutRoutine('user-1', 'workout-1', 'routine-1')

    await expect(getWorkoutRoutine('user-1', 'workout-1')).resolves.toBe('routine-1')

    const all = await loadWorkoutMeta('user-1')
    expect(all['workout-1'].routineId).toBe('routine-1')
    expect(all['workout-1'].createdFrom).toBe('routine')
    expect(typeof all['workout-1'].createdAt).toBe('string')
  })

  it('can mark workout as manual', async () => {
    await setWorkoutCreatedFromManual('user-1', 'workout-2')

    const all = await loadWorkoutMeta('user-1')
    expect(all['workout-2'].createdFrom).toBe('manual')
    expect(all['workout-2'].routineId).toBeUndefined()
  })

  it('isolates by user key', async () => {
    await setWorkoutRoutine('user-1', 'workout-1', 'routine-1')
    await setWorkoutRoutine('user-2', 'workout-1', 'routine-2')

    await expect(getWorkoutRoutine('user-1', 'workout-1')).resolves.toBe('routine-1')
    await expect(getWorkoutRoutine('user-2', 'workout-1')).resolves.toBe('routine-2')
  })

  it('returns empty map when secure storage fails', async () => {
    getItemAsyncSpy.mockImplementation(async () => {
      throw new Error('storage unavailable')
    })

    await expect(loadWorkoutMeta('user-1')).resolves.toEqual({})
    await expect(getWorkoutRoutine('user-1', 'workout-1')).resolves.toBeNull()
  })

  it('returns empty map for malformed payloads', async () => {
    storage.set('workout.meta.v1.user-1', '{"broken": true')

    await expect(loadWorkoutMeta('user-1')).resolves.toEqual({})
    await expect(getWorkoutRoutine('user-1', 'workout-1')).resolves.toBeNull()
  })

  it('updates routine mapping without changing original createdAt', async () => {
    await setWorkoutRoutine('user-1', 'workout-1', 'routine-a')
    const first = await loadWorkoutMeta('user-1')
    const createdAt = first['workout-1']?.createdAt

    await setWorkoutRoutine('user-1', 'workout-1', 'routine-b')
    const updated = await loadWorkoutMeta('user-1')

    expect(updated['workout-1']?.routineId).toBe('routine-b')
    expect(updated['workout-1']?.createdAt).toBe(createdAt)
  })

  it('sets and gets program context', async () => {
    await setWorkoutProgramContext('user-1', 'workout-3', {
      programId: 'ppl',
      programNameKey: 'programs.template.ppl.name',
      workoutTemplateId: 'push',
      workoutNameKey: 'programs.workout.push',
      dayKey: 'mon',
      targets: [
        {
          slug: 'bench-press',
          exerciseDefinitionId: 'def-bench',
          sets: 4,
          reps: 6,
          type: 'compound',
          restSeconds: 150,
        },
      ],
    })

    const context = await getWorkoutProgramContext('user-1', 'workout-3')
    expect(context).not.toBeNull()
    expect(context?.programId).toBe('ppl')
    expect(context?.targets[0]?.exerciseDefinitionId).toBe('def-bench')
  })

  it('ignores malformed stored program context and remains backward compatible', async () => {
    storage.set(
      'workout.meta.v1.user-1',
      JSON.stringify({
        'workout-4': {
          createdAt: new Date().toISOString(),
          createdFrom: 'manual',
          programContext: {
            programId: 'ppl',
            dayKey: 'bad-day',
            targets: [],
          },
        },
      }),
    )

    const all = await loadWorkoutMeta('user-1')
    expect(all['workout-4']?.createdFrom).toBe('manual')
    expect(all['workout-4']?.programContext).toBeUndefined()
    await expect(getWorkoutProgramContext('user-1', 'workout-4')).resolves.toBeNull()
  })
})
