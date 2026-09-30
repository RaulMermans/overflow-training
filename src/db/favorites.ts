import * as SecureStore from 'expo-secure-store'
import { generateUuid } from '../lib/ids'
import { requireSupabase } from '../lib/supabaseClient'

const FAVORITES_KEY_PREFIX = 'favorites.v1'

type FavoriteKind = 'exercise' | 'routine'

interface PendingFavoriteOperation {
  operationId: string
  kind: FavoriteKind
  targetId: string
  isFav: boolean
  createdAt: string
}

interface FavoritesSnapshotSerialized {
  exerciseIds?: string[]
  routineIds?: string[]
  pendingOps?: PendingFavoriteOperation[]
}

interface FavoritesSnapshot {
  exerciseIds: Set<string>
  routineIds: Set<string>
  pendingOps: PendingFavoriteOperation[]
}

const snapshotLocks = new Map<string, Promise<void>>()

function getFavoritesKey(userId: string): string {
  return `${FAVORITES_KEY_PREFIX}.${userId}`
}

function emptySnapshot(): FavoritesSnapshot {
  return {
    exerciseIds: new Set(),
    routineIds: new Set(),
    pendingOps: [],
  }
}

function normalizeIds(input: unknown): Set<string> {
  if (!Array.isArray(input)) return new Set()

  const values = input
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  return new Set(values)
}

function normalizePendingOps(input: unknown): PendingFavoriteOperation[] {
  if (!Array.isArray(input)) return []

  const normalized: PendingFavoriteOperation[] = []

  for (const value of input) {
    if (!value || typeof value !== 'object') continue

    const candidate = value as Partial<PendingFavoriteOperation>
    const kind =
      candidate.kind === 'exercise' || candidate.kind === 'routine' ? candidate.kind : null
    const targetId = typeof candidate.targetId === 'string' ? candidate.targetId.trim() : ''
    const isFav = typeof candidate.isFav === 'boolean' ? candidate.isFav : null
    const operationId =
      typeof candidate.operationId === 'string' && candidate.operationId.trim()
        ? candidate.operationId.trim()
        : generateUuid()
    const createdAt =
      typeof candidate.createdAt === 'string' && candidate.createdAt
        ? candidate.createdAt
        : new Date().toISOString()

    if (!kind || !targetId || isFav === null) continue

    normalized.push({
      operationId,
      kind,
      targetId,
      isFav,
      createdAt,
    })
  }

  return normalized
}

function parseSnapshot(raw: string | null): FavoritesSnapshot {
  if (!raw) return emptySnapshot()

  try {
    const parsed = JSON.parse(raw) as FavoritesSnapshotSerialized
    return {
      exerciseIds: normalizeIds(parsed.exerciseIds),
      routineIds: normalizeIds(parsed.routineIds),
      pendingOps: normalizePendingOps(parsed.pendingOps),
    }
  } catch {
    return emptySnapshot()
  }
}

function serializeSnapshot(snapshot: FavoritesSnapshot): FavoritesSnapshotSerialized {
  return {
    exerciseIds: [...snapshot.exerciseIds].sort(),
    routineIds: [...snapshot.routineIds].sort(),
    pendingOps: [...snapshot.pendingOps],
  }
}

async function withSnapshotLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previous = snapshotLocks.get(userId) ?? Promise.resolve()
  let releaseCurrent!: () => void
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve
  })
  const tail = previous.catch(() => undefined).then(() => current)
  snapshotLocks.set(userId, tail)

  await previous.catch(() => undefined)

  try {
    return await task()
  } finally {
    releaseCurrent()
    if (snapshotLocks.get(userId) === tail) {
      snapshotLocks.delete(userId)
    }
  }
}

async function loadSnapshot(userId: string): Promise<FavoritesSnapshot> {
  if (!userId) return emptySnapshot()

  try {
    const raw = await SecureStore.getItemAsync(getFavoritesKey(userId))
    return parseSnapshot(raw)
  } catch {
    return emptySnapshot()
  }
}

async function persistSnapshot(userId: string, snapshot: FavoritesSnapshot): Promise<Error | null> {
  if (!userId) return new Error('Missing user id.')

  try {
    await SecureStore.setItemAsync(
      getFavoritesKey(userId),
      JSON.stringify(serializeSnapshot(snapshot)),
    )
    return null
  } catch (error) {
    return error instanceof Error ? error : new Error('Failed to persist favorites.')
  }
}

function applyPendingOps(snapshot: FavoritesSnapshot): void {
  for (const operation of snapshot.pendingOps) {
    const targetSet = operation.kind === 'exercise' ? snapshot.exerciseIds : snapshot.routineIds

    if (operation.isFav) {
      targetSet.add(operation.targetId)
    } else {
      targetSet.delete(operation.targetId)
    }
  }
}

function upsertPendingOperation(
  pendingOps: PendingFavoriteOperation[],
  nextOperation: PendingFavoriteOperation,
): PendingFavoriteOperation[] {
  return [
    ...pendingOps.filter(
      (operation) =>
        !(operation.kind === nextOperation.kind && operation.targetId === nextOperation.targetId),
    ),
    nextOperation,
  ]
}

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error
  return new Error(fallback)
}

async function fetchCloudFavoriteIds(
  userId: string,
  kind: FavoriteKind,
): Promise<{ data: Set<string> | null; error: Error | null }> {
  try {
    const client = requireSupabase()

    if (kind === 'exercise') {
      const { data, error } = await client
        .from('exercise_favorites')
        .select('exercise_definition_id')
        .eq('user_id', userId)

      if (error) {
        return { data: null, error: new Error(error.message) }
      }

      return {
        data: new Set((data ?? []).map((row) => row.exercise_definition_id)),
        error: null,
      }
    }

    const { data, error } = await client
      .from('routine_favorites')
      .select('routine_id')
      .eq('user_id', userId)

    if (error) {
      return { data: null, error: new Error(error.message) }
    }

    return {
      data: new Set((data ?? []).map((row) => row.routine_id)),
      error: null,
    }
  } catch (error) {
    return { data: null, error: toError(error, 'Failed to fetch favorites from cloud.') }
  }
}

async function syncFavoriteOperationToCloud(
  userId: string,
  operation: PendingFavoriteOperation,
): Promise<Error | null> {
  try {
    const client = requireSupabase()

    if (operation.kind === 'exercise') {
      if (operation.isFav) {
        const { error } = await client
          .from('exercise_favorites')
          .upsert(
            { user_id: userId, exercise_definition_id: operation.targetId },
            { onConflict: 'user_id,exercise_definition_id' },
          )
        return error ? new Error(error.message) : null
      }

      const { error } = await client
        .from('exercise_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('exercise_definition_id', operation.targetId)
      return error ? new Error(error.message) : null
    }

    if (operation.isFav) {
      const { error } = await client
        .from('routine_favorites')
        .upsert(
          { user_id: userId, routine_id: operation.targetId },
          { onConflict: 'user_id,routine_id' },
        )
      return error ? new Error(error.message) : null
    }

    const { error } = await client
      .from('routine_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('routine_id', operation.targetId)
    return error ? new Error(error.message) : null
  } catch (error) {
    return toError(error, 'Failed to sync favorite operation.')
  }
}

async function listFavoritesByKind(
  userId: string,
  kind: FavoriteKind,
): Promise<{ data: Set<string> | null; error: Error | null }> {
  if (!userId) return { data: new Set(), error: null }

  const localSnapshot = await loadSnapshot(userId)
  applyPendingOps(localSnapshot)
  const localIds = new Set(
    kind === 'exercise' ? localSnapshot.exerciseIds : localSnapshot.routineIds,
  )

  const cloudResult = await fetchCloudFavoriteIds(userId, kind)
  if (!cloudResult.data) {
    return { data: localIds, error: cloudResult.error }
  }

  const mergedResult = await withSnapshotLock(userId, async () => {
    const latestSnapshot = await loadSnapshot(userId)

    if (kind === 'exercise') {
      latestSnapshot.exerciseIds = new Set(cloudResult.data)
    } else {
      latestSnapshot.routineIds = new Set(cloudResult.data)
    }

    applyPendingOps(latestSnapshot)
    const persistError = await persistSnapshot(userId, latestSnapshot)
    const resolvedIds = new Set(
      kind === 'exercise' ? latestSnapshot.exerciseIds : latestSnapshot.routineIds,
    )

    return {
      data: resolvedIds,
      error: persistError,
    }
  })

  return {
    data: mergedResult.data,
    error: mergedResult.error,
  }
}

async function toggleFavoriteByKind(
  userId: string,
  kind: FavoriteKind,
  targetId: string,
  isFav: boolean,
): Promise<{ error: Error | null }> {
  if (!userId) return { error: new Error('Not signed in') }

  const normalizedTargetId = targetId.trim()
  if (!normalizedTargetId) return { error: new Error('Missing favorite target id.') }

  const operation: PendingFavoriteOperation = {
    operationId: generateUuid(),
    kind,
    targetId: normalizedTargetId,
    isFav,
    createdAt: new Date().toISOString(),
  }

  const persistLocalResult = await withSnapshotLock(userId, async () => {
    const snapshot = await loadSnapshot(userId)
    const targetSet = kind === 'exercise' ? snapshot.exerciseIds : snapshot.routineIds

    if (isFav) {
      targetSet.add(normalizedTargetId)
    } else {
      targetSet.delete(normalizedTargetId)
    }

    snapshot.pendingOps = upsertPendingOperation(snapshot.pendingOps, operation)
    return persistSnapshot(userId, snapshot)
  })

  if (persistLocalResult) {
    return { error: persistLocalResult }
  }

  const syncError = await syncFavoriteOperationToCloud(userId, operation)
  if (syncError) {
    return { error: null }
  }

  await withSnapshotLock(userId, async () => {
    const snapshot = await loadSnapshot(userId)
    const activeForTarget = snapshot.pendingOps.find(
      (entry) => entry.kind === kind && entry.targetId === normalizedTargetId,
    )

    if (activeForTarget?.operationId !== operation.operationId) {
      return
    }

    snapshot.pendingOps = snapshot.pendingOps.filter(
      (entry) => entry.operationId !== operation.operationId,
    )
    const persistError = await persistSnapshot(userId, snapshot)
    if (persistError && __DEV__) {
      console.warn('[favorites] Failed to clear synced pending operation:', persistError.message)
    }
  })

  return { error: null }
}

// ── Exercise favorites ────────────────────────────────────────────────────────

export async function listExerciseFavorites(userId: string): Promise<{
  data: Set<string> | null
  error: Error | null
}> {
  return listFavoritesByKind(userId, 'exercise')
}

export async function toggleExerciseFavorite(
  userId: string,
  exerciseId: string,
  isFav: boolean,
): Promise<{ error: Error | null }> {
  return toggleFavoriteByKind(userId, 'exercise', exerciseId, isFav)
}

// ── Routine favorites ─────────────────────────────────────────────────────────

export async function listRoutineFavorites(userId: string): Promise<{
  data: Set<string> | null
  error: Error | null
}> {
  return listFavoritesByKind(userId, 'routine')
}

export async function toggleRoutineFavorite(
  userId: string,
  routineId: string,
  isFav: boolean,
): Promise<{ error: Error | null }> {
  return toggleFavoriteByKind(userId, 'routine', routineId, isFav)
}

export async function flushPendingFavorites(
  userId: string,
): Promise<{ synced: number; remaining: number; error: Error | null }> {
  if (!userId) return { synced: 0, remaining: 0, error: null }

  const snapshot = await loadSnapshot(userId)
  if (snapshot.pendingOps.length === 0) {
    return { synced: 0, remaining: 0, error: null }
  }

  let syncError: Error | null = null
  const syncedOperationIds = new Set<string>()

  for (const operation of snapshot.pendingOps) {
    const operationError = await syncFavoriteOperationToCloud(userId, operation)
    if (operationError) {
      if (!syncError) {
        syncError = operationError
      }
      continue
    }

    syncedOperationIds.add(operation.operationId)
  }

  const removalResult = await withSnapshotLock(userId, async () => {
    const latestSnapshot = await loadSnapshot(userId)
    const retainedPending = latestSnapshot.pendingOps.filter((operation) => {
      if (!syncedOperationIds.has(operation.operationId)) {
        return true
      }

      const latestByTarget = latestSnapshot.pendingOps.find(
        (entry) => entry.kind === operation.kind && entry.targetId === operation.targetId,
      )
      return latestByTarget?.operationId !== operation.operationId
    })

    const removed = latestSnapshot.pendingOps.length - retainedPending.length
    if (removed > 0) {
      latestSnapshot.pendingOps = retainedPending
      const persistError = await persistSnapshot(userId, latestSnapshot)
      if (persistError && !syncError) {
        syncError = persistError
      }
    }

    return {
      removed,
      remaining: retainedPending.length,
    }
  })

  return {
    synced: removalResult.removed,
    remaining: removalResult.remaining,
    error: syncError,
  }
}

export async function clearFavoritesCache(userId: string): Promise<void> {
  if (!userId) return

  try {
    await SecureStore.deleteItemAsync(getFavoritesKey(userId))
  } catch {
    // Clear failures should not block sign-out cleanup.
  }
}
