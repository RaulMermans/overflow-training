import * as FileSystem from 'expo-file-system/legacy'
import { listCheckinPhotoMeta, upsertCheckinPhotoMeta } from '../../db/checkinPhotos'
import { requireSupabase } from '../../lib/supabaseClient'
import {
  listCheckins,
  mergeRemoteCheckins,
  patchCheckinCloudFields,
  type CheckinEntry,
  type CheckinPose,
  type RemoteCheckinInput,
} from './storage'

const CHECKINS_BUCKET = 'checkins'
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24
const SIGNED_URL_REFRESH_WINDOW_MS = 5 * 60 * 1000

const syncingUsers = new Set<string>()

export type CheckinCloudSyncOptions = {
  pullRemote?: boolean
}

export type CheckinCloudSyncResult = {
  uploaded: number
  failed: number
  pulled: number
  error: Error | null
}

function parsePose(value: unknown): CheckinPose {
  if (value === 'side' || value === 'back') return value
  return 'front'
}

function toRemotePath(userId: string, checkinId: string): string {
  return `${userId}/${checkinId}.jpg`
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function shouldRefreshSignedUrl(entry: CheckinEntry, nowEpochMs: number): boolean {
  if (!entry.remoteSignedUrl || !entry.remoteSignedUrlExpiresAtISO) return true

  const expiryEpochMs = new Date(entry.remoteSignedUrlExpiresAtISO).getTime()
  if (!Number.isFinite(expiryEpochMs)) return true

  return expiryEpochMs - nowEpochMs <= SIGNED_URL_REFRESH_WINDOW_MS
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '')
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  const bytesLength = Math.max(0, Math.floor((clean.length * 3) / 4) - padding)
  const bytes = new Uint8Array(bytesLength)

  let byteIndex = 0
  for (let index = 0; index < clean.length; index += 4) {
    const c1 = alphabet.indexOf(clean[index] ?? 'A')
    const c2 = alphabet.indexOf(clean[index + 1] ?? 'A')
    const c3 = clean[index + 2] === '=' ? 0 : alphabet.indexOf(clean[index + 2] ?? 'A')
    const c4 = clean[index + 3] === '=' ? 0 : alphabet.indexOf(clean[index + 3] ?? 'A')
    const chunk = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4

    if (byteIndex < bytesLength) bytes[byteIndex++] = (chunk >> 16) & 0xff
    if (byteIndex < bytesLength) bytes[byteIndex++] = (chunk >> 8) & 0xff
    if (byteIndex < bytesLength) bytes[byteIndex++] = chunk & 0xff
  }

  return bytes.buffer
}

export async function createCheckinSignedUrl(
  remotePath: string,
): Promise<{ url: string | null; expiresAtISO: string | null }> {
  if (!remotePath) {
    return { url: null, expiresAtISO: null }
  }

  const client = requireSupabase()
  const { data, error } = await client.storage
    .from(CHECKINS_BUCKET)
    .createSignedUrl(remotePath, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    return { url: null, expiresAtISO: null }
  }

  return {
    url: data.signedUrl,
    expiresAtISO: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  }
}

async function uploadOne(userId: string, entry: CheckinEntry): Promise<void> {
  const photoUri = entry.photoUri?.trim()
  if (!photoUri) return

  const fileInfo = await FileSystem.getInfoAsync(photoUri)
  if (!fileInfo.exists) {
    throw new Error('Local check-in photo is missing.')
  }

  const client = requireSupabase()
  const remotePath = toRemotePath(userId, entry.id)
  const base64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  const body = base64ToArrayBuffer(base64)

  const uploadResponse = await client.storage.from(CHECKINS_BUCKET).upload(remotePath, body, {
    contentType: 'image/jpeg',
    upsert: true,
  })

  if (uploadResponse.error) {
    throw new Error(uploadResponse.error.message)
  }

  const metaResponse = await upsertCheckinPhotoMeta(userId, {
    checkin_id: entry.id,
    taken_at: entry.takenAtISO,
    pose: entry.pose,
    photo_path: remotePath,
    width: entry.width ?? null,
    height: entry.height ?? null,
    notes: entry.notes ?? null,
    weight_kg: entry.weightKg ?? null,
  })

  if (metaResponse.error) {
    throw metaResponse.error
  }

  await patchCheckinCloudFields(userId, entry.id, {
    remotePath,
    syncState: 'synced',
    cloudSyncedAtISO: new Date().toISOString(),
    lastSyncError: null,
  })
}

function mapRemoteRowsToEntries(
  rows: Array<{
    checkin_id: string
    taken_at: string
    pose: string
    photo_path: string
    width?: number | null
    height?: number | null
    notes?: string | null
    weight_kg?: number | null
    updated_at?: string | null
  }>,
): RemoteCheckinInput[] {
  return rows
    .filter((row) => Boolean(row?.checkin_id) && Boolean(row?.photo_path))
    .map((row) => ({
      id: row.checkin_id,
      takenAtISO: row.taken_at,
      pose: parsePose(row.pose),
      remotePath: row.photo_path,
      width: row.width ?? null,
      height: row.height ?? null,
      notes: row.notes ?? null,
      weightKg: row.weight_kg ?? null,
      cloudSyncedAtISO: toIsoOrNull(row.updated_at) ?? new Date().toISOString(),
    }))
}

export async function syncCheckinsCloud(
  userId: string,
  options: CheckinCloudSyncOptions = {},
): Promise<CheckinCloudSyncResult> {
  if (!userId) {
    return { uploaded: 0, failed: 0, pulled: 0, error: null }
  }

  if (syncingUsers.has(userId)) {
    return { uploaded: 0, failed: 0, pulled: 0, error: null }
  }

  syncingUsers.add(userId)

  let uploaded = 0
  let failed = 0
  let pulled = 0
  let syncError: Error | null = null

  try {
    const localEntries = await listCheckins(userId)
    const pendingEntries = localEntries.filter(
      (entry) =>
        Boolean(entry.photoUri) &&
        (!entry.remotePath || entry.syncState === 'pending' || entry.syncState === 'failed'),
    )

    for (const entry of pendingEntries) {
      try {
        await uploadOne(userId, entry)
        uploaded += 1
      } catch (error) {
        failed += 1
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : 'Check-in sync failed.'
        await patchCheckinCloudFields(userId, entry.id, {
          syncState: 'failed',
          lastSyncError: message,
        })
      }
    }

    if (options.pullRemote) {
      const remoteResponse = await listCheckinPhotoMeta(userId)
      if (remoteResponse.error) {
        syncError = remoteResponse.error
      } else {
        const remoteEntries = mapRemoteRowsToEntries(remoteResponse.data ?? [])
        pulled = remoteEntries.length
        await mergeRemoteCheckins(userId, remoteEntries)
      }
    }
  } catch (error) {
    syncError = error instanceof Error ? error : new Error('Unexpected check-in sync failure.')
  } finally {
    syncingUsers.delete(userId)
  }

  return {
    uploaded,
    failed,
    pulled,
    error: syncError,
  }
}

export async function resolveCheckinImageUri(
  userId: string,
  entry: CheckinEntry | null,
): Promise<string | null> {
  if (!userId || !entry) return null

  const localUri = entry.photoUri?.trim()
  if (localUri) {
    try {
      const info = await FileSystem.getInfoAsync(localUri)
      if (info.exists) {
        return localUri
      }
    } catch {
      // Fall through to remote path.
    }
  }

  if (!entry.remotePath) {
    return localUri ?? null
  }

  const nowEpochMs = Date.now()
  if (!shouldRefreshSignedUrl(entry, nowEpochMs) && entry.remoteSignedUrl) {
    return entry.remoteSignedUrl
  }

  const signed = await createCheckinSignedUrl(entry.remotePath)
  if (!signed.url) {
    return null
  }

  await patchCheckinCloudFields(userId, entry.id, {
    remoteSignedUrl: signed.url,
    remoteSignedUrlExpiresAtISO: signed.expiresAtISO,
  })

  return signed.url
}
