import type { WorkoutDetail } from '../src/db/workouts'
import { mergeWorkoutRemoteWithLocal } from '../src/features/sync/outbox/mergeWorkout'

type WorkoutExerciseDetail = WorkoutDetail['workout_exercises'][number]
type WorkoutSetDetail = WorkoutExerciseDetail['workout_sets'][number]

function makeDefinition(id: string, name: string) {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    muscle_group: 'chest',
    equipment: 'barbell',
    scope: 'system' as const,
    category: 'strength' as const,
    tracking_mode: 'weight_reps' as const,
    primary_targets: ['chest'],
    secondary_targets: [],
  }
}

function makeSet(overrides: Partial<WorkoutSetDetail> = {}): WorkoutSetDetail {
  return {
    id: overrides.id ?? 'set-1',
    workout_exercise_id: overrides.workout_exercise_id ?? 'ex-1',
    client_uuid: overrides.client_uuid ?? 'set-client-1',
    set_index: overrides.set_index ?? 0,
    reps: overrides.reps ?? 8,
    weight: overrides.weight ?? 100,
    weight_kg: overrides.weight_kg ?? 45,
    duration_seconds: overrides.duration_seconds ?? null,
    distance_m: overrides.distance_m ?? null,
    set_type: overrides.set_type ?? 'normal',
    rir: overrides.rir ?? null,
    is_weight_canonical: overrides.is_weight_canonical ?? true,
    is_completed: overrides.is_completed ?? true,
    created_at: overrides.created_at ?? '2026-02-20T10:00:00.000Z',
  }
}

function makeExercise(overrides: Partial<WorkoutExerciseDetail> = {}): WorkoutExerciseDetail {
  return {
    id: overrides.id ?? 'ex-1',
    workout_id: overrides.workout_id ?? 'workout-1',
    client_uuid: overrides.client_uuid ?? 'exercise-client-1',
    exercise_definition_id: overrides.exercise_definition_id ?? 'def-1',
    order_index: overrides.order_index ?? 0,
    notes: overrides.notes ?? null,
    superset_group_id: overrides.superset_group_id ?? null,
    superset_order: overrides.superset_order ?? null,
    created_at: overrides.created_at ?? '2026-02-20T10:00:00.000Z',
    exercise_definition:
      overrides.exercise_definition === undefined
        ? makeDefinition('def-1', 'Bench Press')
        : overrides.exercise_definition,
    workout_sets: overrides.workout_sets ?? [makeSet()],
  }
}

function makeWorkout(overrides: Partial<WorkoutDetail> = {}): WorkoutDetail {
  return {
    id: overrides.id ?? 'workout-1',
    user_id: overrides.user_id ?? 'user-1',
    client_uuid: overrides.client_uuid ?? 'workout-client-1',
    started_at: overrides.started_at ?? '2026-02-20T10:00:00.000Z',
    ended_at: overrides.ended_at ?? null,
    status: overrides.status ?? 'in_progress',
    notes: overrides.notes ?? null,
    effort_rating: overrides.effort_rating ?? null,
    session_note: overrides.session_note ?? null,
    created_at: overrides.created_at ?? '2026-02-20T10:00:00.000Z',
    workout_exercises: overrides.workout_exercises ?? [makeExercise()],
  }
}

describe('mergeWorkoutRemoteWithLocal', () => {
  it('keeps local-added sets that are missing in remote', () => {
    const remote = makeWorkout({
      workout_exercises: [
        makeExercise({
          id: 'ex-1',
          workout_sets: [makeSet({ id: 'set-1', set_index: 0 })],
        }),
      ],
    })
    const local = makeWorkout({
      workout_exercises: [
        makeExercise({
          id: 'ex-1',
          workout_sets: [
            makeSet({ id: 'set-1', set_index: 0 }),
            makeSet({ id: 'set-local-added', set_index: 1, reps: 12 }),
          ],
        }),
      ],
    })

    const merged = mergeWorkoutRemoteWithLocal(remote, local)
    expect(merged.workout_exercises[0].workout_sets).toHaveLength(2)
    expect(
      merged.workout_exercises[0].workout_sets.some((set) => set.id === 'set-local-added'),
    ).toBe(true)
  })

  it('overrides remote set metrics using local values', () => {
    const remote = makeWorkout({
      workout_exercises: [
        makeExercise({
          id: 'ex-1',
          workout_sets: [
            makeSet({
              id: 'set-remote',
              set_index: 0,
              reps: 8,
              weight: 100,
              weight_kg: 45,
              duration_seconds: 30,
              distance_m: 120,
              created_at: '2026-02-20T10:00:00.000Z',
            }),
          ],
        }),
      ],
    })
    const local = makeWorkout({
      workout_exercises: [
        makeExercise({
          id: 'local-exercise-id',
          exercise_definition_id: 'def-1',
          order_index: 0,
          workout_sets: [
            makeSet({
              id: 'set-local',
              set_index: 0,
              reps: 12,
              weight: 120,
              weight_kg: 54,
              duration_seconds: 45,
              distance_m: 200,
              created_at: '2026-02-22T10:00:00.000Z',
            }),
          ],
        }),
      ],
    })

    const merged = mergeWorkoutRemoteWithLocal(remote, local)
    const mergedSet = merged.workout_exercises[0].workout_sets[0]

    expect(mergedSet.reps).toBe(12)
    expect(mergedSet.weight).toBe(120)
    expect(mergedSet.weight_kg).toBe(54)
    expect(mergedSet.duration_seconds).toBe(45)
    expect(mergedSet.distance_m).toBe(200)
    expect(mergedSet.created_at).toBe('2026-02-20T10:00:00.000Z')
  })

  it('preserves remote exercise_definition when local exercise_definition is missing', () => {
    const remote = makeWorkout({
      workout_exercises: [
        makeExercise({
          id: 'ex-1',
          exercise_definition: makeDefinition('def-1', 'Bench Press'),
        }),
      ],
    })
    const local = makeWorkout({
      workout_exercises: [
        makeExercise({
          id: 'ex-1',
          exercise_definition: null,
        }),
      ],
    })

    const merged = mergeWorkoutRemoteWithLocal(remote, local)
    expect(merged.workout_exercises[0].exercise_definition?.name).toBe('Bench Press')
  })

  it('sorts exercises by order_index and sets by set_index', () => {
    const remote = makeWorkout({
      workout_exercises: [
        makeExercise({
          id: 'ex-2',
          exercise_definition_id: 'def-2',
          order_index: 2,
          workout_sets: [
            makeSet({ id: 'set-2b', set_index: 2 }),
            makeSet({ id: 'set-2a', set_index: 0 }),
          ],
        }),
        makeExercise({
          id: 'ex-0',
          exercise_definition_id: 'def-0',
          order_index: 0,
          workout_sets: [makeSet({ id: 'set-0', set_index: 1 })],
        }),
      ],
    })
    const local = makeWorkout({
      workout_exercises: [
        makeExercise({
          id: 'ex-local-middle',
          exercise_definition_id: 'def-middle',
          order_index: 1,
          workout_sets: [
            makeSet({ id: 'set-middle-2', set_index: 2 }),
            makeSet({ id: 'set-middle-0', set_index: 0 }),
          ],
        }),
      ],
    })

    const merged = mergeWorkoutRemoteWithLocal(remote, local)
    expect(merged.workout_exercises.map((exercise) => exercise.order_index)).toEqual([0, 1, 2])
    expect(
      merged.workout_exercises
        .find((exercise) => exercise.exercise_definition_id === 'def-middle')
        ?.workout_sets.map((set) => set.set_index),
    ).toEqual([0, 2])
  })

  describe('progress integrity: completed wins', () => {
    it('keeps status completed when remote is completed and local is in_progress', () => {
      const remote = makeWorkout({ status: 'completed', ended_at: '2026-02-20T11:00:00.000Z' })
      const local = makeWorkout({ status: 'in_progress', ended_at: null })
      const merged = mergeWorkoutRemoteWithLocal(remote, local)
      expect(merged.status).toBe('completed')
      expect(merged.ended_at).toBe('2026-02-20T11:00:00.000Z')
    })

    it('keeps status completed when local is completed and remote is in_progress', () => {
      const remote = makeWorkout({ status: 'in_progress', ended_at: null })
      const local = makeWorkout({ status: 'completed', ended_at: '2026-02-20T11:30:00.000Z' })
      const merged = mergeWorkoutRemoteWithLocal(remote, local)
      expect(merged.status).toBe('completed')
      expect(merged.ended_at).toBe('2026-02-20T11:30:00.000Z')
    })

    it('never nulls ended_at when remote has it and local does not', () => {
      const remote = makeWorkout({ ended_at: '2026-02-20T11:00:00.000Z' })
      const local = makeWorkout({ ended_at: null })
      const merged = mergeWorkoutRemoteWithLocal(remote, local)
      expect(merged.ended_at).toBe('2026-02-20T11:00:00.000Z')
    })

    it('never nulls ended_at when local has it and remote does not', () => {
      const remote = makeWorkout({ ended_at: null })
      const local = makeWorkout({ ended_at: '2026-02-20T11:30:00.000Z' })
      const merged = mergeWorkoutRemoteWithLocal(remote, local)
      expect(merged.ended_at).toBe('2026-02-20T11:30:00.000Z')
    })
  })
})
