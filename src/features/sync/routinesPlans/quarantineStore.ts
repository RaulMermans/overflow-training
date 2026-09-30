import * as SecureStore from 'expo-secure-store'
import type { QuarantinableIssue } from './validation'

const QUARANTINE_KEY_PREFIX = 'sync.routinesPlans.quarantine.v1'

export interface RoutinesPlansQuarantineRecord {
  entityType: QuarantinableIssue['entityType']
  entityId: string
  reason: string
  firstSeenAt: string
  lastSeenAt: string
  occurrences: number
}

export interface RoutinesPlansQuarantineSnapshot {
  records: RoutinesPlansQuarantineRecord[]
}

function getQuarantineKey(userId: string): string {
  return `${QUARANTINE_KEY_PREFIX}.${userId}`
}

function parseSnapshot(raw: string | null): RoutinesPlansQuarantineSnapshot {
  if (!raw) return { records: [] }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.records)) {
      return { records: [] }
    }

    const rawRecords = parsed.records as unknown[]
    const records = rawRecords
      .filter((entry: unknown) => entry && typeof entry === 'object')
      .map((entry: unknown) => {
        const candidate = entry as Partial<RoutinesPlansQuarantineRecord>
        const entityType =
          candidate.entityType === 'routine' || candidate.entityType === 'plan_day'
            ? candidate.entityType
            : null
        const entityId = typeof candidate.entityId === 'string' ? candidate.entityId.trim() : ''
        const reason = typeof candidate.reason === 'string' ? candidate.reason.trim() : ''
        const firstSeenAt =
          typeof candidate.firstSeenAt === 'string' && candidate.firstSeenAt
            ? candidate.firstSeenAt
            : new Date(0).toISOString()
        const lastSeenAt =
          typeof candidate.lastSeenAt === 'string' && candidate.lastSeenAt
            ? candidate.lastSeenAt
            : firstSeenAt
        const occurrences =
          typeof candidate.occurrences === 'number' && Number.isFinite(candidate.occurrences)
            ? Math.max(1, Math.round(candidate.occurrences))
            : 1

        if (!entityType || !entityId || !reason) {
          return null
        }

        return {
          entityType,
          entityId,
          reason,
          firstSeenAt,
          lastSeenAt,
          occurrences,
        } as RoutinesPlansQuarantineRecord
      })
      .filter((entry): entry is RoutinesPlansQuarantineRecord => entry !== null)
      .sort((a: RoutinesPlansQuarantineRecord, b: RoutinesPlansQuarantineRecord) =>
        b.lastSeenAt.localeCompare(a.lastSeenAt),
      )

    return { records }
  } catch {
    return { records: [] }
  }
}

async function persistSnapshot(
  userId: string,
  snapshot: RoutinesPlansQuarantineSnapshot,
): Promise<void> {
  if (!userId) return

  try {
    await SecureStore.setItemAsync(getQuarantineKey(userId), JSON.stringify(snapshot))
  } catch {
    // Persistence failures should never block sync.
  }
}

export async function loadRoutinesPlansQuarantine(
  userId: string,
): Promise<RoutinesPlansQuarantineSnapshot> {
  if (!userId) {
    return { records: [] }
  }

  try {
    const raw = await SecureStore.getItemAsync(getQuarantineKey(userId))
    return parseSnapshot(raw)
  } catch {
    return { records: [] }
  }
}

export async function clearRoutinesPlansQuarantine(userId: string): Promise<void> {
  if (!userId) return

  try {
    await SecureStore.deleteItemAsync(getQuarantineKey(userId))
  } catch {
    // Persistence failures should never block sync.
  }
}

export async function recordRoutinesPlansQuarantine(
  userId: string,
  issues: QuarantinableIssue[],
): Promise<RoutinesPlansQuarantineSnapshot> {
  if (!userId || issues.length === 0) {
    return loadRoutinesPlansQuarantine(userId)
  }

  const existing = await loadRoutinesPlansQuarantine(userId)
  const now = new Date().toISOString()
  const byKey = new Map<string, RoutinesPlansQuarantineRecord>()

  for (const record of existing.records) {
    const key = `${record.entityType}:${record.entityId}:${record.reason}`
    byKey.set(key, record)
  }

  for (const issue of issues) {
    const key = `${issue.entityType}:${issue.entityId}:${issue.reason}`
    const existingRecord = byKey.get(key)

    if (!existingRecord) {
      byKey.set(key, {
        entityType: issue.entityType,
        entityId: issue.entityId,
        reason: issue.reason,
        firstSeenAt: now,
        lastSeenAt: now,
        occurrences: 1,
      })
      continue
    }

    byKey.set(key, {
      ...existingRecord,
      lastSeenAt: now,
      occurrences: existingRecord.occurrences + 1,
    })
  }

  const snapshot: RoutinesPlansQuarantineSnapshot = {
    records: [...byKey.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)),
  }

  await persistSnapshot(userId, snapshot)
  return snapshot
}

export function summarizeQuarantineReasons(
  records: RoutinesPlansQuarantineRecord[],
  maxReasons = 3,
): string[] {
  if (records.length === 0) return []

  const reasonCounts = new Map<string, number>()

  for (const record of records) {
    reasonCounts.set(record.reason, (reasonCounts.get(record.reason) ?? 0) + record.occurrences)
  }

  return [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, maxReasons))
    .map(([reason]) => reason)
}
