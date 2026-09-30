import * as SecureStore from 'expo-secure-store'
import {
  bumpRoutineUsage,
  deleteRoutine,
  loadRoutineUsage,
  loadRoutines,
  setPinnedRoutine,
  upsertRoutine,
  saveRoutine,
  type Routine,
} from '../src/lib/routines'

describe('routines storage', () => {
  const storage = new Map<string, string>()
  let getItemAsyncSpy: jest.SpyInstance
  let setItemAsyncSpy: jest.SpyInstance

  const baseRoutine: Routine = {
    id: 'routine-1',
    name: 'Upper Focus',
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
    items: [
      { exerciseDefinitionId: 'bench-press', orderIndex: 0 },
      { exerciseDefinitionId: 'row', orderIndex: 1 },
      { exerciseDefinitionId: 'press', orderIndex: 2 },
    ],
  }

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

  it('returns empty routines when storage has no value', async () => {
    await expect(loadRoutines('user-1')).resolves.toEqual([])
  })

  it('upserts routines by id', async () => {
    await upsertRoutine('user-1', baseRoutine)

    const updated = {
      ...baseRoutine,
      name: 'Upper Focus 2',
      pinned: true,
      items: [
        {
          exerciseDefinitionId: 'bench-press',
          orderIndex: 0,
          defaultSets: 4,
          defaultReps: 8,
        },
        {
          exerciseDefinitionId: 'pull-up',
          orderIndex: 1,
          defaultSets: 3,
          defaultReps: 10,
        },
      ],
    }

    await upsertRoutine('user-1', updated)

    const routines = await loadRoutines('user-1')
    expect(routines).toHaveLength(1)
    expect(routines[0].id).toBe('routine-1')
    expect(routines[0].name).toBe('Upper Focus 2')
    expect(routines[0].createdAt).toBe(baseRoutine.createdAt)
    expect(routines[0].pinned).toBe(true)
    expect(routines[0].items).toEqual([
      {
        exerciseDefinitionId: 'bench-press',
        orderIndex: 0,
        section: 'main',
        defaultSets: 4,
        defaultReps: 8,
      },
      {
        exerciseDefinitionId: 'pull-up',
        orderIndex: 1,
        section: 'main',
        defaultSets: 3,
        defaultReps: 10,
      },
    ])
    expect(routines[0].dirty).toBe(true)
  })

  it('preserves client uuid metadata when provided', async () => {
    await upsertRoutine('user-1', {
      ...baseRoutine,
      clientUuid: '123e4567-e89b-12d3-a456-426614174000',
      items: [
        {
          exerciseDefinitionId: 'bench-press',
          orderIndex: 0,
          clientUuid: '123e4567-e89b-12d3-a456-426614174001',
        },
      ],
    })

    const routines = await loadRoutines('user-1')
    expect(routines[0].clientUuid).toBe('123e4567-e89b-12d3-a456-426614174000')
    expect(routines[0].items[0].clientUuid).toBe('123e4567-e89b-12d3-a456-426614174001')
  })

  it('keeps saveRoutine alias working', async () => {
    await saveRoutine('user-1', baseRoutine)

    const routines = await loadRoutines('user-1')
    expect(routines).toHaveLength(1)
    expect(routines[0].name).toBe('Upper Focus')
  })

  it('deletes a routine by id and clears usage', async () => {
    await upsertRoutine('user-1', baseRoutine)
    await bumpRoutineUsage('user-1', baseRoutine.id)
    await deleteRoutine('user-1', baseRoutine.id)

    await expect(loadRoutines('user-1')).resolves.toEqual([])
    await expect(loadRoutineUsage('user-1')).resolves.toEqual({})
  })

  it('sets pinned state', async () => {
    await upsertRoutine('user-1', baseRoutine)
    await setPinnedRoutine('user-1', baseRoutine.id, true)

    const routines = await loadRoutines('user-1')
    expect(routines[0].pinned).toBe(true)

    await setPinnedRoutine('user-1', baseRoutine.id, false)
    const unpinned = await loadRoutines('user-1')
    expect(unpinned[0].pinned).toBeUndefined()
  })

  it('bumps usage counter and timestamp', async () => {
    await upsertRoutine('user-1', baseRoutine)
    await bumpRoutineUsage('user-1', baseRoutine.id)
    await bumpRoutineUsage('user-1', baseRoutine.id)

    const usage = await loadRoutineUsage('user-1')
    expect(usage['routine-1']).toBeDefined()
    expect(usage['routine-1'].usedCount).toBe(2)
    expect(typeof usage['routine-1'].lastUsedAt).toBe('string')
  })

  it('isolates routines by user key', async () => {
    await upsertRoutine('user-1', baseRoutine)
    await upsertRoutine('user-2', {
      ...baseRoutine,
      id: 'routine-2',
      name: 'Lower Focus',
      items: [{ exerciseDefinitionId: 'squat', orderIndex: 0 }],
    })

    const userOne = await loadRoutines('user-1')
    const userTwo = await loadRoutines('user-2')

    expect(userOne).toHaveLength(1)
    expect(userOne[0].name).toBe('Upper Focus')
    expect(userTwo).toHaveLength(1)
    expect(userTwo[0].name).toBe('Lower Focus')
  })

  it('migrates v1 routines key into v2', async () => {
    const legacyKey = 'routines.v1.user-legacy'
    storage.set(
      legacyKey,
      JSON.stringify([
        {
          id: 'routine-legacy',
          name: 'Legacy',
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
          items: [{ exerciseDefinitionId: 'bench', orderIndex: 0 }],
        },
      ]),
    )

    const migrated = await loadRoutines('user-legacy')
    expect(migrated).toHaveLength(1)
    expect(migrated[0].id).toBe('routine-legacy')
    expect(storage.get('routines.v2.user-legacy')).toContain('routine-legacy')
  })

  it('returns empty routines when secure storage read fails', async () => {
    getItemAsyncSpy.mockImplementation(async () => {
      throw new Error('storage unavailable')
    })

    await expect(loadRoutines('user-1')).resolves.toEqual([])
  })

  it('returns empty routines for malformed payloads', async () => {
    storage.set('routines.v2.user-1', '{"broken": true')
    await expect(loadRoutines('user-1')).resolves.toEqual([])
  })

  it('does not throw when secure storage write fails', async () => {
    setItemAsyncSpy.mockImplementation(async () => {
      throw new Error('storage unavailable')
    })

    await expect(upsertRoutine('user-1', baseRoutine)).resolves.toBeUndefined()
    await expect(bumpRoutineUsage('user-1', baseRoutine.id)).resolves.toBeUndefined()
  })

  it('preserves previous routine list when pinning unknown id', async () => {
    await upsertRoutine('user-1', baseRoutine)
    await setPinnedRoutine('user-1', 'missing-routine', true)

    const routines = await loadRoutines('user-1')
    expect(routines).toHaveLength(1)
    expect(routines[0].id).toBe(baseRoutine.id)
    expect(routines[0].pinned).toBeUndefined()
  })

  it('normalizes missing sections to main and orders warmup/main/cooldown', async () => {
    await upsertRoutine('user-1', {
      ...baseRoutine,
      items: [
        { exerciseDefinitionId: 'cool', orderIndex: 5, section: 'cooldown' },
        { exerciseDefinitionId: 'main-a', orderIndex: 0, section: 'main' },
        { exerciseDefinitionId: 'warm', orderIndex: 3, section: 'warmup' },
        { exerciseDefinitionId: 'main-b', orderIndex: 1 },
      ],
    })

    const routines = await loadRoutines('user-1')
    expect(routines[0].items.map((item) => item.exerciseDefinitionId)).toEqual([
      'warm',
      'main-a',
      'main-b',
      'cool',
    ])
    expect(routines[0].items.map((item) => item.section)).toEqual([
      'warmup',
      'main',
      'main',
      'cooldown',
    ])
    expect(routines[0].items.map((item) => item.orderIndex)).toEqual([0, 1, 2, 3])
  })
})
