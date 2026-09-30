import type { WorkoutDetail, WorkoutRow } from '../../../db/workouts'
import { toWeightKg } from '../../../lib/units'
import type { UnitsPreference } from '../../../lib/profilePreferences'
import { loadWorkoutProjection, saveWorkoutProjection } from './fileStore'
import type {
  CancelWorkoutPayload,
  CreateWorkoutPayload,
  DeleteExercisePayload,
  DeleteSetPayload,
  FinishWorkoutPayload,
  FinishWorkoutWithMetaPayload,
  ProjectionExercise,
  ProjectionSet,
  ProjectionWorkout,
  UpsertExercisePayload,
  UpsertSetPayload,
  UpdateSetPayload,
  WorkoutProjectionState,
} from './types'

function sortProjection(projection: WorkoutProjectionState): WorkoutProjectionState {
  return {
    workouts: [...projection.workouts]
      .map((workout) => ({
        ...workout,
        workout_exercises: [...workout.workout_exercises]
          .sort((a, b) => a.order_index - b.order_index)
          .map((exercise) => ({
            ...exercise,
            workout_sets: [...exercise.workout_sets].sort((a, b) => a.set_index - b.set_index),
          })),
      }))
      .sort((a, b) => b.started_at.localeCompare(a.started_at)),
  }
}

async function updateProjection(
  updater: (state: WorkoutProjectionState) => WorkoutProjectionState,
): Promise<WorkoutProjectionState> {
  const current = await loadWorkoutProjection()
  const next = sortProjection(updater(current))
  await saveWorkoutProjection(next)
  return next
}

function createExerciseFromPayload(payload: UpsertExercisePayload): ProjectionExercise {
  return {
    id: payload.id,
    workout_id: payload.workout_id,
    client_uuid: payload.client_uuid,
    exercise_definition_id: payload.exercise_definition_id,
    order_index: payload.order_index,
    notes: payload.notes,
    superset_group_id: payload.superset_group_id ?? null,
    superset_order: payload.superset_order ?? null,
    created_at: payload.created_at,
    workout_sets: [],
  }
}

function createSetFromPayload(payload: UpsertSetPayload): ProjectionSet {
  return {
    id: payload.id,
    workout_exercise_id: payload.workout_exercise_id,
    client_uuid: payload.client_uuid,
    set_index: payload.set_index,
    reps: payload.reps,
    weight: payload.weight,
    weight_kg: payload.weight_kg,
    duration_seconds: payload.duration_seconds ?? null,
    distance_m: payload.distance_m ?? null,
    set_type: payload.set_type ?? 'normal',
    rir: payload.rir ?? null,
    is_weight_canonical: payload.weight_kg !== null,
    is_completed: payload.is_completed,
    created_at: payload.created_at,
  }
}

export async function applyCreateWorkoutProjection(payload: CreateWorkoutPayload): Promise<void> {
  await updateProjection((state) => {
    const existing = state.workouts.find((workout) => workout.id === payload.id)
    if (existing) return state

    const nextWorkout: ProjectionWorkout = {
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
      workout_exercises: [],
    }

    return {
      ...state,
      workouts: [nextWorkout, ...state.workouts],
    }
  })
}

function applySingleExerciseToWorkout(
  workout: ProjectionWorkout,
  payload: UpsertExercisePayload,
): ProjectionWorkout {
  if (workout.id !== payload.workout_id) return workout

  const existing = workout.workout_exercises.find((exercise) => exercise.id === payload.id)
  if (existing) {
    return {
      ...workout,
      workout_exercises: workout.workout_exercises.map((exercise) =>
        exercise.id === payload.id
          ? {
              ...exercise,
              order_index: payload.order_index,
              notes: payload.notes,
              superset_group_id: payload.superset_group_id ?? exercise.superset_group_id ?? null,
              superset_order: payload.superset_order ?? exercise.superset_order ?? null,
            }
          : exercise,
      ),
    }
  }

  return {
    ...workout,
    workout_exercises: [...workout.workout_exercises, createExerciseFromPayload(payload)],
  }
}

export async function applyUpsertExerciseProjection(payload: UpsertExercisePayload): Promise<void> {
  await updateProjection((state) => ({
    ...state,
    workouts: state.workouts.map((workout) => applySingleExerciseToWorkout(workout, payload)),
  }))
}

/** Applies multiple exercise payloads in one load-modify-save cycle. Use from startRoutine to avoid N+1 projection updates. */
export async function applyUpsertExercisesProjectionBatch(
  workoutId: string,
  payloads: UpsertExercisePayload[],
): Promise<void> {
  if (payloads.length === 0) return
  await updateProjection((state) => ({
    ...state,
    workouts: state.workouts.map((workout) => {
      if (workout.id !== workoutId) return workout
      return payloads.reduce((acc, payload) => applySingleExerciseToWorkout(acc, payload), workout)
    }),
  }))
}

export async function applyUpsertSetProjection(payload: UpsertSetPayload): Promise<void> {
  await updateProjection((state) => ({
    ...state,
    workouts: state.workouts.map((workout) => ({
      ...workout,
      workout_exercises: workout.workout_exercises.map((exercise) => {
        if (exercise.id !== payload.workout_exercise_id) return exercise

        const existing = exercise.workout_sets.find((set) => set.id === payload.id)
        if (existing) {
          return {
            ...exercise,
            workout_sets: exercise.workout_sets.map((set) =>
              set.id === payload.id
                ? {
                    ...set,
                    set_index: payload.set_index,
                    reps: payload.reps,
                    weight: payload.weight,
                    weight_kg: payload.weight_kg,
                    duration_seconds: payload.duration_seconds,
                    distance_m: payload.distance_m,
                    set_type: payload.set_type ?? set.set_type ?? 'normal',
                    rir: payload.rir ?? set.rir,
                    is_weight_canonical: payload.weight_kg !== null,
                    is_completed: payload.is_completed,
                  }
                : set,
            ),
          }
        }

        return {
          ...exercise,
          workout_sets: [...exercise.workout_sets, createSetFromPayload(payload)],
        }
      }),
    })),
  }))
}

export async function applyUpdateSetProjection(
  payload: UpdateSetPayload,
  units: UnitsPreference,
): Promise<void> {
  await updateProjection((state) => ({
    ...state,
    workouts: state.workouts.map((workout) => ({
      ...workout,
      workout_exercises: workout.workout_exercises.map((exercise) => ({
        ...exercise,
        workout_sets: exercise.workout_sets.map((set) =>
          set.id === payload.set_id
            ? {
                ...set,
                reps: payload.reps,
                weight: payload.weight,
                weight_kg:
                  payload.weight_kg ??
                  (payload.weight !== null ? toWeightKg(payload.weight, units) : null),
                duration_seconds: payload.duration_seconds ?? null,
                distance_m: payload.distance_m ?? null,
                set_type: payload.set_type ?? set.set_type ?? 'normal',
                rir: payload.rir ?? set.rir,
                is_weight_canonical:
                  payload.weight_kg !== null ||
                  (payload.weight !== null && payload.weight !== undefined),
                is_completed: payload.is_completed ?? set.is_completed,
              }
            : set,
        ),
      })),
    })),
  }))
}

export async function applyDeleteSetProjection(payload: DeleteSetPayload): Promise<void> {
  await updateProjection((state) => ({
    ...state,
    workouts: state.workouts.map((workout) => ({
      ...workout,
      workout_exercises: workout.workout_exercises.map((exercise) => ({
        ...exercise,
        workout_sets: exercise.workout_sets.filter((set) => set.id !== payload.set_id),
      })),
    })),
  }))
}

export async function applyDeleteExerciseProjection(payload: DeleteExercisePayload): Promise<void> {
  await updateProjection((state) => ({
    ...state,
    workouts: state.workouts.map((workout) => ({
      ...workout,
      workout_exercises: workout.workout_exercises.filter(
        (exercise) => exercise.id !== payload.workout_exercise_id,
      ),
    })),
  }))
}

export async function applyFinishWorkoutProjection(payload: FinishWorkoutPayload): Promise<void> {
  await updateProjection((state) => ({
    ...state,
    workouts: state.workouts.map((workout) =>
      workout.id === payload.workout_id
        ? {
            ...workout,
            status: 'completed',
            ended_at: payload.ended_at,
          }
        : workout,
    ),
  }))
}

export async function applyFinishWorkoutWithMetaProjection(
  payload: FinishWorkoutWithMetaPayload,
): Promise<void> {
  await updateProjection((state) => ({
    ...state,
    workouts: state.workouts.map((workout) =>
      workout.id === payload.workout_id
        ? {
            ...workout,
            status: 'completed',
            ended_at: payload.ended_at,
            notes: payload.notes,
            effort_rating: payload.effort_rating,
            session_note: payload.session_note,
          }
        : workout,
    ),
  }))
}

export async function applyCancelWorkoutProjection(payload: CancelWorkoutPayload): Promise<void> {
  await updateProjection((state) => ({
    ...state,
    workouts: state.workouts.filter((workout) => workout.id !== payload.workout_id),
  }))
}

export async function getProjectionInProgressWorkout(userId: string): Promise<WorkoutRow | null> {
  const projection = await loadWorkoutProjection()

  const target = projection.workouts.find(
    (workout) => workout.user_id === userId && workout.status === 'in_progress',
  )

  if (!target) return null

  return {
    id: target.id,
    user_id: target.user_id,
    client_uuid: target.client_uuid,
    started_at: target.started_at,
    ended_at: target.ended_at,
    status: target.status,
    notes: target.notes,
    effort_rating: target.effort_rating,
    session_note: target.session_note,
    created_at: target.created_at,
  }
}

/** Completed workouts in projection (finished locally, may not be synced). Used to merge into today metrics. */
export async function getProjectionCompletedWorkouts(userId: string): Promise<WorkoutRow[]> {
  const projection = await loadWorkoutProjection()
  const completed = projection.workouts.filter(
    (w) => w.user_id === userId && w.status === 'completed' && w.ended_at != null,
  )
  return completed.map((w) => ({
    id: w.id,
    user_id: w.user_id,
    client_uuid: w.client_uuid,
    started_at: w.started_at,
    ended_at: w.ended_at,
    status: w.status,
    notes: w.notes,
    effort_rating: w.effort_rating,
    session_note: w.session_note,
    created_at: w.created_at,
  }))
}

export async function getProjectionWorkoutDetail(workoutId: string): Promise<WorkoutDetail | null> {
  const projection = await loadWorkoutProjection()
  const target = projection.workouts.find((workout) => workout.id === workoutId)

  if (!target) return null

  return {
    id: target.id,
    user_id: target.user_id,
    client_uuid: target.client_uuid,
    started_at: target.started_at,
    ended_at: target.ended_at,
    status: target.status,
    notes: target.notes,
    effort_rating: target.effort_rating,
    session_note: target.session_note,
    created_at: target.created_at,
    workout_exercises: target.workout_exercises.map((exercise) => ({
      id: exercise.id,
      workout_id: exercise.workout_id,
      client_uuid: exercise.client_uuid,
      exercise_definition_id: exercise.exercise_definition_id,
      order_index: exercise.order_index,
      notes: exercise.notes,
      superset_group_id: exercise.superset_group_id ?? null,
      superset_order: exercise.superset_order ?? null,
      created_at: exercise.created_at,
      exercise_definition: null,
      workout_sets: exercise.workout_sets.map((set) => ({
        id: set.id,
        workout_exercise_id: set.workout_exercise_id,
        client_uuid: set.client_uuid,
        set_index: set.set_index,
        reps: set.reps,
        weight: set.weight,
        weight_kg: set.weight_kg,
        duration_seconds: set.duration_seconds ?? null,
        distance_m: set.distance_m ?? null,
        set_type: set.set_type ?? 'normal',
        rir: set.rir ?? null,
        is_weight_canonical: set.is_weight_canonical,
        is_completed: set.is_completed,
        created_at: set.created_at,
      })),
    })),
  }
}

export async function getProjectionSetById(setId: string): Promise<ProjectionSet | null> {
  const projection = await loadWorkoutProjection()

  for (const workout of projection.workouts) {
    for (const exercise of workout.workout_exercises) {
      const target = exercise.workout_sets.find((set) => set.id === setId)
      if (target) return target
    }
  }

  return null
}
