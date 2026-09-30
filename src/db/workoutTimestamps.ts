type WorkoutTimestampFields = {
  started_at?: string | null
  ended_at?: string | null
  created_at?: string | null
}

export function getWorkoutDisplayTimestamp(workout: WorkoutTimestampFields): string | null {
  return workout.started_at ?? workout.ended_at ?? workout.created_at ?? null
}

export function getWorkoutStartedFallback(workout: WorkoutTimestampFields): string | null {
  return workout.started_at ?? workout.ended_at ?? workout.created_at ?? null
}
