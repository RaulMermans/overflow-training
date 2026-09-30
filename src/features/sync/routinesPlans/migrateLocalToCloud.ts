import * as SecureStore from 'expo-secure-store'
import {
  loadRoutineUsage,
  loadRoutines,
  normalizeRoutineSection,
  replaceRoutinesSnapshot,
  replaceRoutineUsageSnapshot,
  type Routine,
  type RoutineUsageMap,
} from '../../../lib/routines'
import { isUuid, uuidFromString } from '../../../lib/ids'
import { normalizeRoutineName, routineStructureHash } from './hash'

// v2 prefix ensures the deduplication + normalization pass re-runs for
// accounts that only completed v1, picking up any subsequent repair logic.
const MIGRATION_KEY_PREFIX = 'sync.routinesPlans.migration.v2'
const LEGACY_MIGRATION_KEY_PREFIX = 'sync.routinesPlans.migration.v1'

function getMigrationKey(userId: string): string {
  return `${MIGRATION_KEY_PREFIX}.${userId}`
}

function getLegacyMigrationKey(userId: string): string {
  return `${LEGACY_MIGRATION_KEY_PREFIX}.${userId}`
}

export async function clearRoutinesPlansMigrationMarker(userId: string): Promise<void> {
  if (!userId) return

  try {
    await Promise.all([
      SecureStore.deleteItemAsync(getMigrationKey(userId)),
      SecureStore.deleteItemAsync(getLegacyMigrationKey(userId)),
    ])
  } catch {
    // Persistence failures should not crash app usage.
  }
}

function resolveRoutineId(routine: Routine): string {
  if (routine.clientUuid && isUuid(routine.clientUuid)) return routine.clientUuid
  if (isUuid(routine.id)) return routine.id
  return uuidFromString(`routine:${routine.id}`)
}

function dedupeRoutines(routines: Routine[]): {
  routines: Routine[]
  idMap: Record<string, string>
} {
  const idMap: Record<string, string> = {}
  const byDedupeKey = new Map<string, Routine>()

  const sorted = [...routines].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  for (const routine of sorted) {
    const nextId = resolveRoutineId(routine)
    const normalizedRoutine: Routine = {
      ...routine,
      id: nextId,
      clientUuid: nextId,
      dirty: routine.dirty === true,
      updatedAt: routine.updatedAt || new Date().toISOString(),
      items: routine.items.map((item) => ({
        ...item,
        section: normalizeRoutineSection(item.section),
        clientUuid:
          typeof item.clientUuid === 'string' && item.clientUuid
            ? item.clientUuid
            : uuidFromString(`${nextId}:${item.exerciseDefinitionId}`),
        updatedAt: item.updatedAt ?? routine.updatedAt,
      })),
    }

    idMap[routine.id] = nextId

    const dedupeKey = `${normalizeRoutineName(normalizedRoutine.name)}::${routineStructureHash(normalizedRoutine)}`
    const existing = byDedupeKey.get(dedupeKey)

    if (!existing) {
      byDedupeKey.set(dedupeKey, normalizedRoutine)
      continue
    }

    idMap[routine.id] = existing.id
  }

  return {
    routines: [...byDedupeKey.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    idMap,
  }
}

function remapUsage(usage: RoutineUsageMap, idMap: Record<string, string>): RoutineUsageMap {
  const next: RoutineUsageMap = {}

  for (const [routineId, entry] of Object.entries(usage)) {
    const mappedId = idMap[routineId] ?? routineId
    const existing = next[mappedId]

    if (!existing) {
      next[mappedId] = entry
      continue
    }

    next[mappedId] = {
      usedCount: existing.usedCount + entry.usedCount,
      lastUsedAt: existing.lastUsedAt >= entry.lastUsedAt ? existing.lastUsedAt : entry.lastUsedAt,
    }
  }

  return next
}

export async function migrateLocalRoutinesAndPlansForSync(userId: string): Promise<{
  applied: boolean
  routinesCount: number
}> {
  if (!userId) {
    return { applied: false, routinesCount: 0 }
  }

  const migrationKey = getMigrationKey(userId)
  const alreadyMigrated = await SecureStore.getItemAsync(migrationKey)
  if (alreadyMigrated === '1') {
    const routines = await loadRoutines(userId)
    return { applied: false, routinesCount: routines.length }
  }

  const [routines, usage] = await Promise.all([loadRoutines(userId), loadRoutineUsage(userId)])

  const { routines: dedupedRoutines, idMap } = dedupeRoutines(routines)
  const remappedUsage = remapUsage(usage, idMap)

  await Promise.all([
    replaceRoutinesSnapshot(userId, dedupedRoutines),
    replaceRoutineUsageSnapshot(userId, remappedUsage),
  ])

  await SecureStore.setItemAsync(migrationKey, '1')

  return {
    applied: true,
    routinesCount: dedupedRoutines.length,
  }
}
