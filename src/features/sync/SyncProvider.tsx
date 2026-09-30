import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppState } from 'react-native'
import { useAuth } from '../../auth/useAuth'
import { invalidateAllAnalytics } from '../analytics/analyticsCache'
import { flushPendingFavorites } from '../../db/favorites'
import {
  ENABLE_FAIL_OPEN_ROUTINE_PLAN_SYNC,
  ENABLE_ROUTINE_PLAN_SYNC,
  ENABLE_WORKOUT_OUTBOX,
} from '../../config/featureFlags'
import { generateUuid } from '../../lib/ids'
import { classifySyncError, type SyncErrorCode } from '../../lib/sync/syncErrorTaxonomy'
import { emitSyncEnd, emitSyncEntityFailure, emitSyncStart } from '../../lib/sync/syncEvents'
import { sanitizeErrorMessage } from '../../utils/errorMessages'
import { runRoutinesPlansSync } from './routinesPlans/syncEngine'
import { flushOutboxQueue, loadOutboxState } from './outbox/worker'
import { syncCheckinsCloud } from '../checkins/cloudSync'
import { repairScheduleDataForUser, resetLocalSyncArtifactsForUser } from './sessionCleanup'
import { computeNextSyncDelayMs, SYNC_BASE_DELAY_MS } from './syncBackoff'
import { subscribe } from './syncTriggers'
import { resolveSyncCycle, type SyncErrorSource, type SyncStatus } from './resolveSyncCycle'

type RoutinesPlansStatus = 'synced' | 'offline' | 'error' | 'skipped'

export interface SyncRefreshResult {
  status: SyncStatus
  errorMessage: string | null
  lastErrorSource: SyncErrorSource
  lastRoutinesPlansStatus: RoutinesPlansStatus
}

interface SyncContextValue {
  status: SyncStatus
  pendingCount: number
  pausedByAuth: boolean
  migrationRunning: boolean
  lastSyncedAt: string | null
  lastAttemptedAt: string | null
  errorMessage: string | null
  lastErrorCode: SyncErrorCode | null
  lastErrorRetryable: boolean
  hasScheduleWarning: boolean
  lastErrorSource: SyncErrorSource
  lastOutboxBlocked: number
  lastOutboxOffline: boolean
  lastOutboxPausedByAuth: boolean
  lastRoutinesPlansStatus: RoutinesPlansStatus
  lastRoutinesPlansWarningCount: number
  lastRoutinesPlansQuarantinedCount: number
  lastRoutinesPlansRecoverableError: boolean
  lastRoutinesPlansQuarantineReasons: string[]
  refresh: () => Promise<SyncRefreshResult>
  resetLocalSync: () => Promise<void>
  repairScheduleData: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined)

const INITIAL_STATE: Omit<SyncContextValue, 'refresh' | 'resetLocalSync' | 'repairScheduleData'> = {
  status: 'idle',
  pendingCount: 0,
  pausedByAuth: false,
  migrationRunning: false,
  lastSyncedAt: null,
  lastAttemptedAt: null,
  errorMessage: null,
  lastErrorCode: null,
  lastErrorRetryable: false,
  hasScheduleWarning: false,
  lastErrorSource: null,
  lastOutboxBlocked: 0,
  lastOutboxOffline: false,
  lastOutboxPausedByAuth: false,
  lastRoutinesPlansStatus: 'synced',
  lastRoutinesPlansWarningCount: 0,
  lastRoutinesPlansQuarantinedCount: 0,
  lastRoutinesPlansRecoverableError: false,
  lastRoutinesPlansQuarantineReasons: [],
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [state, setState] = useState(INITIAL_STATE)
  const [appState, setAppState] = useState(AppState.currentState)
  const [syncDelayMs, setSyncDelayMs] = useState(SYNC_BASE_DELAY_MS)
  const isRunningRef = useRef(false)
  const inFlightSyncRef = useRef<Promise<SyncRefreshResult> | null>(null)
  const pendingAuthRetryRef = useRef(false)

  const runSyncCycle = useCallback(async (): Promise<SyncRefreshResult> => {
    if (!user?.id) {
      setState(INITIAL_STATE)
      setSyncDelayMs(SYNC_BASE_DELAY_MS)
      return {
        status: 'idle',
        errorMessage: null,
        lastErrorSource: null,
        lastRoutinesPlansStatus: 'synced',
      }
    }

    if (appState !== 'active') {
      return {
        status: state.status,
        errorMessage: state.errorMessage,
        lastErrorSource: state.lastErrorSource,
        lastRoutinesPlansStatus: state.lastRoutinesPlansStatus,
      }
    }

    if (inFlightSyncRef.current) {
      return inFlightSyncRef.current
    }

    const syncPromise = (async (): Promise<SyncRefreshResult> => {
      isRunningRef.current = true

      setState((prev) => ({
        ...prev,
        status: 'syncing',
        errorMessage: null,
        lastErrorCode: null,
        lastErrorRetryable: false,
      }))

      const syncId = generateUuid()
      const startedAt = Date.now()
      const entities: string[] = []
      if (ENABLE_ROUTINE_PLAN_SYNC) entities.push('routines_plans')
      if (ENABLE_WORKOUT_OUTBOX) entities.push('workouts')

      const preSyncOutboxState = ENABLE_WORKOUT_OUTBOX
        ? await loadOutboxState(user.id)
        : { events: [] }
      const localQueueCount = preSyncOutboxState.events.filter((e) => e.status === 'pending').length

      emitSyncStart({
        syncId,
        entities,
        direction: 'both',
        localQueueCount: localQueueCount > 0 ? localQueueCount : undefined,
      })

      try {
        const routinesSyncResult = ENABLE_ROUTINE_PLAN_SYNC
          ? await runRoutinesPlansSync(user.id)
          : {
              status: 'synced' as const,
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

        const outboxResult = ENABLE_WORKOUT_OUTBOX
          ? await flushOutboxQueue(user.id)
          : {
              attempted: 0,
              synced: 0,
              retried: 0,
              blocked: 0,
              pausedByAuth: false,
              offline: false,
              lastErrorMessage: null,
              lastAttemptedAt: null,
            }

        if (ENABLE_WORKOUT_OUTBOX && outboxResult.synced > 0) {
          void invalidateAllAnalytics(queryClient)
        }

        // Step 4: If the outbox was paused by an auth failure, schedule a one-shot
        // retry after a short delay to catch a token that refreshes quickly.
        // pendingAuthRetryRef prevents stacking multiple timeouts.
        if (outboxResult.pausedByAuth && !pendingAuthRetryRef.current) {
          pendingAuthRetryRef.current = true
          setTimeout(() => {
            pendingAuthRetryRef.current = false
            void runSyncCycle()
          }, 3000)
        }

        const favoritesFlushResult = await flushPendingFavorites(user.id)
        const outboxState = ENABLE_WORKOUT_OUTBOX ? await loadOutboxState(user.id) : { events: [] }
        const pendingCount = outboxState.events.filter((event) => event.status === 'pending').length
        const blockedCount = outboxState.events.filter((event) => event.status === 'blocked').length
        void syncCheckinsCloud(user.id, { pullRemote: false })

        if (__DEV__ && favoritesFlushResult.error) {
          console.warn('Favorites sync warning:', favoritesFlushResult.error.message)
        }

        let entitySuccessCount = 0
        let entityFailureCount = 0
        let retryableFailureCount = 0
        let lastErrorCode: SyncErrorCode | undefined

        if (routinesSyncResult.status === 'synced' || routinesSyncResult.status === 'skipped') {
          entitySuccessCount += 1
        } else if (routinesSyncResult.status === 'error' && routinesSyncResult.errorMessage) {
          entityFailureCount += 1
          const classification = classifySyncError(new Error(routinesSyncResult.errorMessage))
          if (classification.retryable) retryableFailureCount += 1
          lastErrorCode = classification.code as SyncErrorCode
          emitSyncEntityFailure({
            syncId,
            entity: 'routines_plans',
            operation: 'both',
            classification,
          })
        } else if (routinesSyncResult.status === 'offline') {
          entityFailureCount += 1
          retryableFailureCount += 1
          const classification = classifySyncError(
            new Error(routinesSyncResult.errorMessage ?? 'Offline'),
          )
          lastErrorCode = classification.code as SyncErrorCode
          emitSyncEntityFailure({
            syncId,
            entity: 'routines_plans',
            operation: 'both',
            classification,
          })
        }

        if (blockedCount > 0 || outboxResult.retried > 0) {
          entityFailureCount += 1
          const fallbackMessage = outboxResult.offline
            ? 'Network request failed'
            : 'Temporary sync issue'
          const classification = classifySyncError(
            new Error(outboxResult.lastErrorMessage ?? fallbackMessage),
          )
          if (classification.retryable) retryableFailureCount += 1
          lastErrorCode = classification.code as SyncErrorCode
          emitSyncEntityFailure({
            syncId,
            entity: 'workouts',
            operation: 'push',
            classification,
          })
        } else if (ENABLE_WORKOUT_OUTBOX) {
          entitySuccessCount += 1
        }

        const resolvedSyncCycle = resolveSyncCycle({
          routinesSyncResult,
          outboxResult,
          blockedCount,
          failOpenRoutinePlanSync: ENABLE_FAIL_OPEN_ROUTINE_PLAN_SYNC,
        })

        const result: 'success' | 'partial' | 'failed' =
          resolvedSyncCycle.nextStatus === 'synced' && !resolvedSyncCycle.hasScheduleWarning
            ? 'success'
            : entityFailureCount > 0
              ? 'failed'
              : 'partial'

        const durationMs = Date.now() - startedAt
        emitSyncEnd({
          syncId,
          durationMs,
          result,
          entitySuccessCount,
          entityFailureCount,
          retryableFailureCount,
          lastErrorCode,
        })

        let primaryErrorClassification: ReturnType<typeof classifySyncError> | null = null
        if (
          resolvedSyncCycle.lastErrorSource === 'routinesPlans' &&
          routinesSyncResult.errorMessage
        ) {
          primaryErrorClassification = classifySyncError(new Error(routinesSyncResult.errorMessage))
        } else if (
          resolvedSyncCycle.lastErrorSource === 'outbox' &&
          outboxResult.lastErrorMessage
        ) {
          primaryErrorClassification = classifySyncError(new Error(outboxResult.lastErrorMessage))
        }

        const delayStatus =
          resolvedSyncCycle.nextStatus === 'synced'
            ? 'synced'
            : resolvedSyncCycle.nextStatus === 'offline'
              ? 'offline'
              : 'error'
        setSyncDelayMs((previousDelay) => computeNextSyncDelayMs(previousDelay, delayStatus))

        setState((prev) => ({
          ...prev,
          status: resolvedSyncCycle.nextStatus,
          pendingCount,
          pausedByAuth: outboxResult.pausedByAuth,
          migrationRunning: routinesSyncResult.migrationApplied,
          lastSyncedAt:
            resolvedSyncCycle.nextStatus === 'synced'
              ? new Date().toISOString()
              : prev.lastSyncedAt,
          lastAttemptedAt: outboxResult.lastAttemptedAt ?? new Date().toISOString(),
          errorMessage: resolvedSyncCycle.combinedErrorMessage,
          lastErrorCode: primaryErrorClassification?.code ?? null,
          lastErrorRetryable: primaryErrorClassification?.retryable ?? false,
          hasScheduleWarning: resolvedSyncCycle.hasScheduleWarning,
          lastErrorSource: resolvedSyncCycle.lastErrorSource,
          lastOutboxBlocked: blockedCount,
          lastOutboxOffline: outboxResult.offline,
          lastOutboxPausedByAuth: outboxResult.pausedByAuth,
          lastRoutinesPlansStatus: routinesSyncResult.status,
          lastRoutinesPlansWarningCount: routinesSyncResult.warningCount,
          lastRoutinesPlansQuarantinedCount: routinesSyncResult.quarantinedCount,
          lastRoutinesPlansRecoverableError: routinesSyncResult.recoverableError,
          lastRoutinesPlansQuarantineReasons: routinesSyncResult.quarantineReasons,
        }))

        return {
          status: resolvedSyncCycle.nextStatus,
          errorMessage: resolvedSyncCycle.combinedErrorMessage,
          lastErrorSource: resolvedSyncCycle.lastErrorSource,
          lastRoutinesPlansStatus: routinesSyncResult.status,
        }
      } catch (error) {
        const classification = classifySyncError(error)
        emitSyncEntityFailure({
          syncId,
          entity: 'sync',
          operation: 'both',
          classification,
        })
        const durationMs = Date.now() - startedAt
        emitSyncEnd({
          syncId,
          durationMs,
          result: 'failed',
          entitySuccessCount: 0,
          entityFailureCount: Math.max(entities.length, 1),
          retryableFailureCount: classification.retryable ? 1 : 0,
          lastErrorCode: classification.code as SyncErrorCode,
        })

        const errorMessage = sanitizeErrorMessage(
          error instanceof Error ? error.message : 'Sync failed.',
        )

        setSyncDelayMs((previousDelay) => computeNextSyncDelayMs(previousDelay, 'error'))
        setState((prev) => ({
          ...prev,
          status: 'error',
          pausedByAuth: false,
          lastAttemptedAt: new Date().toISOString(),
          errorMessage,
          lastErrorCode: classification.code as SyncErrorCode,
          lastErrorRetryable: classification.retryable,
          hasScheduleWarning: false,
          lastErrorSource: null,
          lastOutboxBlocked: 0,
          lastOutboxOffline: false,
          lastOutboxPausedByAuth: false,
          lastRoutinesPlansStatus: 'error',
          lastRoutinesPlansWarningCount: 0,
          lastRoutinesPlansQuarantinedCount: 0,
          lastRoutinesPlansRecoverableError: false,
          lastRoutinesPlansQuarantineReasons: [],
        }))

        return {
          status: 'error',
          errorMessage,
          lastErrorSource: null,
          lastRoutinesPlansStatus: 'error',
        }
      } finally {
        isRunningRef.current = false
      }
    })()

    inFlightSyncRef.current = syncPromise

    try {
      return await syncPromise
    } finally {
      inFlightSyncRef.current = null
    }
  }, [
    appState,
    state.errorMessage,
    state.lastErrorSource,
    state.lastRoutinesPlansStatus,
    state.status,
    user?.id,
  ])

  const resetLocalSync = useCallback(async () => {
    if (!user?.id) return

    await resetLocalSyncArtifactsForUser(user.id)
    setSyncDelayMs(SYNC_BASE_DELAY_MS)
    setState((prev) => ({
      ...prev,
      status: 'idle',
      pendingCount: 0,
      pausedByAuth: false,
      lastAttemptedAt: null,
      errorMessage: null,
      lastErrorCode: null,
      lastErrorRetryable: false,
      hasScheduleWarning: false,
      lastErrorSource: null,
      lastOutboxBlocked: 0,
      lastOutboxOffline: false,
      lastOutboxPausedByAuth: false,
      lastRoutinesPlansStatus: 'synced',
      lastRoutinesPlansWarningCount: 0,
      lastRoutinesPlansQuarantinedCount: 0,
      lastRoutinesPlansRecoverableError: false,
      lastRoutinesPlansQuarantineReasons: [],
    }))
  }, [user?.id])

  const repairScheduleData = useCallback(async () => {
    if (!user?.id) return

    await repairScheduleDataForUser(user.id)
    setSyncDelayMs(SYNC_BASE_DELAY_MS)
    setState((prev) => ({
      ...prev,
      status: 'idle',
      pausedByAuth: false,
      lastAttemptedAt: null,
      errorMessage: null,
      lastErrorCode: null,
      lastErrorRetryable: false,
      hasScheduleWarning: false,
      lastErrorSource: null,
      lastRoutinesPlansStatus: 'synced',
      lastRoutinesPlansWarningCount: 0,
      lastRoutinesPlansQuarantinedCount: 0,
      lastRoutinesPlansRecoverableError: false,
      lastRoutinesPlansQuarantineReasons: [],
    }))
    void runSyncCycle()
  }, [runSyncCycle, user?.id])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState)
    })

    return () => {
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      void runSyncCycle()
    })
    return unsubscribe
  }, [runSyncCycle])

  useEffect(() => {
    if (!user?.id) {
      setState(INITIAL_STATE)
      setSyncDelayMs(SYNC_BASE_DELAY_MS)
      return
    }

    if (appState !== 'active') {
      return
    }

    void runSyncCycle()
  }, [appState, runSyncCycle, user?.id])

  useEffect(() => {
    if (!user?.id || appState !== 'active') {
      return
    }

    const flushInterval = setInterval(() => {
      void runSyncCycle()
    }, syncDelayMs)

    return () => {
      clearInterval(flushInterval)
    }
  }, [appState, runSyncCycle, syncDelayMs, user?.id])

  const value = useMemo<SyncContextValue>(
    () => ({
      ...state,
      refresh: runSyncCycle,
      resetLocalSync,
      repairScheduleData,
    }),
    [repairScheduleData, resetLocalSync, runSyncCycle, state],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSyncStatus(): SyncContextValue {
  const context = useContext(SyncContext)
  if (!context) {
    throw new Error('useSyncStatus must be used within a SyncProvider')
  }
  return context
}
