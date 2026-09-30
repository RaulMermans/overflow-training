import * as SecureStore from 'expo-secure-store'
import {
  clearFavoritesCache,
  flushPendingFavorites,
  listExerciseFavorites,
  listRoutineFavorites,
  toggleExerciseFavorite,
  toggleRoutineFavorite,
} from '../src/db/favorites'
import { requireSupabase } from '../src/lib/supabaseClient'

jest.mock('../src/lib/supabaseClient', () => ({
  requireSupabase: jest.fn(),
}))

const requireSupabaseMock = requireSupabase as jest.MockedFunction<typeof requireSupabase>

function asSupabaseClient(from: jest.Mock) {
  return { from } as unknown as ReturnType<typeof requireSupabase>
}

function getStorageKey(userId: string) {
  return `favorites.v1.${userId}`
}

describe('favorites db', () => {
  const storage = new Map<string, string>()
  let getItemAsyncSpy: jest.SpyInstance
  let setItemAsyncSpy: jest.SpyInstance
  let deleteItemAsyncSpy: jest.SpyInstance

  const readSnapshot = (
    userId: string,
  ): {
    exerciseIds?: string[]
    routineIds?: string[]
    pendingOps?: Array<{
      operationId: string
      kind: 'exercise' | 'routine'
      targetId: string
      isFav: boolean
      createdAt: string
    }>
  } | null => {
    const raw = storage.get(getStorageKey(userId))
    if (!raw) return null
    return JSON.parse(raw) as {
      exerciseIds?: string[]
      routineIds?: string[]
      pendingOps?: Array<{
        operationId: string
        kind: 'exercise' | 'routine'
        targetId: string
        isFav: boolean
        createdAt: string
      }>
    }
  }

  beforeEach(() => {
    storage.clear()
    jest.clearAllMocks()

    getItemAsyncSpy = jest.spyOn(SecureStore, 'getItemAsync')
    setItemAsyncSpy = jest.spyOn(SecureStore, 'setItemAsync')
    deleteItemAsyncSpy = jest.spyOn(SecureStore, 'deleteItemAsync')

    getItemAsyncSpy.mockImplementation(async (key: string) => storage.get(key) ?? null)
    setItemAsyncSpy.mockImplementation(async (key: string, value: string) => {
      storage.set(key, value)
    })
    deleteItemAsyncSpy.mockImplementation(async (key: string) => {
      storage.delete(key)
    })
  })

  afterEach(() => {
    getItemAsyncSpy.mockRestore()
    setItemAsyncSpy.mockRestore()
    deleteItemAsyncSpy.mockRestore()
  })

  it('lists exercise favorites as a set', async () => {
    const eqMock = jest.fn(async () => ({
      data: [{ exercise_definition_id: 'exercise-1' }, { exercise_definition_id: 'exercise-2' }],
      error: null,
    }))
    const selectMock = jest.fn(() => ({ eq: eqMock }))
    const fromMock = jest.fn(() => ({ select: selectMock }))
    requireSupabaseMock.mockReturnValue(asSupabaseClient(fromMock))

    const result = await listExerciseFavorites('user-1')

    expect(fromMock).toHaveBeenCalledWith('exercise_favorites')
    expect(selectMock).toHaveBeenCalledWith('exercise_definition_id')
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(result.error).toBeNull()
    expect(result.data).toEqual(new Set(['exercise-1', 'exercise-2']))
  })

  it('persists local exercise favorites even when cloud toggle fails', async () => {
    requireSupabaseMock.mockImplementation(() => {
      throw new Error('offline')
    })

    const toggleResult = await toggleExerciseFavorite('user-1', 'exercise-1', true)
    expect(toggleResult.error).toBeNull()

    const snapshot = readSnapshot('user-1')
    expect(snapshot?.exerciseIds).toEqual(['exercise-1'])
    expect(snapshot?.pendingOps).toHaveLength(1)
    expect(snapshot?.pendingOps?.[0]).toEqual({
      operationId: expect.any(String),
      kind: 'exercise',
      targetId: 'exercise-1',
      isFav: true,
      createdAt: expect.any(String),
    })

    const listResult = await listExerciseFavorites('user-1')
    expect(listResult.data).toEqual(new Set(['exercise-1']))
  })

  it('collapses pending favorite ops to latest intent', async () => {
    requireSupabaseMock.mockImplementation(() => {
      throw new Error('offline')
    })

    await toggleRoutineFavorite('user-1', 'routine-1', true)
    await toggleRoutineFavorite('user-1', 'routine-1', false)

    const snapshot = readSnapshot('user-1')
    expect(snapshot?.pendingOps).toHaveLength(1)
    expect(snapshot?.pendingOps?.[0]).toEqual({
      operationId: expect.any(String),
      kind: 'routine',
      targetId: 'routine-1',
      isFav: false,
      createdAt: expect.any(String),
    })

    const listResult = await listRoutineFavorites('user-1')
    expect(listResult.data).toEqual(new Set())
  })

  it('falls back to local snapshot when cloud list fails', async () => {
    requireSupabaseMock.mockImplementation(() => {
      throw new Error('offline')
    })
    await toggleExerciseFavorite('user-1', 'exercise-1', true)

    const eqMock = jest.fn(async () => ({
      data: null,
      error: { message: 'network request failed' },
    }))
    const selectMock = jest.fn(() => ({ eq: eqMock }))
    const fromMock = jest.fn(() => ({ select: selectMock }))
    requireSupabaseMock.mockReturnValue(asSupabaseClient(fromMock))

    const result = await listExerciseFavorites('user-1')
    expect(result.data).toEqual(new Set(['exercise-1']))
    expect(result.error).toBeInstanceOf(Error)
  })

  it('flushes pending favorites when cloud sync succeeds', async () => {
    requireSupabaseMock.mockImplementation(() => {
      throw new Error('offline')
    })
    await toggleRoutineFavorite('user-1', 'routine-1', true)

    const upsertMock = jest.fn(async () => ({ error: null }))
    const fromMock = jest.fn((table: string) => {
      if (table === 'routine_favorites') {
        return { upsert: upsertMock }
      }
      return { upsert: jest.fn(async () => ({ error: null })) }
    })
    requireSupabaseMock.mockReturnValue(asSupabaseClient(fromMock))

    const result = await flushPendingFavorites('user-1')
    expect(result.synced).toBe(1)
    expect(result.remaining).toBe(0)
    expect(result.error).toBeNull()

    const snapshot = readSnapshot('user-1')
    expect(snapshot?.pendingOps).toEqual([])
  })

  it('keeps pending favorites when cloud sync fails', async () => {
    requireSupabaseMock.mockImplementation(() => {
      throw new Error('offline')
    })
    await toggleExerciseFavorite('user-1', 'exercise-1', true)

    const upsertMock = jest.fn(async () => ({
      error: { message: 'timeout' },
    }))
    const fromMock = jest.fn((table: string) => {
      if (table === 'exercise_favorites') {
        return { upsert: upsertMock }
      }
      return { upsert: jest.fn(async () => ({ error: null })) }
    })
    requireSupabaseMock.mockReturnValue(asSupabaseClient(fromMock))

    const result = await flushPendingFavorites('user-1')
    expect(result.synced).toBe(0)
    expect(result.remaining).toBe(1)
    expect(result.error).toBeInstanceOf(Error)

    const snapshot = readSnapshot('user-1')
    expect(snapshot?.pendingOps).toHaveLength(1)
    expect(snapshot?.pendingOps?.[0]).toEqual({
      operationId: expect.any(String),
      kind: 'exercise',
      targetId: 'exercise-1',
      isFav: true,
      createdAt: expect.any(String),
    })
  })

  it('isolates snapshots by user id', async () => {
    requireSupabaseMock.mockImplementation(() => {
      throw new Error('offline')
    })

    await toggleExerciseFavorite('user-1', 'exercise-1', true)
    await toggleRoutineFavorite('user-2', 'routine-2', true)

    const userOneExercises = await listExerciseFavorites('user-1')
    const userTwoExercises = await listExerciseFavorites('user-2')
    const userTwoRoutines = await listRoutineFavorites('user-2')

    expect(userOneExercises.data).toEqual(new Set(['exercise-1']))
    expect(userTwoExercises.data).toEqual(new Set())
    expect(userTwoRoutines.data).toEqual(new Set(['routine-2']))
  })

  it('clears favorites cache for a user', async () => {
    storage.set(
      getStorageKey('user-1'),
      JSON.stringify({
        exerciseIds: ['exercise-1'],
        routineIds: ['routine-1'],
        pendingOps: [],
      }),
    )

    await clearFavoritesCache('user-1')

    expect(storage.has(getStorageKey('user-1'))).toBe(false)
  })
})
