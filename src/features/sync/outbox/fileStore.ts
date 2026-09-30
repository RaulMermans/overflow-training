import * as FileSystem from 'expo-file-system/legacy'
import type { OutboxQueueState, WorkoutProjectionState } from './types'

const SYNC_DIRECTORY = 'sync-v1'
const OUTBOX_FILE = 'outbox.json'
const OUTBOX_BACKUP_FILE = 'outbox.backup.json'
const PROJECTION_FILE = 'workout-projection.json'
const PROJECTION_BACKUP_FILE = 'workout-projection.backup.json'

const EMPTY_OUTBOX: OutboxQueueState = { events: [] }
const EMPTY_PROJECTION: WorkoutProjectionState = { workouts: [] }

function getBaseDirectory(): string | null {
  return FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? null
}

function sanitizeUserSegment(userId: string): string {
  return encodeURIComponent(userId.trim())
}

function getDirectoryUri(userId?: string): string | null {
  const base = getBaseDirectory()
  if (!base) return null
  if (typeof userId === 'string' && userId.trim().length > 0) {
    return `${base}${SYNC_DIRECTORY}/${sanitizeUserSegment(userId)}/`
  }
  return `${base}${SYNC_DIRECTORY}/`
}

function getFileUri(name: string, userId?: string): string | null {
  const dir = getDirectoryUri(userId)
  if (!dir) return null
  return `${dir}${name}`
}

async function ensureDirectory(userId?: string): Promise<string | null> {
  const directoryUri = getDirectoryUri(userId)
  if (!directoryUri) return null

  await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true })
  return directoryUri
}

function parseJsonWithDiagnostics<T>(raw: string, label: string): T {
  if (!__DEV__) return JSON.parse(raw) as T
  const start = performance.now()
  const result = JSON.parse(raw) as T
  const ms = performance.now() - start
  if (ms > 16) {
    console.warn(
      `[ProjectionDiag] JSON.parse ${label}: ${ms.toFixed(1)}ms, size=${(raw.length / 1024).toFixed(1)}kb`,
    )
  }
  return result
}

async function readJson<T>(
  primaryUri: string | null,
  backupUri: string | null,
  fallback: T,
): Promise<T> {
  if (!primaryUri) return fallback

  try {
    const primaryInfo = await FileSystem.getInfoAsync(primaryUri)
    if (primaryInfo.exists) {
      const raw = await FileSystem.readAsStringAsync(primaryUri)
      const sizeKb = (raw.length / 1024).toFixed(1)
      if (__DEV__ && raw.length > 50_000) {
        console.warn(`[ProjectionDiag] loadWorkoutProjection file size: ${sizeKb}kb`)
      }
      return parseJsonWithDiagnostics(raw, 'load') as T
    }
  } catch {
    // Try backup path below.
  }

  if (!backupUri) return fallback

  try {
    const backupInfo = await FileSystem.getInfoAsync(backupUri)
    if (!backupInfo.exists) return fallback
    const raw = await FileSystem.readAsStringAsync(backupUri)
    return parseJsonWithDiagnostics(raw, 'load-backup') as T
  } catch {
    return fallback
  }
}

async function writeJsonAtomic(
  uri: string | null,
  backupUri: string | null,
  payload: unknown,
  directoryUserId?: string,
): Promise<void> {
  if (!uri || !backupUri) return

  await ensureDirectory(directoryUserId)

  let json: string
  if (__DEV__) {
    const start = performance.now()
    json = JSON.stringify(payload)
    const ms = performance.now() - start
    const sizeKb = (json.length / 1024).toFixed(1)
    if (ms > 16 || json.length > 50_000) {
      console.warn(`[ProjectionDiag] JSON.stringify: ${ms.toFixed(1)}ms, size=${sizeKb}kb`)
    }
  } else {
    json = JSON.stringify(payload)
  }
  const tempUri = `${uri}.tmp`

  await FileSystem.writeAsStringAsync(tempUri, json)

  const currentInfo = await FileSystem.getInfoAsync(uri)
  if (currentInfo.exists) {
    await FileSystem.copyAsync({ from: uri, to: backupUri })
  }

  const targetInfo = await FileSystem.getInfoAsync(uri)
  if (targetInfo.exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true })
  }

  await FileSystem.moveAsync({ from: tempUri, to: uri })
}

async function deleteIfExists(uri: string | null): Promise<void> {
  if (!uri) return

  try {
    const info = await FileSystem.getInfoAsync(uri)
    if (!info.exists) return
    await FileSystem.deleteAsync(uri, { idempotent: true })
  } catch {
    // Best-effort cleanup.
  }
}

function byOtherUsers(userId: string) {
  return (entry: { user_id: string }) => entry.user_id !== userId
}

export async function loadOutboxQueue(userId: string): Promise<OutboxQueueState> {
  const fileUri = getFileUri(OUTBOX_FILE, userId)
  const backupUri = getFileUri(OUTBOX_BACKUP_FILE, userId)
  const payload = await readJson<OutboxQueueState>(fileUri, backupUri, EMPTY_OUTBOX)

  if (!payload || !Array.isArray(payload.events)) {
    return EMPTY_OUTBOX
  }

  return {
    events: payload.events,
  }
}

export async function saveOutboxQueue(userId: string, queue: OutboxQueueState): Promise<void> {
  const fileUri = getFileUri(OUTBOX_FILE, userId)
  const backupUri = getFileUri(OUTBOX_BACKUP_FILE, userId)
  await writeJsonAtomic(fileUri, backupUri, queue, userId)
}

export async function loadWorkoutProjection(): Promise<WorkoutProjectionState> {
  const fileUri = getFileUri(PROJECTION_FILE)
  const backupUri = getFileUri(PROJECTION_BACKUP_FILE)
  const payload = await readJson<WorkoutProjectionState>(fileUri, backupUri, EMPTY_PROJECTION)

  if (!payload || !Array.isArray(payload.workouts)) {
    return EMPTY_PROJECTION
  }

  return {
    workouts: payload.workouts,
  }
}

export async function saveWorkoutProjection(projection: WorkoutProjectionState): Promise<void> {
  const fileUri = getFileUri(PROJECTION_FILE)
  const backupUri = getFileUri(PROJECTION_BACKUP_FILE)
  await writeJsonAtomic(fileUri, backupUri, projection)
}

export async function clearOutboxQueue(userId: string): Promise<void> {
  await Promise.all([
    deleteIfExists(getFileUri(OUTBOX_FILE, userId)),
    deleteIfExists(getFileUri(OUTBOX_BACKUP_FILE, userId)),
    // Clean up legacy global outbox files from pre-user-scoped builds.
    deleteIfExists(getFileUri(OUTBOX_FILE)),
    deleteIfExists(getFileUri(OUTBOX_BACKUP_FILE)),
  ])
}

export async function clearWorkoutProjectionForUser(userId: string): Promise<void> {
  if (!userId) return

  const projection = await loadWorkoutProjection()
  const nextWorkouts = projection.workouts.filter(byOtherUsers(userId))

  if (nextWorkouts.length === projection.workouts.length) {
    return
  }

  if (nextWorkouts.length === 0) {
    await Promise.all([
      deleteIfExists(getFileUri(PROJECTION_FILE)),
      deleteIfExists(getFileUri(PROJECTION_BACKUP_FILE)),
    ])
    return
  }

  await saveWorkoutProjection({ workouts: nextWorkouts })
}
