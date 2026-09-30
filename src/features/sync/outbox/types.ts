import type { UnitsPreference } from '../../../lib/profilePreferences'
import type { WorkoutSetType } from '../../../db/workouts'

export type OutboxEventType =
  | 'create_workout'
  | 'upsert_exercise'
  | 'upsert_set'
  | 'update_set'
  | 'delete_set'
  | 'delete_exercise'
  | 'finish_workout'
  | 'finish_workout_with_meta'
  | 'cancel_workout'

export type OutboxEventStatus = 'pending' | 'blocked'

export interface OutboxEvent<TPayload = unknown> {
  event_id: string
  user_id: string
  type: OutboxEventType
  entity_client_uuid: string
  payload: TPayload
  attempt_count: number
  next_retry_at: string
  status: OutboxEventStatus
  last_error_code?: string
  last_error_message?: string
  created_at: string
  updated_at: string
}

export interface OutboxQueueState {
  events: OutboxEvent[]
}

export interface ProjectionSet {
  id: string
  workout_exercise_id: string
  client_uuid: string
  set_index: number
  reps: number | null
  weight: number | null
  weight_kg: number | null
  duration_seconds: number | null
  distance_m: number | null
  set_type: WorkoutSetType
  rir: number | null
  is_weight_canonical: boolean
  is_completed: boolean
  created_at: string
}

export interface ProjectionExercise {
  id: string
  workout_id: string
  client_uuid: string
  exercise_definition_id: string
  order_index: number
  notes: string | null
  superset_group_id: string | null
  superset_order: number | null
  created_at: string
  workout_sets: ProjectionSet[]
}

export interface ProjectionWorkout {
  id: string
  user_id: string
  client_uuid: string
  started_at: string
  ended_at: string | null
  status: 'in_progress' | 'completed'
  notes: string | null
  effort_rating: number | null
  session_note: string | null
  created_at: string
  workout_exercises: ProjectionExercise[]
}

export interface WorkoutProjectionState {
  workouts: ProjectionWorkout[]
}

export interface CreateWorkoutPayload {
  id: string
  user_id: string
  client_uuid: string
  started_at: string
  created_at: string
}

export interface UpsertExercisePayload {
  id: string
  workout_id: string
  client_uuid: string
  exercise_definition_id: string
  order_index: number
  notes: string | null
  superset_group_id?: string | null
  superset_order?: number | null
  created_at: string
}

export interface UpsertSetPayload {
  id: string
  workout_exercise_id: string
  client_uuid: string
  set_index: number
  reps: number | null
  weight: number | null
  weight_kg: number | null
  duration_seconds: number | null
  distance_m: number | null
  set_type?: WorkoutSetType | null
  rir?: number | null
  units: UnitsPreference
  is_completed: boolean
  created_at: string
}

export interface UpdateSetPayload {
  set_id: string
  reps: number | null
  weight: number | null
  weight_kg: number | null
  duration_seconds: number | null
  distance_m: number | null
  set_type?: WorkoutSetType | null
  rir?: number | null
  units: UnitsPreference
  is_completed?: boolean
}

export interface DeleteSetPayload {
  set_id: string
}

export interface DeleteExercisePayload {
  workout_exercise_id: string
}

export interface FinishWorkoutPayload {
  workout_id: string
  ended_at: string
}

export interface FinishWorkoutWithMetaPayload {
  workout_id: string
  ended_at: string
  notes: string | null
  effort_rating: number | null
  session_note: string | null
}

export interface CancelWorkoutPayload {
  workout_id: string
}
