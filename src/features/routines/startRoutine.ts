import { callStartWorkoutFromRoutine } from '../../db/workouts'
import { callStartScheduledWorkout, scheduleRoutineForDate } from '../../db/scheduledRoutines'
import { useStartScheduledWorkoutRPC } from '../../config/featureFlags'
import { bumpRoutineUsage } from '../../lib/routines'
import { setWorkoutRoutine } from '../../lib/workoutMetadata'
import { sanitizeErrorMessage } from '../../utils/errorMessages'
import {
  applyCreateWorkoutProjection,
  applyUpsertExercisesProjectionBatch,
} from '../sync/outbox/workoutProjection'
import type { CreateWorkoutPayload, UpsertExercisePayload } from '../sync/outbox/types'

interface StartRoutineInput {
  userId: string
  routineId: string
  plannedDateKey: string
  /** Optional refresh (e.g. sync.refresh) to pull latest routines before starting. */
  refresh?: () => Promise<unknown>
  /** Called as soon as the workout is created so the UI can navigate before exercises are added. */
  onWorkoutCreated?: (workoutId: string) => void
}

interface StartRoutineResult {
  workoutId: string | null
  skippedExerciseDefinitionIds: string[]
  errorMessage: string | null
}

const START_ROUTINE_PLAN_REQUIRED_ERROR =
  'This routine can only be started from a scheduled workout.'
const START_ROUTINE_GENERIC_ERROR =
  'Unable to start this scheduled workout right now. Please try again.'

function normalizeDateKey(value: string): string | null {
  const dateKey = value.trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null
}

function mapStartRoutineRpcError(errorMessage: string | null | undefined): string {
  const message = (errorMessage ?? '').trim()
  const normalized = message.toLowerCase()

  if (
    normalized === 'no_schedule_for_date' ||
    normalized === 'no routine scheduled for this day.'
  ) {
    return 'No routine scheduled for this day.'
  }

  if (
    normalized === 'routine_not_found' ||
    normalized === 'this routine is no longer available.' ||
    normalized === 'routine not found on server.'
  ) {
    return 'This routine is no longer available. Please sync your routines and try again.'
  }

  if (normalized === 'routine_empty' || normalized === 'this routine has no exercises yet.') {
    return 'This routine has no exercises yet. Add at least one exercise before starting.'
  }

  if (
    normalized === 'workout_in_progress' ||
    normalized.includes('finish or discard your current workout')
  ) {
    return 'Finish or discard your current workout before starting another.'
  }

  if (normalized === 'not_authenticated' || normalized.includes('session has expired')) {
    return 'Your session has expired. Please sign in again.'
  }

  if (normalized === 'forbidden' || normalized.includes('do not have permission')) {
    return 'You do not have permission to start this routine.'
  }

  return sanitizeErrorMessage(message || START_ROUTINE_GENERIC_ERROR)
}

export async function startRoutine({
  userId,
  routineId,
  plannedDateKey,
  refresh,
  onWorkoutCreated,
}: StartRoutineInput): Promise<StartRoutineResult> {
  if (!userId) {
    return {
      workoutId: null,
      skippedExerciseDefinitionIds: [],
      errorMessage: 'You must be logged in to start a routine.',
    }
  }

  const trimmedRoutineId = routineId.trim()
  if (!trimmedRoutineId) {
    return {
      workoutId: null,
      skippedExerciseDefinitionIds: [],
      errorMessage: 'Routine not found.',
    }
  }

  const normalizedPlannedDateKey = normalizeDateKey(plannedDateKey)
  if (!normalizedPlannedDateKey) {
    return {
      workoutId: null,
      skippedExerciseDefinitionIds: [],
      errorMessage: START_ROUTINE_PLAN_REQUIRED_ERROR,
    }
  }

  const diagStart = __DEV__ ? performance.now() : 0

  try {
    if (refresh) {
      await refresh()
    }

    let rpcResult: Awaited<ReturnType<typeof callStartWorkoutFromRoutine>>

    if (useStartScheduledWorkoutRPC) {
      rpcResult = await callStartScheduledWorkout(normalizedPlannedDateKey)

      // Retry once if the schedule row is missing — auto-schedule and re-start.
      if (rpcResult.error) {
        const errMsg = rpcResult.error.message ?? ''
        const isNoSchedule =
          errMsg === 'No routine scheduled for this day.' ||
          errMsg.toLowerCase() === 'no_schedule_for_date'

        if (isNoSchedule) {
          const scheduleResult = await scheduleRoutineForDate(
            normalizedPlannedDateKey,
            trimmedRoutineId,
          )
          if (scheduleResult.ok) {
            rpcResult = await callStartScheduledWorkout(normalizedPlannedDateKey)
          } else {
            return {
              workoutId: null,
              skippedExerciseDefinitionIds: [],
              errorMessage: mapStartRoutineRpcError(errMsg),
            }
          }
        }
      }
    } else {
      rpcResult = await callStartWorkoutFromRoutine(trimmedRoutineId)
    }

    if (rpcResult.error || !rpcResult.data) {
      return {
        workoutId: null,
        skippedExerciseDefinitionIds: [],
        errorMessage: mapStartRoutineRpcError(rpcResult.error?.message),
      }
    }

    const { workout, exercises } = rpcResult.data

    const isoNow = new Date().toISOString()
    const createPayload: CreateWorkoutPayload = {
      id: workout.id,
      user_id: workout.user_id,
      client_uuid: workout.client_uuid,
      started_at: workout.started_at ?? workout.created_at ?? isoNow,
      created_at: workout.created_at ?? workout.started_at ?? isoNow,
    }
    await applyCreateWorkoutProjection(createPayload)

    const exercisePayloads: UpsertExercisePayload[] = exercises.map((exercise) => ({
      id: exercise.id,
      workout_id: exercise.workout_id,
      client_uuid: exercise.client_uuid,
      exercise_definition_id: exercise.exercise_definition_id,
      order_index: exercise.order_index ?? 0,
      notes: exercise.notes ?? null,
      created_at: exercise.created_at ?? new Date().toISOString(),
    }))

    if (exercisePayloads.length > 0) {
      await applyUpsertExercisesProjectionBatch(workout.id, exercisePayloads)
    }

    try {
      await Promise.all([
        bumpRoutineUsage(userId, trimmedRoutineId),
        setWorkoutRoutine(userId, workout.id, trimmedRoutineId),
      ])
    } catch {
      // Ignore local persistence errors.
    }

    onWorkoutCreated?.(workout.id)

    if (__DEV__) {
      console.warn(
        `[StartRoutineDiag] startRoutine via RPC: ${(performance.now() - diagStart).toFixed(0)}ms`,
      )
    }

    return {
      workoutId: workout.id,
      skippedExerciseDefinitionIds: [],
      errorMessage: null,
    }
  } catch (error) {
    return {
      workoutId: null,
      skippedExerciseDefinitionIds: [],
      errorMessage: mapStartRoutineRpcError(error instanceof Error ? error.message : null),
    }
  }
}
