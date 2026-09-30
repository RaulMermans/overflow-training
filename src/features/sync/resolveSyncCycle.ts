import { sanitizeErrorMessage } from '../../utils/errorMessages'
import type { RoutinesPlansSyncResult } from './routinesPlans/syncEngine'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'
export type SyncErrorSource = 'routinesPlans' | 'outbox' | null

export interface OutboxSyncSummary {
  offline: boolean
  lastErrorMessage: string | null
  retried: number
}

interface ResolveSyncCycleInput {
  routinesSyncResult: RoutinesPlansSyncResult
  outboxResult: OutboxSyncSummary
  blockedCount: number
  failOpenRoutinePlanSync: boolean
}

interface ResolveSyncCycleOutput {
  nextStatus: SyncStatus
  lastErrorSource: SyncErrorSource
  combinedErrorMessage: string | null
  hasScheduleWarning: boolean
}

export function resolveSyncCycle({
  routinesSyncResult,
  outboxResult,
  blockedCount,
  failOpenRoutinePlanSync,
}: ResolveSyncCycleInput): ResolveSyncCycleOutput {
  const hasOutboxBlocked = blockedCount > 0
  const hasOutboxRetrying = outboxResult.retried > 0
  const hasRoutinesPlansData =
    routinesSyncResult.routinesCount > 0 || routinesSyncResult.plansCount > 0
  const hasRecoverableScheduleIssue =
    failOpenRoutinePlanSync &&
    routinesSyncResult.status === 'error' &&
    routinesSyncResult.recoverableError
  const hasRoutinesPlansFatalError =
    routinesSyncResult.status === 'error' && hasRoutinesPlansData && !hasRecoverableScheduleIssue
  const hasScheduleWarning =
    hasRecoverableScheduleIssue ||
    routinesSyncResult.warningCount > 0 ||
    routinesSyncResult.quarantinedCount > 0
  const hasError = hasOutboxBlocked || hasOutboxRetrying || hasRoutinesPlansFatalError
  const isOffline = routinesSyncResult.status === 'offline' || outboxResult.offline

  const nextStatus: SyncStatus = hasError
    ? isOffline
      ? 'offline'
      : 'error'
    : isOffline
      ? 'offline'
      : 'synced'
  const lastErrorSource: SyncErrorSource =
    hasOutboxBlocked || hasOutboxRetrying
      ? 'outbox'
      : hasRoutinesPlansFatalError || hasScheduleWarning
        ? 'routinesPlans'
        : null

  const routinesErrorMessage = routinesSyncResult.errorMessage
    ? `Schedule sync failed: ${sanitizeErrorMessage(routinesSyncResult.errorMessage)}`
    : null
  const outboxErrorMessage = hasOutboxBlocked
    ? `Workout sync blocked: ${sanitizeErrorMessage(outboxResult.lastErrorMessage ?? 'Sync blocked.')}`
    : hasOutboxRetrying
      ? `Workout sync retrying: ${sanitizeErrorMessage(
          outboxResult.lastErrorMessage ?? 'Temporary sync issue.',
        )}`
      : null
  const warningMessage =
    hasScheduleWarning && !hasError
      ? (routinesErrorMessage ??
        `Schedule sync warning: ${routinesSyncResult.quarantinedCount} entries were quarantined.`)
      : null
  const rawErrorMessage =
    outboxErrorMessage ?? (hasRoutinesPlansFatalError ? routinesErrorMessage : null)
  const combinedErrorMessage =
    nextStatus === 'offline' && !rawErrorMessage
      ? 'Offline - changes will sync when you are back online.'
      : (rawErrorMessage ?? warningMessage ?? null)

  return {
    nextStatus,
    lastErrorSource,
    combinedErrorMessage,
    hasScheduleWarning,
  }
}
