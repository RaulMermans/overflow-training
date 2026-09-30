import { capture } from '../../../analytics/posthogClient'
import {
  addExerciseToWorkout,
  addSet,
  type ExerciseTrackingMode,
  type WorkoutSetType,
  deleteWorkout,
  deleteWorkoutExercise,
  deleteWorkoutSet,
  fetchExerciseDefinitionsByIds,
  fetchInProgressWorkout,
  fetchWorkoutDetail,
  finishWorkout,
  finishWorkoutWithMeta,
  updateWorkoutSet,
  createWorkout,
  upsertWorkoutExerciseFromClient,
  upsertWorkoutSetFromClient,
  type WorkoutExerciseRow,
  type WorkoutRow,
  type WorkoutSetRow,
} from '../../../db/workouts'
import { completeScheduledRoutineByWorkoutId } from '../../../db/scheduledRoutines'
import { defaultShouldRetry } from '../../../lib/retry'
import { toWeightKg } from '../../../lib/units'
import type { UnitsPreference } from '../../../lib/profilePreferences'
import { generateUuid } from '../../../lib/ids'
import {
  applyCancelWorkoutProjection,
  applyCreateWorkoutProjection,
  applyDeleteExerciseProjection,
  applyDeleteSetProjection,
  applyFinishWorkoutProjection,
  applyFinishWorkoutWithMetaProjection,
  applyUpdateSetProjection,
  applyUpsertExerciseProjection,
  applyUpsertSetProjection,
  getProjectionInProgressWorkout,
  getProjectionSetById,
  getProjectionWorkoutDetail,
} from './workoutProjection'
import { mergeWorkoutRemoteWithLocal } from './mergeWorkout'
import { triggerSync } from '../syncTriggers'
import { enqueueOutboxEvent, loadOutboxState } from './worker'
import type {
  CancelWorkoutPayload,
  CreateWorkoutPayload,
  DeleteExercisePayload,
  DeleteSetPayload,
  FinishWorkoutPayload,
  FinishWorkoutWithMetaPayload,
  OutboxEvent,
  UpsertExercisePayload,
  UpsertSetPayload,
  UpdateSetPayload,
} from './types'

const REMOTE_MUTATION_TIMEOUT_MS = 12_000

export type WorkoutFinishPersistence = 'remote' | 'queued' | 'failed'

export interface WorkoutFinishMutationResult {
  data: WorkoutRow | null
  error: Error | null
  persistence: WorkoutFinishPersistence
}

function makeOutboxEvent<TPayload>(
  userId: string,
  type: OutboxEvent['type'],
  entityClientUuid: string,
  payload: TPayload,
): OutboxEvent<TPayload> {
  const now = new Date().toISOString()

  return {
    event_id: generateUuid(),
    user_id: userId,
    type,
    entity_client_uuid: entityClientUuid,
    payload,
    attempt_count: 0,
    next_retry_at: now,
    status: 'pending',
    created_at: now,
    updated_at: now,
  }
}

function toError(input: unknown): Error {
  if (input instanceof Error) return input
  if (typeof input === 'object' && input && 'message' in input) {
    return new Error(String((input as { message?: unknown }).message ?? 'Unknown error'))
  }
  return new Error('Unknown error')
}

function shouldQueueForRetry(error: unknown): boolean {
  return defaultShouldRetry(toError(error))
}

/**
 * PostgreSQL FK violation (23503).
 * workout_sets only reference workout_exercises -> parent not synced, queue.
 */
function isFkViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const o = error as { code?: string; message?: string; details?: string }
  if (o.code === '23503') return true
  const msg = String(o.message ?? o.details ?? '').toLowerCase()
  return msg.includes('23503') || msg.includes('foreign key')
}

/**
 * FK on workout_exercises insert:
 * references "workouts" = parent not synced (queue)
 * references "exercise_definitions" = invalid ref (bubble)
 */
function isFkExerciseParentNotSynced(error: unknown): boolean {
  if (!isFkViolation(error)) return false
  const o = error as { message?: string; details?: string }
  const msg = [o.message, o.details].filter(Boolean).join(' ').toLowerCase()
  return msg.includes('workouts') && !msg.includes('exercise_definitions')
}

/** FK on exercise_definitions = invalid exercise ID, bubble for startRoutine. */
function isFkExerciseInvalidRef(error: unknown): boolean {
  if (!isFkViolation(error)) return false
  const o = error as { message?: string; details?: string }
  const msg = [o.message, o.details].filter(Boolean).join(' ').toLowerCase()
  return msg.includes('exercise_definitions')
}

/**
 * Update/delete failed because row is not on server yet
 * (for example only in projection). Queue so outbox applies after parent.
 */
function isRowNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const o = error as { status?: number; message?: string }
  if (o.status === 404) return true
  const msg = String(o.message ?? '').toLowerCase()
  return (
    msg.includes('0 rows') ||
    msg.includes('pgrst116') ||
    msg.includes('not found') ||
    msg.includes('does not exist')
  )
}

function markOfflineEntered(): void {
  capture('offline_entered')
  triggerSync()
}

async function enqueueOutboxEventIfMissing<TPayload>(event: OutboxEvent<TPayload>): Promise<void> {
  const existing = await loadOutboxState(event.user_id)
  const hasPendingDuplicate = existing.events.some(
    (queued) =>
      queued.type === event.type &&
      queued.entity_client_uuid === event.entity_client_uuid &&
      queued.status === 'pending',
  )

  if (hasPendingDuplicate) return

  await enqueueOutboxEvent(event)
}

function logProjectionWarning(action: string, error: unknown): void {
  if (__DEV__) {
    console.warn(`[Outbox] ${action}:`, error)
  }
}

function logScheduledRoutineCompletionFailure(
  source: 'finish_workout' | 'finish_workout_with_meta',
  workoutId: string,
  error: Error | null,
): void {
  if (!error) return

  if (__DEV__) {
    console.warn('[Outbox] Failed completing scheduled routine after workout finish', {
      source,
      workoutId,
      message: error.message,
    })
  }

  capture('scheduled_routine_completion_failed', {
    source,
    workout_id: workoutId,
    message: error.message,
  })
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Request timeout'))
    }, timeoutMs)

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

export async function createWorkoutOptimistic(userId: string): Promise<{
  data: WorkoutRow | null
  error: Error | null
}> {
  const now = new Date().toISOString()
  const payload: CreateWorkoutPayload = {
    id: generateUuid(),
    user_id: userId,
    client_uuid: generateUuid(),
    started_at: now,
    created_at: now,
  }

  let remoteResponse: { data: WorkoutRow | null; error: Error | null } | null = null

  try {
    const raw = await withTimeout(
      createWorkout(userId, {
        id: payload.id,
        clientUuid: payload.client_uuid,
        startedAt: payload.started_at,
      }),
      REMOTE_MUTATION_TIMEOUT_MS,
    )
    remoteResponse = {
      data: raw.data as WorkoutRow | null,
      error: raw.error ? new Error(raw.error.message) : null,
    }

    if (!remoteResponse.error && remoteResponse.data) {
      try {
        await applyCreateWorkoutProjection(payload)
      } catch (projectionError) {
        logProjectionWarning(
          'Failed applying workout projection after remote create',
          projectionError,
        )
      }
      return remoteResponse
    }
  } catch {
    // Fall through to queue outbox regardless of error type
  }

  // Never hard-fail workout creation — queue to outbox regardless of error type.
  // Auth errors (401/403) are handled by the outbox's auth-pause mechanism.
  markOfflineEntered()
  await enqueueOutboxEvent(makeOutboxEvent(userId, 'create_workout', payload.client_uuid, payload))
  await applyCreateWorkoutProjection(payload)

  return {
    data: {
      id: payload.id,
      user_id: payload.user_id,
      client_uuid: payload.client_uuid,
      started_at: payload.started_at,
      ended_at: null,
      status: 'in_progress',
      notes: null,
      effort_rating: null,
      session_note: null,
      created_at: payload.created_at,
    },
    error: null,
  }
}

export async function addExerciseOptimistic(input: {
  userId: string
  workoutId: string
  exerciseDefinitionId: string
  orderIndex: number
  /** When true, skip applying projection (caller will batch-apply). Returns payload for batch. */
  skipProjection?: boolean
}): Promise<{
  data: WorkoutExerciseRow | null
  error: Error | null
  payload?: UpsertExercisePayload
}> {
  const payload: UpsertExercisePayload = {
    id: generateUuid(),
    workout_id: input.workoutId,
    client_uuid: generateUuid(),
    exercise_definition_id: input.exerciseDefinitionId,
    order_index: input.orderIndex,
    notes: null,
    created_at: new Date().toISOString(),
  }

  let remoteError: unknown = null
  let remoteResponse: { data: WorkoutExerciseRow | null; error: Error | null } | null = null

  try {
    remoteResponse = await withTimeout(
      upsertWorkoutExerciseFromClient(payload),
      REMOTE_MUTATION_TIMEOUT_MS,
    )

    if (!remoteResponse.error && remoteResponse.data) {
      if (!input.skipProjection) {
        try {
          await applyUpsertExerciseProjection(payload)
        } catch (projectionError) {
          logProjectionWarning(
            'Failed applying exercise projection after remote upsert',
            projectionError,
          )
        }
      }
      return input.skipProjection
        ? { data: remoteResponse.data, error: null, payload }
        : { data: remoteResponse.data, error: null }
    }

    remoteError = remoteResponse.error
  } catch (error) {
    remoteError = error
  }

  const terminalError = remoteError ?? remoteResponse?.error ?? new Error('Failed to add exercise.')

  // Bubble only invalid exercise_definition_id FK so startRoutine can skip bad refs.
  // Parent (workouts) FK -> queue.
  if (isFkExerciseInvalidRef(terminalError)) {
    return { data: null, error: toError(terminalError) }
  }

  // Parent not synced (workouts) or retryable: queue and apply projection.
  if (!isFkExerciseParentNotSynced(terminalError) && !shouldQueueForRetry(terminalError)) {
    return { data: null, error: toError(terminalError) }
  }

  markOfflineEntered()
  await enqueueOutboxEvent(
    makeOutboxEvent(input.userId, 'upsert_exercise', payload.client_uuid, payload),
  )
  if (!input.skipProjection) {
    await applyUpsertExerciseProjection(payload)
  }

  return input.skipProjection
    ? {
        data: {
          id: payload.id,
          workout_id: payload.workout_id,
          client_uuid: payload.client_uuid,
          exercise_definition_id: payload.exercise_definition_id,
          order_index: payload.order_index,
          notes: payload.notes,
          created_at: payload.created_at,
        },
        error: null,
        payload,
      }
    : {
        data: {
          id: payload.id,
          workout_id: payload.workout_id,
          client_uuid: payload.client_uuid,
          exercise_definition_id: payload.exercise_definition_id,
          order_index: payload.order_index,
          notes: payload.notes,
          created_at: payload.created_at,
        },
        error: null,
      }
}

export async function updateExerciseSupersetOptimistic(input: {
  userId: string
  exercise: Pick<
    WorkoutExerciseRow,
    | 'id'
    | 'workout_id'
    | 'client_uuid'
    | 'exercise_definition_id'
    | 'order_index'
    | 'notes'
    | 'created_at'
  >
  supersetGroupId: string | null
  supersetOrder: number | null
}): Promise<{ data: WorkoutExerciseRow | null; error: Error | null }> {
  const payload: UpsertExercisePayload = {
    id: input.exercise.id,
    workout_id: input.exercise.workout_id,
    client_uuid: input.exercise.client_uuid,
    exercise_definition_id: input.exercise.exercise_definition_id,
    order_index: input.exercise.order_index,
    notes: input.exercise.notes ?? null,
    superset_group_id: input.supersetGroupId,
    superset_order: input.supersetOrder,
    created_at: input.exercise.created_at ?? new Date().toISOString(),
  }

  // DB does not store superset_*; payload used for local projection only
  const remoteResponse = await upsertWorkoutExerciseFromClient({
    id: payload.id,
    workout_id: payload.workout_id,
    client_uuid: payload.client_uuid,
    exercise_definition_id: payload.exercise_definition_id,
    order_index: payload.order_index,
    notes: payload.notes,
    created_at: payload.created_at,
  })

  if (!remoteResponse.error && remoteResponse.data) {
    await applyUpsertExerciseProjection(payload)
    return remoteResponse
  }

  const terminalError = remoteResponse.error
  if (terminalError) {
    if (isFkExerciseInvalidRef(terminalError)) {
      return { data: null, error: toError(terminalError) }
    }
    if (!isFkExerciseParentNotSynced(terminalError) && !shouldQueueForRetry(terminalError)) {
      return { data: null, error: toError(terminalError) }
    }
  }

  markOfflineEntered()
  await enqueueOutboxEvent(
    makeOutboxEvent(input.userId, 'upsert_exercise', payload.client_uuid, payload),
  )
  await applyUpsertExerciseProjection(payload)

  return {
    data: {
      id: payload.id,
      workout_id: payload.workout_id,
      client_uuid: payload.client_uuid,
      exercise_definition_id: payload.exercise_definition_id,
      order_index: payload.order_index,
      notes: payload.notes,
      created_at: payload.created_at,
    },
    error: null,
  }
}

export async function addSetOptimistic(input: {
  userId: string
  workoutExerciseId: string
  trackingMode: ExerciseTrackingMode
  reps?: number | null
  weight?: number | null
  weight_kg?: number | null
  duration_seconds?: number | null
  distance_m?: number | null
  set_type?: WorkoutSetType | null
  rir?: number | null
  setIndex: number
  units: UnitsPreference
}): Promise<{ data: WorkoutSetRow | null; error: Error | null }> {
  const hasWeight = Number.isFinite(input.weight)
  const payload: UpsertSetPayload = {
    id: generateUuid(),
    workout_exercise_id: input.workoutExerciseId,
    client_uuid: generateUuid(),
    set_index: input.setIndex,
    reps: input.reps ?? null,
    weight: hasWeight ? Number(input.weight) : null,
    weight_kg:
      Number.isFinite(input.weight_kg) && input.weight_kg !== null
        ? Number(input.weight_kg)
        : hasWeight
          ? toWeightKg(Number(input.weight), input.units)
          : null,
    duration_seconds: input.duration_seconds ?? null,
    distance_m: input.distance_m ?? null,
    set_type: input.set_type,
    rir: input.rir ?? null,
    units: input.units,
    is_completed: true,
    created_at: new Date().toISOString(),
  }

  const remoteResponse = await upsertWorkoutSetFromClient(payload)

  if (!remoteResponse.error && remoteResponse.data) {
    await applyUpsertSetProjection(payload)
    return remoteResponse
  }

  // FK (parent exercise not on server), retryable, or ambiguous (!error && !data):
  // queue and apply projection.
  const isAmbiguous = !remoteResponse.error && !remoteResponse.data
  if (
    !isAmbiguous &&
    !isFkViolation(remoteResponse.error) &&
    !shouldQueueForRetry(remoteResponse.error)
  ) {
    return { data: null, error: remoteResponse.error }
  }

  if (__DEV__) {
    console.warn('[Outbox] addSetOptimistic queued', {
      workoutExerciseId: input.workoutExerciseId,
      setIndex: input.setIndex,
      ambiguous: isAmbiguous,
    })
  }
  markOfflineEntered()
  await enqueueOutboxEvent(
    makeOutboxEvent(input.userId, 'upsert_set', payload.client_uuid, payload),
  )
  await applyUpsertSetProjection(payload)

  return {
    data: {
      id: payload.id,
      workout_exercise_id: payload.workout_exercise_id,
      client_uuid: payload.client_uuid,
      set_index: payload.set_index,
      reps: payload.reps,
      weight: payload.weight,
      weight_kg: payload.weight_kg,
      duration_seconds: payload.duration_seconds,
      distance_m: payload.distance_m,
      set_type: payload.set_type ?? 'normal',
      rir: payload.rir ?? null,
      is_weight_canonical: payload.weight_kg !== null,
      is_completed: true,
      created_at: payload.created_at,
    },
    error: null,
  }
}

export async function updateSetOptimistic(input: {
  userId: string
  setId: string
  trackingMode: ExerciseTrackingMode
  reps?: number | null
  weight?: number | null
  weight_kg?: number | null
  duration_seconds?: number | null
  distance_m?: number | null
  set_type?: WorkoutSetType | null
  rir?: number | null
  units: UnitsPreference
}): Promise<{ data: WorkoutSetRow | null; error: Error | null }> {
  const hasWeight = Number.isFinite(input.weight)
  const normalizedWeight = hasWeight ? Number(input.weight) : null
  const normalizedWeightKg =
    Number.isFinite(input.weight_kg) && input.weight_kg !== null
      ? Number(input.weight_kg)
      : normalizedWeight !== null
        ? toWeightKg(normalizedWeight, input.units)
        : null
  const remoteResponse = await updateWorkoutSet(
    input.setId,
    {
      reps: input.reps ?? null,
      weight: normalizedWeight,
      weight_kg: normalizedWeightKg,
      duration_seconds: input.duration_seconds ?? null,
      distance_m: input.distance_m ?? null,
      is_completed: true,
    },
    input.units,
  )

  if (!remoteResponse.error && remoteResponse.data) {
    await applyUpdateSetProjection(
      {
        set_id: input.setId,
        reps: input.reps ?? null,
        weight: normalizedWeight,
        weight_kg: normalizedWeightKg,
        duration_seconds: input.duration_seconds ?? null,
        distance_m: input.distance_m ?? null,
        units: input.units,
        is_completed: true,
      },
      input.units,
    )
    return remoteResponse
  }

  if (!isRowNotFoundError(remoteResponse.error) && !shouldQueueForRetry(remoteResponse.error)) {
    return { data: null, error: remoteResponse.error }
  }

  const payload: UpdateSetPayload = {
    set_id: input.setId,
    reps: input.reps ?? null,
    weight: normalizedWeight,
    weight_kg: normalizedWeightKg,
    duration_seconds: input.duration_seconds ?? null,
    distance_m: input.distance_m ?? null,
    units: input.units,
    is_completed: true,
  }

  markOfflineEntered()
  await enqueueOutboxEvent(makeOutboxEvent(input.userId, 'update_set', input.setId, payload))
  await applyUpdateSetProjection(payload, input.units)

  const updatedSet = await getProjectionSetById(input.setId)

  return {
    data: updatedSet
      ? {
          id: updatedSet.id,
          workout_exercise_id: updatedSet.workout_exercise_id,
          client_uuid: updatedSet.client_uuid,
          set_index: updatedSet.set_index,
          reps: updatedSet.reps,
          weight: updatedSet.weight,
          weight_kg: updatedSet.weight_kg,
          duration_seconds: updatedSet.duration_seconds,
          distance_m: updatedSet.distance_m,
          set_type: updatedSet.set_type,
          rir: updatedSet.rir,
          is_weight_canonical: updatedSet.is_weight_canonical,
          is_completed: updatedSet.is_completed,
          created_at: updatedSet.created_at,
        }
      : {
          id: input.setId,
          workout_exercise_id: '',
          client_uuid: generateUuid(),
          set_index: 0,
          reps: payload.reps,
          weight: payload.weight,
          weight_kg: payload.weight_kg,
          duration_seconds: payload.duration_seconds,
          distance_m: payload.distance_m,
          set_type: payload.set_type ?? 'normal',
          rir: payload.rir ?? null,
          is_weight_canonical: payload.weight_kg !== null,
          is_completed: true,
          created_at: new Date().toISOString(),
        },
    error: null,
  }
}

export async function deleteSetOptimistic(input: {
  userId: string
  setId: string
}): Promise<{ error: Error | null }> {
  const remoteResponse = await deleteWorkoutSet(input.setId)
  if (!remoteResponse.error) {
    await applyDeleteSetProjection({ set_id: input.setId })
    return { error: null }
  }

  const err = remoteResponse.error
  if (!isRowNotFoundError(err) && !shouldQueueForRetry(err)) {
    return { error: toError(err) }
  }

  const payload: DeleteSetPayload = { set_id: input.setId }
  markOfflineEntered()
  await enqueueOutboxEvent(makeOutboxEvent(input.userId, 'delete_set', input.setId, payload))
  await applyDeleteSetProjection(payload)
  return { error: null }
}

export async function deleteExerciseOptimistic(input: {
  userId: string
  workoutExerciseId: string
}): Promise<{ error: Error | null }> {
  const remoteResponse = await deleteWorkoutExercise(input.workoutExerciseId)
  if (!remoteResponse.error) {
    await applyDeleteExerciseProjection({ workout_exercise_id: input.workoutExerciseId })
    return { error: null }
  }

  const err = remoteResponse.error
  if (!isRowNotFoundError(err) && !shouldQueueForRetry(err)) {
    return { error: toError(err) }
  }

  const payload: DeleteExercisePayload = { workout_exercise_id: input.workoutExerciseId }
  markOfflineEntered()
  await enqueueOutboxEvent(
    makeOutboxEvent(input.userId, 'delete_exercise', input.workoutExerciseId, payload),
  )
  await applyDeleteExerciseProjection(payload)
  return { error: null }
}

export async function cancelWorkoutOptimistic(input: {
  userId: string
  workoutId: string
}): Promise<{ error: Error | null }> {
  let remoteError: unknown

  try {
    const remoteResponse = await withTimeout(
      deleteWorkout(input.workoutId),
      REMOTE_MUTATION_TIMEOUT_MS,
    )
    if (!remoteResponse.error) {
      await applyCancelWorkoutProjection({ workout_id: input.workoutId })
      return { error: null }
    }

    remoteError = new Error(remoteResponse.error.message)
  } catch (error) {
    remoteError = error
  }

  if (!shouldQueueForRetry(remoteError)) {
    return { error: toError(remoteError) }
  }

  const payload: CancelWorkoutPayload = { workout_id: input.workoutId }
  markOfflineEntered()
  await enqueueOutboxEvent(
    makeOutboxEvent(input.userId, 'cancel_workout', input.workoutId, payload),
  )
  await applyCancelWorkoutProjection(payload)
  return { error: null }
}

export async function finishWorkoutOptimistic(input: {
  userId: string
  workoutId: string
}): Promise<WorkoutFinishMutationResult> {
  const endedAt = new Date().toISOString()
  const payload: FinishWorkoutPayload = {
    workout_id: input.workoutId,
    ended_at: endedAt,
  }
  let remoteError: unknown = null
  let nonRetryableError: Error | null = null

  try {
    const remoteResponse = await withTimeout(
      finishWorkout(input.workoutId),
      REMOTE_MUTATION_TIMEOUT_MS,
    )

    if (!remoteResponse.error && remoteResponse.data) {
      await applyFinishWorkoutProjection(payload)
      const scheduleResult = await completeScheduledRoutineByWorkoutId(input.workoutId)
      logScheduledRoutineCompletionFailure('finish_workout', input.workoutId, scheduleResult.error)
      if (scheduleResult.error) {
        markOfflineEntered()
        await enqueueOutboxEventIfMissing(
          makeOutboxEvent(input.userId, 'finish_workout', input.workoutId, payload),
        )
        return {
          data: remoteResponse.data,
          error: null,
          persistence: 'queued',
        }
      }
      return {
        data: remoteResponse.data,
        error: null,
        persistence: 'remote',
      }
    }

    remoteError = remoteResponse.error
    nonRetryableError = remoteResponse.error ? toError(remoteResponse.error) : null
  } catch (error) {
    remoteError = error
    nonRetryableError = toError(error)
  }

  if (!shouldQueueForRetry(remoteError)) {
    return { data: null, error: nonRetryableError, persistence: 'failed' }
  }

  markOfflineEntered()
  await enqueueOutboxEventIfMissing(
    makeOutboxEvent(input.userId, 'finish_workout', input.workoutId, payload),
  )
  await applyFinishWorkoutProjection(payload)

  return {
    data: null,
    error: null,
    persistence: 'queued',
  }
}

export async function finishWorkoutWithMetaOptimistic(input: {
  userId: string
  workoutId: string
  notes?: string | null
  effort_rating?: number | null
  session_note?: string | null
}): Promise<WorkoutFinishMutationResult> {
  const endedAt = new Date().toISOString()
  const payload: FinishWorkoutWithMetaPayload = {
    workout_id: input.workoutId,
    ended_at: endedAt,
    notes: input.notes ?? null,
    effort_rating: input.effort_rating ?? null,
    session_note: input.session_note ?? null,
  }
  let remoteError: unknown = null
  let nonRetryableError: Error | null = null

  try {
    const remoteResponse = await withTimeout(
      finishWorkoutWithMeta(input.workoutId, {
        notes: input.notes,
        effort_rating: input.effort_rating,
        session_note: input.session_note,
      }),
      REMOTE_MUTATION_TIMEOUT_MS,
    )

    if (!remoteResponse.error && remoteResponse.data) {
      await applyFinishWorkoutWithMetaProjection(payload)
      const scheduleResult = await completeScheduledRoutineByWorkoutId(input.workoutId)
      logScheduledRoutineCompletionFailure(
        'finish_workout_with_meta',
        input.workoutId,
        scheduleResult.error,
      )
      if (scheduleResult.error) {
        markOfflineEntered()
        await enqueueOutboxEventIfMissing(
          makeOutboxEvent(input.userId, 'finish_workout_with_meta', input.workoutId, payload),
        )
        return {
          data: remoteResponse.data,
          error: null,
          persistence: 'queued',
        }
      }
      return {
        data: remoteResponse.data,
        error: null,
        persistence: 'remote',
      }
    }

    remoteError = remoteResponse.error
    nonRetryableError = remoteResponse.error ? toError(remoteResponse.error) : null
  } catch (error) {
    remoteError = error
    nonRetryableError = toError(error)
  }

  if (!shouldQueueForRetry(remoteError)) {
    return { data: null, error: nonRetryableError, persistence: 'failed' }
  }

  markOfflineEntered()
  await enqueueOutboxEventIfMissing(
    makeOutboxEvent(input.userId, 'finish_workout_with_meta', input.workoutId, payload),
  )
  await applyFinishWorkoutWithMetaProjection(payload)

  return {
    data: null,
    error: null,
    persistence: 'queued',
  }
}

const LOAD_WORKOUT_REMOTE_TIMEOUT_MS = 6_000

async function hydrateProjectionDefinitions(
  localData: NonNullable<Awaited<ReturnType<typeof getProjectionWorkoutDetail>>>,
): Promise<NonNullable<Awaited<ReturnType<typeof getProjectionWorkoutDetail>>>> {
  const missingIds = localData.workout_exercises
    .filter((exercise) => !exercise.exercise_definition)
    .map((exercise) => exercise.exercise_definition_id)

  if (missingIds.length === 0) {
    return localData
  }

  try {
    const { data: defs } = await fetchExerciseDefinitionsByIds(missingIds)
    if (!defs?.length) {
      return localData
    }
    const defMap = new Map(defs.map((definition) => [definition.id, definition]))

    return {
      ...localData,
      workout_exercises: localData.workout_exercises.map((exercise) => ({
        ...exercise,
        exercise_definition: defMap.get(exercise.exercise_definition_id) ?? null,
      })),
    }
  } catch {
    return localData
  }
}

export async function loadWorkoutHybrid(workoutId: string): ReturnType<typeof fetchWorkoutDetail> {
  const [remoteResponse, rawLocalData] = await Promise.all([
    (async () => {
      try {
        return await withTimeout(fetchWorkoutDetail(workoutId), LOAD_WORKOUT_REMOTE_TIMEOUT_MS)
      } catch {
        return {
          data: null,
          error: new Error('Request timeout'),
          count: null,
          status: 0,
          statusText: '',
        } as Awaited<ReturnType<typeof fetchWorkoutDetail>>
      }
    })(),
    getProjectionWorkoutDetail(workoutId),
  ])

  const localData = rawLocalData ? await hydrateProjectionDefinitions(rawLocalData) : null

  if (!remoteResponse.error && remoteResponse.data) {
    if (!localData) {
      return remoteResponse
    }

    return {
      ...remoteResponse,
      data: mergeWorkoutRemoteWithLocal(remoteResponse.data, localData),
      error: null,
    }
  }

  if (localData) {
    return {
      data: localData,
      error: null,
    } as Awaited<ReturnType<typeof fetchWorkoutDetail>>
  }

  return remoteResponse
}

export async function fetchInProgressWorkoutHybrid(
  userId: string,
): ReturnType<typeof fetchInProgressWorkout> {
  const remoteResponse = await fetchInProgressWorkout(userId)
  if (!remoteResponse.error && remoteResponse.data) {
    return remoteResponse
  }

  const localData = await getProjectionInProgressWorkout(userId)
  if (localData) {
    return {
      data: localData,
      error: null,
    } as Awaited<ReturnType<typeof fetchInProgressWorkout>>
  }

  return remoteResponse
}

export async function addExerciseFallbackRemote(
  workoutId: string,
  exerciseDefinitionId: string,
  orderIndex: number,
) {
  return addExerciseToWorkout(workoutId, exerciseDefinitionId, orderIndex)
}

export async function addSetFallbackRemote(
  workoutExerciseId: string,
  setIndex: number,
  fields: {
    reps?: number | null
    weight?: number | null
    weight_kg?: number | null
    duration_seconds?: number | null
    distance_m?: number | null
    set_type?: WorkoutSetType | null
    rir?: number | null
    is_completed?: boolean
  },
  units: UnitsPreference,
) {
  return addSet(workoutExerciseId, setIndex, fields, units)
}

export async function updateSetFallbackRemote(
  setId: string,
  fields: {
    reps?: number | null
    weight?: number | null
    weight_kg?: number | null
    duration_seconds?: number | null
    distance_m?: number | null
    set_type?: WorkoutSetType | null
    rir?: number | null
    is_completed?: boolean
  },
  units: UnitsPreference,
) {
  return updateWorkoutSet(setId, fields, units)
}
