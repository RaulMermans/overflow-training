import { normalizeDbResult, requireSupabase } from '../lib/supabaseClient'
import { getWorkoutStartedFallback } from './workoutTimestamps'
import type { Database } from '../types/db'

export const DEFAULT_PROGRESS_RANGE_DAYS = 84

export type ProgressWorkout = {
  id: string
  ended_at: string | null
  started_at: string | null
  workout_exercises: {
    id: string
    exercise_definition_id: string
    exercise_definitions: {
      id: string
      name: string
      slug: string
      category?: string | null
      tracking_mode?: string | null
    } | null
    workout_sets: {
      id: string
      reps: number | null
      weight: number | null
      weight_kg?: number | null
      is_weight_canonical?: boolean | null
      duration_seconds?: number | null
      distance_m?: number | null
      set_index: number
      created_at: string | null
    }[]
  }[]
}

export type ProgressExercisePR = {
  exerciseDefinitionId: string
  exerciseName: string
  workoutId: string
  performedAt: string | null
  reps: number
  weight: number
  weightKg: number
  isWeightCanonical: boolean
  e1rmKg: number
}

export type ProgressExerciseOccurrence = {
  exerciseDefinitionId: string
  exerciseName: string
  workoutId: string
  performedAt: string | null
  reps: number
  weight: number
  weightKg: number
  isWeightCanonical: boolean
  e1rmKg: number
}

export type ExerciseProgressMeta = {
  id: string
  name: string
  trackingMode: string | null
}

type ProgressExercisePRRow =
  Database['public']['Functions']['get_progress_exercise_prs']['Returns'][number]

type ProgressExerciseOccurrenceRow =
  Database['public']['Functions']['get_progress_exercise_recent_occurrences']['Returns'][number]

export function getDefaultProgressRange(
  days: number = DEFAULT_PROGRESS_RANGE_DAYS,
  now: Date = new Date(),
) {
  const safeDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_PROGRESS_RANGE_DAYS
  const from = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000)
  return {
    fromISO: from.toISOString(),
    toISO: now.toISOString(),
    days: safeDays,
  }
}

export async function fetchProgressWorkouts(fromISO: string, toISO: string, userId: string) {
  const client = requireSupabase()
  const response = await client
    .from('workouts')
    .select(
      `
      id, started_at, ended_at, created_at,
      workout_exercises (
        id, exercise_definition_id,
        exercise_definitions:exercise_definition_id (id, name, slug, category, tracking_mode),
        workout_sets (id, reps, weight, weight_kg, is_weight_canonical, duration_seconds, distance_m, set_index, created_at)
      )
    `,
    )
    .eq('status', 'completed')
    .eq('user_id', userId)
    .gte('started_at', fromISO)
    .lte('started_at', toISO)
    .order('started_at', { ascending: false })
    .order('created_at', { ascending: false })

  const normalized = normalizeDbResult<ProgressWorkout[]>({
    data: response.data
      ? (response.data.map((workout) => ({
          ...workout,
          started_at: getWorkoutStartedFallback(workout),
          workout_exercises: Array.isArray(workout.workout_exercises)
            ? workout.workout_exercises
            : [],
        })) as ProgressWorkout[])
      : null,
    error: response.error,
  })

  return {
    ...response,
    ...normalized,
  }
}

export async function fetchProgressExercisePRs() {
  const client = requireSupabase()
  const response = await client.rpc('get_progress_exercise_prs')

  const normalized = normalizeDbResult<ProgressExercisePRRow[]>({
    data: (response.data ?? []) as ProgressExercisePRRow[],
    error: response.error,
  })

  if (normalized.error) {
    return { data: null as ProgressExercisePR[] | null, error: normalized.error }
  }

  return {
    data: (normalized.data ?? []).map((row) => ({
      exerciseDefinitionId: row.exercise_definition_id,
      exerciseName: row.exercise_name,
      workoutId: row.workout_id,
      performedAt: row.performed_at,
      reps: row.reps,
      weight: Number(row.weight),
      weightKg: Number(row.weight_kg),
      isWeightCanonical: Boolean(row.is_weight_canonical),
      e1rmKg: Number(row.e1rm_kg),
    })) as ProgressExercisePR[],
    error: null,
  }
}

export async function fetchProgressExerciseRecentOccurrences(
  exerciseDefinitionId: string,
  occurrenceLimit: number = 8,
) {
  if (!exerciseDefinitionId) {
    return { data: [] as ProgressExerciseOccurrence[], error: null }
  }

  const client = requireSupabase()
  const response = await client.rpc('get_progress_exercise_recent_occurrences', {
    target_exercise_definition_id: exerciseDefinitionId,
    occurrence_limit: occurrenceLimit,
  })

  const normalized = normalizeDbResult<ProgressExerciseOccurrenceRow[]>({
    data: (response.data ?? []) as ProgressExerciseOccurrenceRow[],
    error: response.error,
  })

  if (normalized.error) {
    return { data: null as ProgressExerciseOccurrence[] | null, error: normalized.error }
  }

  return {
    data: (normalized.data ?? []).map((row) => ({
      exerciseDefinitionId: row.exercise_definition_id,
      exerciseName: row.exercise_name,
      workoutId: row.workout_id,
      performedAt: row.performed_at,
      reps: row.reps,
      weight: Number(row.weight),
      weightKg: Number(row.weight_kg),
      isWeightCanonical: Boolean(row.is_weight_canonical),
      e1rmKg: Number(row.e1rm_kg),
    })) as ProgressExerciseOccurrence[],
    error: null,
  }
}

export async function fetchExerciseProgressMeta(exerciseDefinitionId: string) {
  if (!exerciseDefinitionId) {
    return { data: null as ExerciseProgressMeta | null, error: null }
  }

  const client = requireSupabase()
  const response = await client
    .from('exercise_definitions')
    .select('id, name, tracking_mode')
    .eq('id', exerciseDefinitionId)
    .maybeSingle()

  const normalized = normalizeDbResult<{
    id: string
    name: string
    tracking_mode: string | null
  } | null>({
    data: response.data
      ? {
          id: response.data.id,
          name: response.data.name,
          tracking_mode: response.data.tracking_mode,
        }
      : null,
    error: response.error,
  })

  if (normalized.error) {
    return { data: null as ExerciseProgressMeta | null, error: normalized.error }
  }

  if (!normalized.data) {
    return { data: null as ExerciseProgressMeta | null, error: null }
  }

  return {
    data: {
      id: normalized.data.id,
      name: normalized.data.name,
      trackingMode: normalized.data.tracking_mode,
    } as ExerciseProgressMeta,
    error: null,
  }
}

export async function fetchLatestCompletedWorkoutId(userId: string) {
  const client = requireSupabase()
  const response = await client
    .from('workouts')
    .select('id, started_at, created_at')
    .eq('status', 'completed')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const normalized = normalizeDbResult<{ id: string } | null>({
    data: response.data ? { id: response.data.id } : null,
    error: response.error,
  })

  return {
    ...response,
    ...normalized,
  }
}

export async function fetchCompletedWorkoutCount(userId: string) {
  const client = requireSupabase()
  const response = await client
    .from('workouts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .eq('user_id', userId)

  const normalized = normalizeDbResult<number>({
    data: response.count ?? 0,
    error: response.error,
  })

  return {
    ...response,
    ...normalized,
  }
}
