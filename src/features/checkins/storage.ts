import * as FileSystem from 'expo-file-system/legacy'
import { generateUuid } from '../../lib/ids'

const CHECKINS_DIRECTORY = 'checkins-v1'
const INDEX_FILE = 'index.json'
const INDEX_BACKUP_FILE = 'index.backup.json'
const PHOTOS_DIRECTORY = 'photos'
const DUE_INTERVAL_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export type CheckinPose = 'front' | 'side' | 'back'
export type CheckinSyncState = 'pending' | 'synced' | 'failed'

export type CheckinEntry = {
  id: string
  userId: string
  takenAtISO: string
  pose: CheckinPose
  photoUri?: string
  width?: number
  height?: number
  notes?: string
  weightKg?: number
  remotePath?: string
  syncState?: CheckinSyncState
  cloudSyncedAtISO?: string
  lastSyncError?: string
  remoteSignedUrl?: string
  remoteSignedUrlExpiresAtISO?: string
}

export type CheckinCloudPatch = {
  remotePath?: string | null
  syncState?: CheckinSyncState | null
  cloudSyncedAtISO?: string | null
  lastSyncError?: string | null
  remoteSignedUrl?: string | null
  remoteSignedUrlExpiresAtISO?: string | null
}

export type RemoteCheckinInput = {
  id: string
  takenAtISO: string
  pose?: CheckinPose
  remotePath: string
  width?: number | null
  height?: number | null
  notes?: string | null
  weightKg?: number | null
  cloudSyncedAtISO?: string | null
}

type CheckinIndexPayload = {
  version: 1
  entries: CheckinEntry[]
  lastPromptedAtISO: string | null
}

const EMPTY_INDEX: CheckinIndexPayload = {
  version: 1,
  entries: [],
  lastPromptedAtISO: null,
}

export type AddCheckinMetadata = {
  takenAtISO?: string
  pose?: CheckinPose
  width?: number
  height?: number
  notes?: string
  weightKg?: number
}

export type CheckinDueInfo = {
  nextDueAtISO: string | null
  isDue: boolean
  lastPromptedAtISO: string | null
}

function getBaseDirectory(): string | null {
  return FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? null
}

function sanitizeUserSegment(userId: string): string {
  return encodeURIComponent(userId.trim())
}

function getUserDirectoryUri(userId: string): string | null {
  const base = getBaseDirectory()
  if (!base) return null

  const trimmedUserId = userId.trim()
  if (!trimmedUserId) return null

  return `${base}${CHECKINS_DIRECTORY}/${sanitizeUserSegment(trimmedUserId)}/`
}

function getPhotosDirectoryUri(userId: string): string | null {
  const directoryUri = getUserDirectoryUri(userId)
  if (!directoryUri) return null
  return `${directoryUri}${PHOTOS_DIRECTORY}/`
}

function getIndexUri(userId: string): string | null {
  const directoryUri = getUserDirectoryUri(userId)
  if (!directoryUri) return null
  return `${directoryUri}${INDEX_FILE}`
}

function getIndexBackupUri(userId: string): string | null {
  const directoryUri = getUserDirectoryUri(userId)
  if (!directoryUri) return null
  return `${directoryUri}${INDEX_BACKUP_FILE}`
}

async function ensureUserDirectory(userId: string): Promise<void> {
  const directoryUri = getUserDirectoryUri(userId)
  const photosDirectoryUri = getPhotosDirectoryUri(userId)
  if (!directoryUri || !photosDirectoryUri) return

  await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true })
  await FileSystem.makeDirectoryAsync(photosDirectoryUri, { intermediates: true })
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const next = new Date(value)
  if (Number.isNaN(next.getTime())) return null
  return next.toISOString()
}

function toPositiveNumberOrUndefined(value: unknown): number | undefined {
  if (!Number.isFinite(value)) return undefined
  const next = Number(value)
  if (next <= 0) return undefined
  return next
}

function toTrimmedStringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parsePose(value: unknown): CheckinPose {
  if (value === 'side' || value === 'back') return value
  return 'front'
}

function parseSyncState(value: unknown): CheckinSyncState | undefined {
  if (value === 'synced' || value === 'failed') return value
  if (value === 'pending') return value
  return undefined
}

function parseEntry(value: unknown, fallbackUserId: string): CheckinEntry | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<CheckinEntry>
  const id = toTrimmedStringOrUndefined(candidate.id)
  const photoUri = toTrimmedStringOrUndefined(candidate.photoUri)
  const remotePath = toTrimmedStringOrUndefined(candidate.remotePath)
  const takenAtISO = toIsoOrNull(candidate.takenAtISO)

  if (!id || !takenAtISO || (!photoUri && !remotePath)) {
    return null
  }

  const userId = toTrimmedStringOrUndefined(candidate.userId) ?? fallbackUserId
  if (!userId) return null

  let syncState = parseSyncState(candidate.syncState)
  if (!syncState) {
    syncState = remotePath ? 'synced' : photoUri ? 'pending' : undefined
  }

  return {
    id,
    userId,
    takenAtISO,
    pose: parsePose(candidate.pose),
    photoUri,
    width: toPositiveNumberOrUndefined(candidate.width),
    height: toPositiveNumberOrUndefined(candidate.height),
    notes: toTrimmedStringOrUndefined(candidate.notes),
    weightKg: toPositiveNumberOrUndefined(candidate.weightKg),
    remotePath,
    syncState,
    cloudSyncedAtISO: toIsoOrNull(candidate.cloudSyncedAtISO) ?? undefined,
    lastSyncError: toTrimmedStringOrUndefined(candidate.lastSyncError),
    remoteSignedUrl: toTrimmedStringOrUndefined(candidate.remoteSignedUrl),
    remoteSignedUrlExpiresAtISO: toIsoOrNull(candidate.remoteSignedUrlExpiresAtISO) ?? undefined,
  }
}

function normalizeIndex(payload: unknown, userId: string): CheckinIndexPayload {
  if (!payload || typeof payload !== 'object') {
    return { ...EMPTY_INDEX }
  }

  const candidate = payload as Partial<CheckinIndexPayload>
  const entries = Array.isArray(candidate.entries)
    ? candidate.entries
        .map((entry) => parseEntry(entry, userId))
        .filter((entry): entry is CheckinEntry => Boolean(entry))
        .filter((entry) => entry.userId === userId)
    : []

  return {
    version: 1,
    entries,
    lastPromptedAtISO: toIsoOrNull(candidate.lastPromptedAtISO),
  }
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
      return JSON.parse(raw) as T
    }
  } catch {
    // Try backup below.
  }

  if (!backupUri) return fallback

  try {
    const backupInfo = await FileSystem.getInfoAsync(backupUri)
    if (!backupInfo.exists) return fallback

    const raw = await FileSystem.readAsStringAsync(backupUri)
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJsonAtomic(
  uri: string | null,
  backupUri: string | null,
  payload: unknown,
  userId: string,
): Promise<void> {
  if (!uri || !backupUri) return

  await ensureUserDirectory(userId)

  const json = JSON.stringify(payload)
  const tempUri = `${uri}.tmp`

  await FileSystem.writeAsStringAsync(tempUri, json)

  const currentInfo = await FileSystem.getInfoAsync(uri)
  if (currentInfo.exists) {
    await FileSystem.copyAsync({ from: uri, to: backupUri })
    await FileSystem.deleteAsync(uri, { idempotent: true })
  }

  await FileSystem.moveAsync({ from: tempUri, to: uri })
}

async function loadIndex(userId: string): Promise<CheckinIndexPayload> {
  const payload = await readJson<CheckinIndexPayload>(
    getIndexUri(userId),
    getIndexBackupUri(userId),
    EMPTY_INDEX,
  )

  return normalizeIndex(payload, userId)
}

async function saveIndex(userId: string, index: CheckinIndexPayload): Promise<void> {
  await writeJsonAtomic(getIndexUri(userId), getIndexBackupUri(userId), index, userId)
}

function toEpoch(value: string): number {
  const epoch = new Date(value).getTime()
  return Number.isFinite(epoch) ? epoch : 0
}

function sortByNewest(entries: CheckinEntry[]): CheckinEntry[] {
  return [...entries].sort((a, b) => toEpoch(b.takenAtISO) - toEpoch(a.takenAtISO))
}

function normalizeTakenAtISO(value?: string): string {
  if (!value) return new Date().toISOString()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  return date.toISOString()
}

export async function listCheckins(userId: string): Promise<CheckinEntry[]> {
  if (!userId) return []

  const index = await loadIndex(userId)
  return sortByNewest(index.entries)
}

export async function addCheckinFromPicker(
  userId: string,
  assetUri: string,
  metadata: AddCheckinMetadata = {},
): Promise<CheckinEntry | null> {
  if (!userId || !assetUri) return null

  const trimmedAssetUri = assetUri.trim()
  if (!trimmedAssetUri) return null

  const photosDirectoryUri = getPhotosDirectoryUri(userId)
  if (!photosDirectoryUri) return null

  const id = generateUuid()
  const photoUri = `${photosDirectoryUri}${id}.jpg`

  try {
    await ensureUserDirectory(userId)
    await FileSystem.copyAsync({ from: trimmedAssetUri, to: photoUri })

    const entry: CheckinEntry = {
      id,
      userId,
      takenAtISO: normalizeTakenAtISO(metadata.takenAtISO),
      pose: parsePose(metadata.pose),
      photoUri,
      width: toPositiveNumberOrUndefined(metadata.width),
      height: toPositiveNumberOrUndefined(metadata.height),
      notes: toTrimmedStringOrUndefined(metadata.notes),
      weightKg: toPositiveNumberOrUndefined(metadata.weightKg),
      syncState: 'pending',
    }

    const index = await loadIndex(userId)
    await saveIndex(userId, {
      ...index,
      entries: sortByNewest([...index.entries, entry]),
    })

    return entry
  } catch {
    try {
      await FileSystem.deleteAsync(photoUri, { idempotent: true })
    } catch {
      // Best-effort cleanup.
    }

    return null
  }
}

export async function deleteCheckin(userId: string, checkinId: string): Promise<void> {
  if (!userId || !checkinId) return

  const index = await loadIndex(userId)
  const existing = index.entries.find((entry) => entry.id === checkinId)
  if (!existing) return

  if (existing.photoUri) {
    try {
      await FileSystem.deleteAsync(existing.photoUri, { idempotent: true })
    } catch {
      // Best-effort cleanup.
    }
  }

  await saveIndex(userId, {
    ...index,
    entries: index.entries.filter((entry) => entry.id !== checkinId),
  })
}

function addDays(iso: string, days: number): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  date.setTime(date.getTime() + days * DAY_MS)
  return date.toISOString()
}

export async function getCheckinDueInfo(
  userId: string,
  now: Date = new Date(),
): Promise<CheckinDueInfo> {
  if (!userId) {
    return {
      nextDueAtISO: null,
      isDue: false,
      lastPromptedAtISO: null,
    }
  }

  const index = await loadIndex(userId)
  const latest = sortByNewest(index.entries)[0]

  if (!latest) {
    return {
      nextDueAtISO: null,
      isDue: false,
      lastPromptedAtISO: index.lastPromptedAtISO,
    }
  }

  const nextDueAtISO = addDays(latest.takenAtISO, DUE_INTERVAL_DAYS)

  return {
    nextDueAtISO,
    isDue:
      nextDueAtISO !== null &&
      Number.isFinite(now.getTime()) &&
      now.getTime() >= new Date(nextDueAtISO).getTime(),
    lastPromptedAtISO: index.lastPromptedAtISO,
  }
}

export async function markCheckinPromptedNow(
  userId: string,
  now: Date = new Date(),
): Promise<string | null> {
  if (!userId) return null

  const nowISO = now.toISOString()
  const index = await loadIndex(userId)
  await saveIndex(userId, {
    ...index,
    lastPromptedAtISO: nowISO,
  })

  return nowISO
}

export async function patchCheckinCloudFields(
  userId: string,
  checkinId: string,
  patch: CheckinCloudPatch,
): Promise<CheckinEntry | null> {
  if (!userId || !checkinId) return null

  const index = await loadIndex(userId)
  const current = index.entries.find((entry) => entry.id === checkinId)
  if (!current) return null

  const next: CheckinEntry = {
    ...current,
    remotePath: patch.remotePath === null ? undefined : (patch.remotePath ?? current.remotePath),
    syncState: patch.syncState === null ? undefined : (patch.syncState ?? current.syncState),
    cloudSyncedAtISO:
      patch.cloudSyncedAtISO === null
        ? undefined
        : (toIsoOrNull(patch.cloudSyncedAtISO) ??
          (patch.cloudSyncedAtISO ? undefined : current.cloudSyncedAtISO)),
    lastSyncError:
      patch.lastSyncError === null
        ? undefined
        : (toTrimmedStringOrUndefined(patch.lastSyncError) ??
          (patch.lastSyncError ? undefined : current.lastSyncError)),
    remoteSignedUrl:
      patch.remoteSignedUrl === null
        ? undefined
        : (patch.remoteSignedUrl ?? current.remoteSignedUrl),
    remoteSignedUrlExpiresAtISO:
      patch.remoteSignedUrlExpiresAtISO === null
        ? undefined
        : (toIsoOrNull(patch.remoteSignedUrlExpiresAtISO) ??
          (patch.remoteSignedUrlExpiresAtISO ? undefined : current.remoteSignedUrlExpiresAtISO)),
  }

  await saveIndex(userId, {
    ...index,
    entries: sortByNewest(index.entries.map((entry) => (entry.id === checkinId ? next : entry))),
  })

  return next
}

export async function mergeRemoteCheckins(
  userId: string,
  remoteEntries: RemoteCheckinInput[],
): Promise<CheckinEntry[]> {
  if (!userId) return []
  if (!Array.isArray(remoteEntries) || remoteEntries.length === 0) {
    return listCheckins(userId)
  }

  const index = await loadIndex(userId)
  const byId = new Map(index.entries.map((entry) => [entry.id, entry]))

  for (const remote of remoteEntries) {
    if (!remote?.id || !remote?.remotePath) continue

    const existing = byId.get(remote.id)
    const merged: CheckinEntry = {
      id: remote.id,
      userId,
      takenAtISO: normalizeTakenAtISO(remote.takenAtISO),
      pose: parsePose(remote.pose),
      photoUri: existing?.photoUri,
      width: toPositiveNumberOrUndefined(remote.width) ?? existing?.width,
      height: toPositiveNumberOrUndefined(remote.height) ?? existing?.height,
      notes: toTrimmedStringOrUndefined(remote.notes) ?? existing?.notes,
      weightKg: toPositiveNumberOrUndefined(remote.weightKg) ?? existing?.weightKg,
      remotePath: remote.remotePath,
      syncState: 'synced',
      cloudSyncedAtISO:
        toIsoOrNull(remote.cloudSyncedAtISO) ??
        existing?.cloudSyncedAtISO ??
        new Date().toISOString(),
      lastSyncError: undefined,
      remoteSignedUrl: existing?.remoteSignedUrl,
      remoteSignedUrlExpiresAtISO: existing?.remoteSignedUrlExpiresAtISO,
    }

    byId.set(remote.id, merged)
  }

  const mergedEntries = sortByNewest(Array.from(byId.values()))
  await saveIndex(userId, {
    ...index,
    entries: mergedEntries,
  })

  return mergedEntries
}
