import { capture } from '../../../analytics/posthogClient'
import {
  deleteWorkout,
  deleteWorkoutExercise,
  deleteWorkoutSet,
  finishWorkoutAt,
  finishWorkoutWithMetaAt,
  insertWorkoutIfMissingFromClient,
  upsertWorkoutExerciseFromClient,
  upsertWorkoutSetFromClient,
  updateWorkoutSet,
} from '../../../db/workouts'
import { completeScheduledRoutineByWorkoutId } from '../../../db/scheduledRoutines'
import { sanitizeRow } from '../../../db/sanitize'
import { classifySyncError, SyncErrorCode } from '../../../lib/sync/syncErrorTaxonomy'
import { withTimeout } from '../../../lib/withTimeout'
import { loadOutboxQueue, saveOutboxQueue } from './fileStore'
import { computeOutboxRetryAt } from './backoff'
import type {
  CancelWorkoutPayload,
  CreateWorkoutPayload,
  DeleteExercisePayload,
  DeleteSetPayload,
  FinishWorkoutPayload,
  FinishWorkoutWithMetaPayload,
  OutboxEvent,
  OutboxQueueState,
  UpdateSetPayload,
  UpsertExercisePayload,
  UpsertSetPayload,
} from './types'

let isFlushing = false
const OUTBOX_EVENT_TIMEOUT_MS = 12_000
const DEPENDENCY_RETRY_DELAY_MS = 2_000
const OUTBOX_DEPENDENCY_ERROR_CODE = 'DEPENDENCY'
const OUTBOX_RLS_FATAL_ERROR_CODE = 'RLS_FATAL'
const MAX_OUTBOX_RETRIES = 25
const MAX_OUTBOX_AGE_MS = 20 * 60 * 1000 // 20 minutes

// Phase ordering: deterministic dependency passes.
// 1) workout creates/upserts
// 2) exercise upserts
// 3) set upserts
// 4) updates
// 5) deletes
// 6) finish/cancel
const PHASE_ORDER: Record<OutboxEvent['type'], number> = {
  create_workout: 0,
  upsert_exercise: 1,
  upsert_set: 2,
  update_set: 3,
  delete_set: 4,
  delete_exercise: 4,
  finish_workout: 5,
  finish_workout_with_meta: 5,
  cancel_workout: 5,
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error('Unknown outbox sync failure.')
}

// ─── Dependency helpers ────────────────────────────────────────────────────

/**
 * Outbox event dependency map (eventType -> entityKey(s) -> dependsOn)
 * - create_workout           -> workout.id, workout.client_uuid             -> none
 * - upsert_exercise          -> exercise.id, exercise.client_uuid           -> create_workout(workout_id)
 * - upsert_set               -> set.id, set.client_uuid                     -> upsert_exercise(workout_exercise_id)
 * - update_set/delete_set    -> set_id                                      -> none
 * - delete_exercise          -> workout_exercise_id                         -> none
 * - finish_workout(*)/cancel -> workout_id                                  -> none
 */

interface PendingDependencyIndex {
  pendingWorkoutRetryByKey: Map<string, string>
  pendingExerciseRetryByKey: Map<string, string>
}

type AttemptGateResult = { ok: true } | { ok: false; reason: 'DEPENDENCY'; retryAt: string }

function toIsoInTwoSeconds(now: Date): string {
  return new Date(now.getTime() + DEPENDENCY_RETRY_DELAY_MS).toISOString()
}

function minIsoTimestamp(a: string, b: string): string {
  return a <= b ? a : b
}

function normalizeRetryAtForDependency(parentRetryAt: string | undefined, now: Date): string {
  const fallback = toIsoInTwoSeconds(now)
  if (!parentRetryAt) return fallback
  const parsed = Date.parse(parentRetryAt)
  if (Number.isNaN(parsed)) return fallback
  return minIsoTimestamp(parentRetryAt, fallback)
}

function addDependencyKey(
  map: Map<string, string>,
  key: string | null | undefined,
  retryAt: string,
): void {
  if (!key) return
  const existing = map.get(key)
  if (!existing || retryAt < existing) {
    map.set(key, retryAt)
  }
}

function normalizeDependencyKey(key: string): string {
  return key.trim().toLowerCase()
}

function lookupRetryAt(
  map: Map<string, string>,
  key: string,
  allowNormalizedFallback: boolean,
): string | undefined {
  const direct = map.get(key)
  if (direct || !allowNormalizedFallback) {
    return direct
  }

  const normalized = normalizeDependencyKey(key)
  if (!normalized || normalized === key) {
    return undefined
  }

  let matched: string | undefined
  for (const [candidate, retryAt] of map) {
    if (normalizeDependencyKey(candidate) !== normalized) continue
    matched = matched ? minIsoTimestamp(matched, retryAt) : retryAt
  }

  return matched
}

function getWorkoutDependencyKeys(payload: CreateWorkoutPayload): string[] {
  return [payload.id, payload.client_uuid]
}

function getExerciseDependencyKeys(payload: UpsertExercisePayload): string[] {
  return [payload.id, payload.client_uuid]
}

function buildPendingDependencyIndex(events: OutboxEvent[]): PendingDependencyIndex {
  const pendingWorkoutRetryByKey = new Map<string, string>()
  const pendingExerciseRetryByKey = new Map<string, string>()

  for (const event of events) {
    if (event.status !== 'pending') continue

    if (event.type === 'create_workout') {
      const payload = event.payload as CreateWorkoutPayload
      for (const key of getWorkoutDependencyKeys(payload)) {
        addDependencyKey(pendingWorkoutRetryByKey, key, event.next_retry_at)
      }
    }

    if (event.type === 'upsert_exercise') {
      const payload = event.payload as UpsertExercisePayload
      for (const key of getExerciseDependencyKeys(payload)) {
        addDependencyKey(pendingExerciseRetryByKey, key, event.next_retry_at)
      }
    }
  }

  return {
    pendingWorkoutRetryByKey,
    pendingExerciseRetryByKey,
  }
}

function removeResolvedDependency(event: OutboxEvent, deps: PendingDependencyIndex): void {
  if (event.type === 'create_workout') {
    const payload = event.payload as CreateWorkoutPayload
    for (const key of getWorkoutDependencyKeys(payload)) {
      deps.pendingWorkoutRetryByKey.delete(key)
    }
  }

  if (event.type === 'upsert_exercise') {
    const payload = event.payload as UpsertExercisePayload
    for (const key of getExerciseDependencyKeys(payload)) {
      deps.pendingExerciseRetryByKey.delete(key)
    }
  }
}

function getPendingParentRetryAt(
  event: OutboxEvent,
  deps: PendingDependencyIndex,
  allowNormalizedFallback = false,
): string | undefined {
  if (event.type === 'upsert_exercise') {
    return lookupRetryAt(
      deps.pendingWorkoutRetryByKey,
      (event.payload as UpsertExercisePayload).workout_id,
      allowNormalizedFallback,
    )
  }

  if (event.type === 'upsert_set') {
    return lookupRetryAt(
      deps.pendingExerciseRetryByKey,
      (event.payload as UpsertSetPayload).workout_exercise_id,
      allowNormalizedFallback,
    )
  }

  return undefined
}

function getEventWorkoutId(event: OutboxEvent): string | null {
  switch (event.type) {
    case 'create_workout':
      return (event.payload as CreateWorkoutPayload).id
    case 'upsert_exercise':
      return (event.payload as UpsertExercisePayload).workout_id
    case 'finish_workout':
      return (event.payload as FinishWorkoutPayload).workout_id
    case 'finish_workout_with_meta':
      return (event.payload as FinishWorkoutWithMetaPayload).workout_id
    case 'cancel_workout':
      return (event.payload as CancelWorkoutPayload).workout_id
    default:
      return null
  }
}

/**
 * Returns { ok: false } when the event must wait for a parent that has not
 * yet been confirmed synced in this flush cycle.
 */
function canAttempt(
  event: OutboxEvent,
  deps: PendingDependencyIndex,
  now: Date,
): AttemptGateResult {
  const parentRetryAt = getPendingParentRetryAt(event, deps)
  if (parentRetryAt) {
    return {
      ok: false,
      reason: 'DEPENDENCY',
      retryAt: normalizeRetryAtForDependency(parentRetryAt, now),
    }
  }

  return { ok: true }
}

// ─── Compaction ────────────────────────────────────────────────────────────

/**
 * Removes events that are superseded by a later cancel or delete in the queue:
 *  - cancel_workout(X) supersedes all non-cancel events for workout X
 *    (including exercise/set events belonging to X's exercises)
 *  - delete_set(Y)      supersedes update_set for set Y
 *
 * The cancel_workout and delete_* events themselves are preserved.
 */
function compactQueue(events: OutboxEvent[]): OutboxEvent[] {
  // Collect cancelled workout IDs.
  const cancelledWorkoutIds = new Set<string>()
  for (const event of events) {
    if (event.type === 'cancel_workout') {
      cancelledWorkoutIds.add((event.payload as CancelWorkoutPayload).workout_id)
    }
  }

  if (cancelledWorkoutIds.size === 0 && !events.some((e) => e.type === 'delete_set')) {
    return events
  }

  // Collect exercise IDs that belong to cancelled workouts (so we can drop
  // set-level events that don't carry a workout_id directly).
  const cancelledExerciseIds = new Set<string>()
  for (const event of events) {
    if (event.type === 'upsert_exercise') {
      const p = event.payload as UpsertExercisePayload
      if (cancelledWorkoutIds.has(p.workout_id)) {
        cancelledExerciseIds.add(p.id)
      }
    }
  }

  // Collect deleted set IDs.
  const deletedSetIds = new Set<string>()
  for (const event of events) {
    if (event.type === 'delete_set') {
      deletedSetIds.add((event.payload as DeleteSetPayload).set_id)
    }
  }

  return events.filter((event) => {
    // Always keep cancel_workout — it IS the compacting sentinel.
    if (event.type === 'cancel_workout') return true

    // Drop events for a cancelled workout (checked via workout-level payload).
    const workoutId = getEventWorkoutId(event)
    if (workoutId && cancelledWorkoutIds.has(workoutId)) return false

    // Drop set/exercise events belonging to a cancelled workout's exercises.
    if (event.type === 'upsert_set') {
      const exerciseId = (event.payload as UpsertSetPayload).workout_exercise_id
      if (cancelledExerciseIds.has(exerciseId)) return false
    }
    if (event.type === 'delete_exercise') {
      const p = event.payload as DeleteExercisePayload
      if (cancelledExerciseIds.has(p.workout_exercise_id)) return false
    }

    // Drop update_set that are superseded by a delete_set for the same set.
    if (event.type === 'update_set') {
      const p = event.payload as UpdateSetPayload
      if (deletedSetIds.has(p.set_id)) return false
    }

    return true
  })
}

// ─── Remote dispatch ───────────────────────────────────────────────────────

async function processEvent(
  event: OutboxEvent,
): Promise<{ ok: true } | { ok: false; error: Error }> {
  try {
    switch (event.type) {
      case 'create_workout': {
        const sanitized = sanitizeRow('workouts', event.payload as Record<string, unknown>)
        const response = await insertWorkoutIfMissingFromClient(
          sanitized as unknown as Parameters<typeof insertWorkoutIfMissingFromClient>[0],
        )
        if (response.error) return { ok: false, error: response.error }
        return { ok: true }
      }
      case 'upsert_exercise': {
        const sanitized = sanitizeRow('workout_exercises', event.payload as Record<string, unknown>)
        const response = await upsertWorkoutExerciseFromClient(
          sanitized as unknown as Parameters<typeof upsertWorkoutExerciseFromClient>[0],
        )
        if (response.error) return { ok: false, error: response.error }
        return { ok: true }
      }
      case 'upsert_set': {
        const sanitized = sanitizeRow('workout_sets', event.payload as Record<string, unknown>)
        const response = await upsertWorkoutSetFromClient(
          sanitized as unknown as Parameters<typeof upsertWorkoutSetFromClient>[0],
        )
        if (response.error) return { ok: false, error: response.error }
        return { ok: true }
      }
      case 'update_set': {
        const payload = event.payload as UpdateSetPayload
        const response = await updateWorkoutSet(
          payload.set_id,
          {
            reps: payload.reps,
            weight: payload.weight,
            weight_kg: payload.weight_kg ?? null,
            duration_seconds: payload.duration_seconds ?? null,
            distance_m: payload.distance_m ?? null,
            is_completed: payload.is_completed ?? true,
          },
          payload.units,
        )
        if (response.error) return { ok: false, error: response.error }
        return { ok: true }
      }
      case 'delete_set': {
        const payload = event.payload as DeleteSetPayload
        const response = await deleteWorkoutSet(payload.set_id)
        if (response.error) return { ok: false, error: new Error(response.error.message) }
        return { ok: true }
      }
      case 'delete_exercise': {
        const payload = event.payload as DeleteExercisePayload
        const response = await deleteWorkoutExercise(payload.workout_exercise_id)
        if (response.error) return { ok: false, error: new Error(response.error.message) }
        return { ok: true }
      }
      case 'finish_workout': {
        const payload = event.payload as FinishWorkoutPayload
        const response = await finishWorkoutAt(payload.workout_id, payload.ended_at)
        if (response.error) return { ok: false, error: response.error }
        // Best-effort: schedule completion must not block workout finalization.
        // completeScheduledRoutineByWorkoutId is idempotent (WHERE status='started')
        // so a transient failure here will not leave duplicate completions on retry.
        const scheduleResult = await completeScheduledRoutineByWorkoutId(payload.workout_id)
        if (scheduleResult.error && __DEV__) {
          console.warn(
            `[Outbox] schedule completion best-effort failed for workout ${payload.workout_id}:`,
            scheduleResult.error.message,
          )
        }
        return { ok: true }
      }
      case 'finish_workout_with_meta': {
        const payload = event.payload as FinishWorkoutWithMetaPayload
        const response = await finishWorkoutWithMetaAt(payload.workout_id, {
          endedAt: payload.ended_at,
          notes: payload.notes,
          effort_rating: payload.effort_rating,
          session_note: payload.session_note,
        })
        if (response.error) return { ok: false, error: response.error }
        // Best-effort: schedule completion must not block workout finalization.
        // completeScheduledRoutineByWorkoutId is idempotent (WHERE status='started')
        // so a transient failure here will not leave duplicate completions on retry.
        const scheduleResult = await completeScheduledRoutineByWorkoutId(payload.workout_id)
        if (scheduleResult.error && __DEV__) {
          console.warn(
            `[Outbox] schedule completion best-effort failed for workout ${payload.workout_id}:`,
            scheduleResult.error.message,
          )
        }
        return { ok: true }
      }
      case 'cancel_workout': {
        const payload = event.payload as CancelWorkoutPayload
        const response = await deleteWorkout(payload.workout_id)
        if (response.error) return { ok: false, error: new Error(response.error.message) }
        return { ok: true }
      }
      default:
        return { ok: false, error: new Error('Unknown outbox event type.') }
    }
  } catch (error) {
    return { ok: false, error: normalizeError(error) }
  }
}

// ─── Scheduling helpers ────────────────────────────────────────────────────

function shouldAttempt(event: OutboxEvent, now: string): boolean {
  if (event.status === 'blocked') return false
  return event.next_retry_at <= now
}

function toDependencyDeferredEvent(event: OutboxEvent, retryAt: string): OutboxEvent {
  return {
    ...event,
    status: 'pending',
    next_retry_at: retryAt,
    updated_at: new Date().toISOString(),
    last_error_code: OUTBOX_DEPENDENCY_ERROR_CODE,
    last_error_message: 'Waiting for parent event to sync first.',
  }
}

function isChildUpsertEvent(event: OutboxEvent): boolean {
  return event.type === 'upsert_exercise' || event.type === 'upsert_set'
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function enqueueOutboxEvent(event: OutboxEvent): Promise<void> {
  const queue = await loadOutboxQueue(event.user_id)
  await saveOutboxQueue(event.user_id, {
    events: [...queue.events, event],
  })
}

export async function loadOutboxState(userId: string): Promise<OutboxQueueState> {
  return loadOutboxQueue(userId)
}

export async function getOutboxPendingCount(userId: string): Promise<number> {
  if (!userId) return 0
  const queue = await loadOutboxQueue(userId)
  return queue.events.filter((event) => event.status === 'pending').length
}

export async function flushOutboxQueue(userId: string): Promise<{
  attempted: number
  synced: number
  retried: number
  blocked: number
  pausedByAuth: boolean
  offline: boolean
  lastErrorMessage: string | null
  lastAttemptedAt: string | null
}> {
  const empty = {
    attempted: 0,
    synced: 0,
    retried: 0,
    blocked: 0,
    pausedByAuth: false,
    offline: false,
    lastErrorMessage: null,
    lastAttemptedAt: null,
  }

  if (!userId) return empty
  if (isFlushing) return empty

  isFlushing = true

  try {
    const queue = await loadOutboxQueue(userId)

    // Scope-guard: strip events that slipped in for another user.
    const scopedEvents = queue.events.filter((event) => event.user_id === userId)
    const compacted = compactQueue(scopedEvents)

    // Deterministic phase passes, preserving insertion order inside each phase.
    const ordered = compacted
      .map((event, index) => ({ event, index }))
      .sort((a, b) => {
        const phase = PHASE_ORDER[a.event.type] - PHASE_ORDER[b.event.type]
        if (phase !== 0) return phase
        return a.index - b.index
      })
      .map((entry) => entry.event)

    const nowIso = new Date().toISOString()

    let attempted = 0
    let synced = 0
    let retried = 0
    let blocked = 0
    let pausedByAuth = false
    let offline = false
    let lastErrorMessage: string | null = null
    let lastAttemptedAt: string | null = null

    const dependencyIndex = buildPendingDependencyIndex(ordered)

    if (__DEV__) {
      console.log(`[Outbox] flush start — total=${ordered.length}`)
    }

    const nextEvents: OutboxEvent[] = []
    const processedIds = new Set<string>()

    for (const event of ordered) {
      if (!shouldAttempt(event, nowIso)) {
        nextEvents.push(event)
        processedIds.add(event.event_id)
        continue
      }

      // Dependency gate: child must wait for pending parent.
      const dep = canAttempt(event, dependencyIndex, new Date())
      if (!dep.ok) {
        if (__DEV__) {
          console.log(`[Outbox] dependency defer ${event.type}(${event.event_id})`)
        }
        nextEvents.push(toDependencyDeferredEvent(event, dep.retryAt))
        processedIds.add(event.event_id)
        continue
      }

      // Max retry / age ceiling — block permanently rather than retrying forever.
      // AUTH-paused events are exempt: their token may refresh imminently.
      const eventAgeMs = Date.now() - new Date(event.created_at).getTime()
      if (
        event.attempt_count >= MAX_OUTBOX_RETRIES ||
        (eventAgeMs > MAX_OUTBOX_AGE_MS && event.last_error_code !== SyncErrorCode.AUTH)
      ) {
        blocked += 1
        nextEvents.push({
          ...event,
          status: 'blocked' as const,
          updated_at: new Date().toISOString(),
          last_error_code: 'max_retries_exceeded',
          last_error_message: `Event exceeded max retries (${event.attempt_count}) or age (${Math.round(eventAgeMs / 60000)}min)`,
        })
        processedIds.add(event.event_id)
        continue
      }

      attempted += 1
      lastAttemptedAt = new Date().toISOString()

      let result: Awaited<ReturnType<typeof processEvent>>
      try {
        result = await withTimeout(processEvent(event), OUTBOX_EVENT_TIMEOUT_MS)
      } catch (error) {
        result = { ok: false, error: normalizeError(error) }
      }

      if (result.ok) {
        synced += 1
        processedIds.add(event.event_id)
        // Parent succeeded — unblock children in this same flush cycle.
        removeResolvedDependency(event, dependencyIndex)
        continue
      }

      // ── Error classification ────────────────────────────────────────────
      const classification = classifySyncError(result.error)

      // AUTH: pause the entire flush cycle. Keep the event pending so it will
      // be retried once the session is restored. Do NOT block it.
      if (classification.code === SyncErrorCode.AUTH) {
        pausedByAuth = true
        lastErrorMessage = result.error.message
        if (__DEV__) {
          console.log(`[Outbox] paused by auth on ${event.type}(${event.event_id})`)
        }
        nextEvents.push({
          ...event,
          updated_at: new Date().toISOString(),
          last_error_code: SyncErrorCode.AUTH,
          last_error_message: result.error.message,
          // status intentionally NOT changed — stays 'pending'
        })
        processedIds.add(event.event_id)

        // Drain all remaining events unchanged and stop.
        for (const remaining of ordered) {
          if (!processedIds.has(remaining.event_id)) {
            nextEvents.push(remaining)
            processedIds.add(remaining.event_id)
          }
        }
        await saveOutboxQueue(userId, { events: nextEvents })
        return {
          attempted,
          synced,
          retried,
          blocked,
          pausedByAuth: true,
          offline,
          lastErrorMessage,
          lastAttemptedAt,
        }
      }

      // RLS safety-net: if the parent is still pending, treat as a dep-defer
      // rather than a permanent block (child was attempted before parent synced
      // in an earlier cycle, server correctly rejected it).
      if (classification.code === SyncErrorCode.RLS) {
        const parentRetryAt = getPendingParentRetryAt(event, dependencyIndex, true)
        if (isChildUpsertEvent(event) && parentRetryAt) {
          if (__DEV__) {
            console.log(`[Outbox] dependency defer ${event.type}(${event.event_id})`)
          }
          nextEvents.push(
            toDependencyDeferredEvent(
              event,
              normalizeRetryAtForDependency(parentRetryAt, new Date()),
            ),
          )
          processedIds.add(event.event_id)
          continue
        }

        // True RLS violation (no pending parent) — block permanently.
        blocked += 1
        lastErrorMessage = result.error.message
        nextEvents.push({
          ...event,
          status: 'blocked',
          updated_at: new Date().toISOString(),
          last_error_code: OUTBOX_RLS_FATAL_ERROR_CODE,
          last_error_message: result.error.message,
        })
        removeResolvedDependency(event, dependencyIndex)
        processedIds.add(event.event_id)
        continue
      }

      // FK (23503) safety-net: same as RLS — if parent pending, defer instead of block
      if (
        classification.code === SyncErrorCode.CONSTRAINT &&
        classification.pgCode === '23503' &&
        isChildUpsertEvent(event)
      ) {
        const parentRetryAt = getPendingParentRetryAt(event, dependencyIndex, true)
        if (parentRetryAt) {
          if (__DEV__) {
            console.log(`[Outbox] FK dependency defer ${event.type}(${event.event_id})`)
          }
          nextEvents.push(
            toDependencyDeferredEvent(
              event,
              normalizeRetryAtForDependency(parentRetryAt, new Date()),
            ),
          )
          processedIds.add(event.event_id)
          continue
        }
      }

      // Retryable errors (NETWORK, TIMEOUT, RATE_LIMIT, SERVER, retryable UNKNOWN).
      if (classification.retryable) {
        if (
          classification.code === SyncErrorCode.NETWORK ||
          classification.code === SyncErrorCode.TIMEOUT
        ) {
          offline = true
        }
        retried += 1
        lastErrorMessage = result.error.message
        const nextAttempt = event.attempt_count + 1
        const retryAt = computeOutboxRetryAt(nextAttempt)

        capture('outbox_retry', { attempt: nextAttempt })

        nextEvents.push({
          ...event,
          attempt_count: nextAttempt,
          next_retry_at: retryAt,
          updated_at: new Date().toISOString(),
          last_error_code: classification.code,
          last_error_message: result.error.message,
        })
        processedIds.add(event.event_id)
        continue
      }

      // Non-retryable (CONSTRAINT, VALIDATION, non-retryable UNKNOWN, etc.) — block permanently.
      blocked += 1
      lastErrorMessage = result.error.message
      nextEvents.push({
        ...event,
        status: 'blocked',
        updated_at: new Date().toISOString(),
        last_error_code: classification.code,
        last_error_message: result.error.message,
      })
      removeResolvedDependency(event, dependencyIndex)
      processedIds.add(event.event_id)
    }

    await saveOutboxQueue(userId, { events: nextEvents })

    if (__DEV__) {
      console.log(
        `[Outbox] flush end — attempted=${attempted} synced=${synced} retried=${retried} blocked=${blocked} auth=${pausedByAuth} offline=${offline}`,
      )
    }

    return {
      attempted,
      synced,
      retried,
      blocked,
      pausedByAuth,
      offline,
      lastErrorMessage,
      lastAttemptedAt,
    }
  } finally {
    isFlushing = false
  }
}
