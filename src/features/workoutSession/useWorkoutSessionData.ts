import { useMemo } from 'react'
import {
  type ExerciseTrackingMode,
  type WorkoutExerciseRow,
  type WorkoutSetType,
  fetchLastExercisePerformance,
  searchExerciseDefinitions,
} from '../../db/workouts'
import type { UnitsPreference } from '../../lib/profilePreferences'
import {
  addExerciseOptimistic,
  addSetOptimistic,
  cancelWorkoutOptimistic,
  deleteExerciseOptimistic,
  deleteSetOptimistic,
  finishWorkoutOptimistic,
  finishWorkoutWithMetaOptimistic,
  loadWorkoutHybrid,
  type WorkoutFinishMutationResult,
  updateExerciseSupersetOptimistic,
  updateSetOptimistic,
} from '../sync/outbox/workoutMutations'
import { updateWorkoutExerciseNotes } from '../../db/workouts'

export function useWorkoutSessionData(workoutId: string | undefined, userId: string | undefined) {
  return useMemo(
    () => ({
      loadWorkout: async () => {
        if (!workoutId) {
          return { data: null, error: new Error('Missing workout session id.') }
        }
        return loadWorkoutHybrid(workoutId)
      },
      searchExercises: async (query: string) => searchExerciseDefinitions(query),
      fetchLastPerformance: async (exerciseDefinitionId: string) => {
        if (!userId || !workoutId) {
          return { data: null, error: null }
        }
        return fetchLastExercisePerformance(userId, exerciseDefinitionId, workoutId)
      },
      addExercise: async (exerciseDefinitionId: string, orderIndex: number) => {
        if (!workoutId) {
          return { data: null, error: new Error('Missing workout session id.') }
        }
        if (!userId) {
          return { data: null, error: new Error('Missing user id.') }
        }
        return addExerciseOptimistic({
          userId,
          workoutId,
          exerciseDefinitionId,
          orderIndex,
        })
      },
      updateExerciseSuperset: async (
        exercise: Pick<
          WorkoutExerciseRow,
          | 'id'
          | 'workout_id'
          | 'client_uuid'
          | 'exercise_definition_id'
          | 'order_index'
          | 'notes'
          | 'created_at'
        >,
        supersetGroupId: string | null,
        supersetOrder: number | null,
      ) => {
        if (!userId) return { data: null, error: new Error('Missing user id.') }
        return updateExerciseSupersetOptimistic({
          userId,
          exercise,
          supersetGroupId,
          supersetOrder,
        })
      },
      deleteExercise: async (workoutExerciseId: string) => {
        if (!userId) return { error: new Error('Missing user id.') }
        return deleteExerciseOptimistic({ userId, workoutExerciseId })
      },
      addSet: async (
        workoutExerciseId: string,
        fields: {
          trackingMode: ExerciseTrackingMode
          reps?: number | null
          weight?: number | null
          weight_kg?: number | null
          duration_seconds?: number | null
          distance_m?: number | null
          set_type?: WorkoutSetType | null
          rir?: number | null
        },
        setIndex: number,
        units: UnitsPreference,
      ) => {
        if (!userId) return { data: null, error: new Error('Missing user id.') }
        return addSetOptimistic({
          userId,
          workoutExerciseId,
          trackingMode: fields.trackingMode,
          reps: fields.reps ?? null,
          weight: fields.weight ?? null,
          weight_kg: fields.weight_kg ?? null,
          duration_seconds: fields.duration_seconds ?? null,
          distance_m: fields.distance_m ?? null,
          set_type: fields.set_type,
          rir: fields.rir,
          setIndex,
          units,
        })
      },
      deleteSet: async (setId: string) => {
        if (!userId) return { error: new Error('Missing user id.') }
        return deleteSetOptimistic({ userId, setId })
      },
      updateSet: async (
        setId: string,
        fields: {
          trackingMode: ExerciseTrackingMode
          reps?: number | null
          weight?: number | null
          weight_kg?: number | null
          duration_seconds?: number | null
          distance_m?: number | null
          set_type?: WorkoutSetType | null
          rir?: number | null
        },
        units: UnitsPreference,
      ) => {
        if (!userId) return { data: null, error: new Error('Missing user id.') }
        return updateSetOptimistic({
          userId,
          setId,
          trackingMode: fields.trackingMode,
          reps: fields.reps ?? null,
          weight: fields.weight ?? null,
          weight_kg: fields.weight_kg ?? null,
          duration_seconds: fields.duration_seconds ?? null,
          distance_m: fields.distance_m ?? null,
          set_type: fields.set_type,
          rir: fields.rir,
          units,
        })
      },
      updateExerciseNotes: async (workoutExerciseId: string, notes: string | null) =>
        updateWorkoutExerciseNotes(workoutExerciseId, notes),
      cancelWorkout: async () => {
        if (!workoutId) {
          return { error: new Error('Missing workout session id.') }
        }
        if (!userId) {
          return { error: new Error('Missing user id.') }
        }
        return cancelWorkoutOptimistic({ userId, workoutId })
      },
      finishWorkout: async () => {
        if (!workoutId) {
          return {
            data: null,
            error: new Error('Missing workout session id.'),
            persistence: 'failed',
          } satisfies WorkoutFinishMutationResult
        }
        if (!userId) {
          return {
            data: null,
            error: new Error('Missing user id.'),
            persistence: 'failed',
          } satisfies WorkoutFinishMutationResult
        }
        return finishWorkoutOptimistic({ userId, workoutId })
      },
      finishWorkoutWithMeta: async (input: {
        notes?: string | null
        effort_rating?: number | null
        session_note?: string | null
      }) => {
        if (!workoutId) {
          return {
            data: null,
            error: new Error('Missing workout session id.'),
            persistence: 'failed',
          } satisfies WorkoutFinishMutationResult
        }
        if (!userId) {
          return {
            data: null,
            error: new Error('Missing user id.'),
            persistence: 'failed',
          } satisfies WorkoutFinishMutationResult
        }
        return finishWorkoutWithMetaOptimistic({
          userId,
          workoutId,
          notes: input.notes,
          effort_rating: input.effort_rating,
          session_note: input.session_note,
        })
      },
    }),
    [userId, workoutId],
  )
}
