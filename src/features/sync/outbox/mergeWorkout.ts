import type { WorkoutDetail } from '../../../db/workouts'

type WorkoutExerciseDetail = WorkoutDetail['workout_exercises'][number]
type WorkoutSetDetail = WorkoutExerciseDetail['workout_sets'][number]

function stableSortByNumber<T>(items: T[], getValue: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const valueDiff = getValue(left.item) - getValue(right.item)
      if (valueDiff !== 0) return valueDiff
      return left.index - right.index
    })
    .map((entry) => entry.item)
}

function trimToEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toExerciseFallbackKey(exercise: WorkoutExerciseDetail): string {
  return `${trimToEmpty(exercise.exercise_definition_id)}::${Number(exercise.order_index)}`
}

function mergeSet(remoteSet: WorkoutSetDetail, localSet: WorkoutSetDetail): WorkoutSetDetail {
  const merged = {
    ...remoteSet,
    reps: localSet.reps,
    weight: localSet.weight,
    weight_kg: localSet.weight_kg,
    duration_seconds: localSet.duration_seconds,
    distance_m: localSet.distance_m,
  }

  const localNotes = (localSet as Record<string, unknown>).notes
  if (localNotes !== undefined) {
    const mergedWithOptionalNotes = merged as Record<string, unknown>
    mergedWithOptionalNotes.notes = localNotes
  }

  if (!trimToEmpty(merged.created_at) && trimToEmpty(localSet.created_at)) {
    merged.created_at = localSet.created_at
  }

  if (!trimToEmpty(merged.id) && trimToEmpty(localSet.id)) {
    merged.id = localSet.id
  }
  if (!trimToEmpty(merged.client_uuid) && trimToEmpty(localSet.client_uuid)) {
    merged.client_uuid = localSet.client_uuid
  }
  if (!trimToEmpty(merged.workout_exercise_id) && trimToEmpty(localSet.workout_exercise_id)) {
    merged.workout_exercise_id = localSet.workout_exercise_id
  }

  return merged
}

function mergeSets(
  remoteSets: WorkoutSetDetail[],
  localSets: WorkoutSetDetail[],
): WorkoutSetDetail[] {
  const consumedLocalIndexes = new Set<number>()
  const merged: WorkoutSetDetail[] = []

  for (const remoteSet of remoteSets) {
    const remoteId = trimToEmpty(remoteSet.id)
    let localIndex = -1

    if (remoteId) {
      localIndex = localSets.findIndex(
        (candidate, index) =>
          !consumedLocalIndexes.has(index) && trimToEmpty(candidate.id) === remoteId,
      )
    }

    if (localIndex === -1) {
      localIndex = localSets.findIndex(
        (candidate, index) =>
          !consumedLocalIndexes.has(index) &&
          Number(candidate.set_index) === Number(remoteSet.set_index),
      )
    }

    if (localIndex === -1) {
      merged.push(remoteSet)
      continue
    }

    consumedLocalIndexes.add(localIndex)
    merged.push(mergeSet(remoteSet, localSets[localIndex]))
  }

  localSets.forEach((localSet, index) => {
    if (consumedLocalIndexes.has(index)) return
    merged.push(localSet)
  })

  return stableSortByNumber(merged, (set) => Number(set.set_index))
}

function mergeExercise(
  remoteExercise: WorkoutExerciseDetail,
  localExercise: WorkoutExerciseDetail,
): WorkoutExerciseDetail {
  const merged: WorkoutExerciseDetail = {
    ...remoteExercise,
    order_index: localExercise.order_index,
    notes: localExercise.notes ?? null,
    exercise_definition:
      remoteExercise.exercise_definition ?? localExercise.exercise_definition ?? null,
    workout_sets: mergeSets(remoteExercise.workout_sets ?? [], localExercise.workout_sets ?? []),
  }

  if (!trimToEmpty(merged.id) && trimToEmpty(localExercise.id)) {
    merged.id = localExercise.id
  }
  if (!trimToEmpty(merged.client_uuid) && trimToEmpty(localExercise.client_uuid)) {
    merged.client_uuid = localExercise.client_uuid
  }
  if (!trimToEmpty(merged.created_at) && trimToEmpty(localExercise.created_at)) {
    merged.created_at = localExercise.created_at
  }

  return merged
}

export function mergeWorkoutRemoteWithLocal(
  remote: WorkoutDetail,
  local: WorkoutDetail,
): WorkoutDetail {
  const remoteExercises = remote.workout_exercises ?? []
  const localExercises = local.workout_exercises ?? []

  const consumedLocalIndexes = new Set<number>()
  const mergedExercises: WorkoutExerciseDetail[] = []

  for (const remoteExercise of remoteExercises) {
    const remoteId = trimToEmpty(remoteExercise.id)
    let localIndex = -1

    if (remoteId) {
      localIndex = localExercises.findIndex(
        (candidate, index) =>
          !consumedLocalIndexes.has(index) && trimToEmpty(candidate.id) === remoteId,
      )
    }

    if (localIndex === -1) {
      const fallbackKey = toExerciseFallbackKey(remoteExercise)
      localIndex = localExercises.findIndex(
        (candidate, index) =>
          !consumedLocalIndexes.has(index) && toExerciseFallbackKey(candidate) === fallbackKey,
      )
    }

    if (localIndex === -1) {
      mergedExercises.push({
        ...remoteExercise,
        workout_sets: stableSortByNumber([...(remoteExercise.workout_sets ?? [])], (set) =>
          Number(set.set_index),
        ),
      } as WorkoutExerciseDetail)
      continue
    }

    consumedLocalIndexes.add(localIndex)
    mergedExercises.push(mergeExercise(remoteExercise, localExercises[localIndex]))
  }

  localExercises.forEach((localExercise, index) => {
    if (consumedLocalIndexes.has(index)) return
    mergedExercises.push({
      ...localExercise,
      workout_sets: stableSortByNumber([...(localExercise.workout_sets ?? [])], (set) =>
        Number(set.set_index),
      ),
    })
  })

  // Progress integrity: completed wins — never downgrade or wipe ended_at.
  // If either side has completed, keep it. If either has ended_at, never null it.
  const status =
    remote.status === 'completed' || local.status === 'completed'
      ? 'completed'
      : (remote.status ?? local.status ?? 'in_progress')
  const ended_at = remote.ended_at ?? local.ended_at ?? null

  return {
    ...remote,
    status,
    ended_at,
    notes: local.notes,
    effort_rating: local.effort_rating,
    session_note: local.session_note,
    workout_exercises: stableSortByNumber(mergedExercises, (exercise) =>
      Number(exercise.order_index),
    ),
  }
}
