import {
  callRpcUserLastChanged,
  callRpcWhoami,
  fetchCloudRoutinesWithItems,
  upsertCloudRoutineWithItems,
  type CloudRoutineWithItems,
} from '../../../db/routinesPlans'
import { defaultShouldRetry } from '../../../lib/retry'
import { toCloudRoutinePayload } from '../../../db/routineCloudPayload'
import {
  loadRoutines,
  normalizeRoutineSection,
  replaceRoutinesSnapshot,
  type Routine,
  type RoutineSection,
} from '../../../lib/routines'
import { mergeRoutines, type MergeRoutine } from './merge'
import { migrateLocalRoutinesAndPlansForSync } from './migrateLocalToCloud'
import { ENABLE_FAIL_OPEN_ROUTINE_PLAN_SYNC } from '../../../config/featureFlags'
import {
  recordRoutinesPlansQuarantine,
  summarizeQuarantineReasons,
  type RoutinesPlansQuarantineRecord,
} from './quarantineStore'
import {
  isFatalRoutinesPlansError,
  isRecoverableRoutinesPlansError,
  validateRoutinePayload,
  type QuarantinableIssue,
} from './validation'

// Process-level lock: prevents concurrent sync runs for the same user.
// Keyed by userId so multiple users can sync simultaneously.
const _syncInProgress = new Set<string>()

export type RoutinesPlansSyncStatus = 'synced' | 'offline' | 'error' | 'skipped'

export interface RoutinesPlansSyncResult {
  status: RoutinesPlansSyncStatus
  migrationApplied: boolean
  routinesCount: number
  plansCount: number
  errorMessage: string | null
  warningCount: number
  quarantinedCount: number
  recoverableError: boolean
  quarantineReasons: string[]
  planningLastChanged: string | null
}

function isRetryableSyncError(error: unknown): boolean {
  return defaultShouldRetry(error)
}

function parseSectionFromNotes(notes: string | null | undefined): RoutineSection {
  if (!notes) return 'main'

  try {
    const parsed = JSON.parse(notes)
    return normalizeRoutineSection((parsed as { section?: unknown }).section)
  } catch {
    return 'main'
  }
}

function buildCloudIdToClientUuidMap(
  routines: CloudRoutineWithItems[] | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {}

  for (const routine of routines ?? []) {
    const cloudId = typeof routine.id === 'string' ? routine.id.trim() : ''
    const clientUuid = typeof routine.client_uuid === 'string' ? routine.client_uuid.trim() : ''

    if (!clientUuid) continue
    map[clientUuid] = clientUuid
    if (cloudId) {
      map[cloudId] = clientUuid
    }
  }

  return map
}

function buildClientUuidToCloudIdMap(
  routines: CloudRoutineWithItems[] | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {}

  for (const routine of routines ?? []) {
    const cloudId = typeof routine.id === 'string' ? routine.id.trim() : ''
    const clientUuid = typeof routine.client_uuid === 'string' ? routine.client_uuid.trim() : ''

    if (!cloudId || !clientUuid) continue
    map[clientUuid] = cloudId
  }

  return map
}

export function toRoutineFromCloud(routine: CloudRoutineWithItems): MergeRoutine {
  const items = [...(routine.routine_items ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      exerciseDefinitionId: item.exercise_id,
      orderIndex: index,
      section: parseSectionFromNotes(item.notes),
      clientUuid: item.client_uuid,
      updatedAt: item.updated_at ?? undefined,
      defaultSets: item.sets ?? null,
      defaultReps: item.reps ?? null,
    }))

  return {
    id: routine.client_uuid,
    clientUuid: routine.client_uuid,
    name: routine.name,
    description: routine.description ?? null,
    color: routine.color ?? null,
    createdAt: routine.created_at ?? new Date().toISOString(),
    updatedAt: routine.updated_at ?? new Date().toISOString(),
    pinned: routine.pinned === true,
    deletedAt: null,
    dirty: false,
    items,
  }
}

function toIssueSummary(issues: QuarantinableIssue[]): string[] {
  if (issues.length === 0) return []

  return summarizeQuarantineReasons(
    issues.map(
      (issue) =>
        ({
          entityType: issue.entityType,
          entityId: issue.entityId,
          reason: issue.reason,
          firstSeenAt: '',
          lastSeenAt: '',
          occurrences: 1,
        }) as RoutinesPlansQuarantineRecord,
    ),
  )
}

export async function runRoutinesPlansSync(userId: string): Promise<RoutinesPlansSyncResult> {
  if (!userId) {
    return {
      status: 'error',
      migrationApplied: false,
      routinesCount: 0,
      plansCount: 0,
      errorMessage: 'Missing user id.',
      warningCount: 0,
      quarantinedCount: 0,
      recoverableError: false,
      quarantineReasons: [],
      planningLastChanged: null,
    }
  }

  if (_syncInProgress.has(userId)) {
    return {
      status: 'skipped',
      migrationApplied: false,
      routinesCount: 0,
      plansCount: 0,
      errorMessage: null,
      warningCount: 0,
      quarantinedCount: 0,
      recoverableError: false,
      quarantineReasons: [],
      planningLastChanged: null,
    }
  }
  _syncInProgress.add(userId)

  let localRoutinesCount = 0
  let migrationApplied = false
  let warningCount = 0
  let recoverableError = false
  const quarantineIssues: QuarantinableIssue[] = []

  const pushQuarantineIssue = (issue: QuarantinableIssue): void => {
    warningCount += 1
    quarantineIssues.push(issue)
  }

  try {
    // Pre-flight: verify auth context is valid before expensive sync work.
    // If the RPC itself errors (network/cold-start) we fall through and let
    // the real sync surface the failure. If the RPC succeeds but uid is null
    // the JWT is broken — fail fast before touching cloud data.
    const whoami = await callRpcWhoami()
    if (whoami.data != null && whoami.data.uid == null) {
      return {
        status: 'error',
        migrationApplied: false,
        routinesCount: 0,
        plansCount: 0,
        errorMessage: 'Auth context missing: rpc_whoami returned null uid.',
        warningCount: 0,
        quarantinedCount: 0,
        recoverableError: false,
        quarantineReasons: [],
        planningLastChanged: null,
      }
    }

    const migration = await migrateLocalRoutinesAndPlansForSync(userId)
    migrationApplied = migration.applied
    const localRoutines = await loadRoutines(userId)
    localRoutinesCount = localRoutines.length

    const cloudRoutinesResponse = await fetchCloudRoutinesWithItems(userId)
    if (cloudRoutinesResponse.error) {
      throw cloudRoutinesResponse.error
    }

    const cloudRoutinesByClientUuid = new Map<string, CloudRoutineWithItems>()
    for (const routine of cloudRoutinesResponse.data ?? []) {
      const clientUuid = typeof routine.client_uuid === 'string' ? routine.client_uuid.trim() : ''
      if (!clientUuid) continue
      cloudRoutinesByClientUuid.set(clientUuid, routine)
    }
    const routineIdByClientUuid = buildClientUuidToCloudIdMap(cloudRoutinesResponse.data)
    const cloudIdToClientUuid = buildCloudIdToClientUuidMap(cloudRoutinesResponse.data)

    const syncableLocalRoutines: Routine[] = []
    for (const routine of localRoutines) {
      const validationIssue = validateRoutinePayload(toCloudRoutinePayload(routine))
      if (validationIssue) {
        pushQuarantineIssue({
          ...validationIssue,
          entityId: routine.id.trim() || validationIssue.entityId,
        })
        continue
      }
      syncableLocalRoutines.push(routine)
    }

    const failedRoutineClientUuids = new Set<string>()

    for (const routine of syncableLocalRoutines) {
      const payload = toCloudRoutinePayload(routine)
      const routineClientUuid = payload.routine.client_uuid.trim()
      if (!routineClientUuid) {
        continue
      }
      const shouldPushRoutine =
        routine.dirty === true || !cloudRoutinesByClientUuid.has(routineClientUuid)
      if (!shouldPushRoutine) {
        continue
      }
      const upsertResponse = await upsertCloudRoutineWithItems({
        userId,
        routine: payload.routine,
        items: payload.items,
      })

      if (upsertResponse.error) {
        if (
          ENABLE_FAIL_OPEN_ROUTINE_PLAN_SYNC &&
          isRecoverableRoutinesPlansError(upsertResponse.error) &&
          !isFatalRoutinesPlansError(upsertResponse.error)
        ) {
          recoverableError = true
          pushQuarantineIssue({
            entityType: 'routine',
            entityId: routine.id.trim(),
            reason: 'remote_routine_upsert_failed',
          })
          failedRoutineClientUuids.add(routineClientUuid)
          continue
        }

        throw upsertResponse.error
      }

      if (upsertResponse.data) {
        const cloudId = upsertResponse.data.id.trim()
        const clientUuid = upsertResponse.data.client_uuid.trim()
        routineIdByClientUuid[clientUuid] = cloudId
        cloudIdToClientUuid[clientUuid] = clientUuid
        cloudIdToClientUuid[cloudId] = clientUuid
        cloudRoutinesByClientUuid.set(clientUuid, upsertResponse.data)
      }
    }

    const remoteRoutines = [...cloudRoutinesByClientUuid.values()].map(toRoutineFromCloud)
    const mergedRoutines = mergeRoutines(syncableLocalRoutines as MergeRoutine[], remoteRoutines)
      .map((routine) => ({
        ...routine,
        dirty: false,
        items: routine.items.map((item) => ({ ...item })),
      }))
      .filter((routine) => {
        const validationIssue = validateRoutinePayload(toCloudRoutinePayload(routine))
        if (!validationIssue) return true

        pushQuarantineIssue({
          ...validationIssue,
          entityId: routine.id.trim() || validationIssue.entityId,
        })
        return false
      })

    if (quarantineIssues.length > 0) {
      await recordRoutinesPlansQuarantine(userId, quarantineIssues)
    }

    await Promise.all([replaceRoutinesSnapshot(userId, mergedRoutines)])

    // Post-sync: capture the server-confirmed planning timestamp for diagnostics.
    // Errors here are non-fatal — sync already succeeded.
    const lastChanged = await callRpcUserLastChanged()
    const planningLastChanged = lastChanged.data?.planning_last_changed ?? null

    return {
      status: 'synced',
      migrationApplied,
      routinesCount: mergedRoutines.length,
      plansCount: 0,
      errorMessage: recoverableError ? 'Schedule sync completed with recoverable errors.' : null,
      warningCount,
      quarantinedCount: quarantineIssues.length,
      recoverableError,
      quarantineReasons: toIssueSummary(quarantineIssues),
      planningLastChanged,
    }
  } catch (error) {
    if (
      ENABLE_FAIL_OPEN_ROUTINE_PLAN_SYNC &&
      isRecoverableRoutinesPlansError(error) &&
      !isFatalRoutinesPlansError(error)
    ) {
      recoverableError = true
      warningCount += 1
    }

    if (quarantineIssues.length > 0) {
      await recordRoutinesPlansQuarantine(userId, quarantineIssues)
    }

    const message = error instanceof Error ? error.message : 'Failed to sync routines and plans.'

    return {
      status: isRetryableSyncError(error) ? 'offline' : 'error',
      migrationApplied,
      routinesCount: localRoutinesCount,
      plansCount: 0,
      errorMessage: message,
      warningCount,
      quarantinedCount: quarantineIssues.length,
      recoverableError,
      quarantineReasons: toIssueSummary(quarantineIssues),
      planningLastChanged: null,
    }
  } finally {
    _syncInProgress.delete(userId)
  }
}
