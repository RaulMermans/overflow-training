import { computeMostImprovedExercises } from '../src/features/progress/insights'
import type { ModeAwareSetPoint } from '../src/features/progress/compute'

function point(overrides: Partial<ModeAwareSetPoint>): ModeAwareSetPoint {
  return {
    workoutId: overrides.workoutId ?? 'w-1',
    exerciseDefinitionId: overrides.exerciseDefinitionId ?? 'ex-1',
    exerciseName: overrides.exerciseName ?? 'Exercise',
    category: overrides.category ?? 'strength',
    trackingMode: overrides.trackingMode ?? 'weight_reps',
    reps: overrides.reps ?? 5,
    weightKg: overrides.weightKg ?? 100,
    durationSeconds: overrides.durationSeconds ?? null,
    distanceM: overrides.distanceM ?? null,
    performedAt: overrides.performedAt ?? '2026-01-01T12:00:00.000Z',
  }
}

describe('computeMostImprovedExercises', () => {
  const fromISO = '2026-01-01T00:00:00.000Z'
  const toISO = '2026-03-01T00:00:00.000Z'

  it('returns top improved strength exercises', () => {
    const sets: ModeAwareSetPoint[] = [
      point({
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        performedAt: '2026-01-05T12:00:00.000Z',
        reps: 5,
        weightKg: 80,
      }),
      point({
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        performedAt: '2026-02-10T12:00:00.000Z',
        reps: 5,
        weightKg: 100,
      }),
      point({
        exerciseDefinitionId: 'squat',
        exerciseName: 'Back Squat',
        performedAt: '2026-01-10T12:00:00.000Z',
        reps: 5,
        weightKg: 100,
      }),
      point({
        exerciseDefinitionId: 'squat',
        exerciseName: 'Back Squat',
        performedAt: '2026-02-15T12:00:00.000Z',
        reps: 5,
        weightKg: 105,
      }),
    ]

    const result = computeMostImprovedExercises(sets, fromISO, toISO, 3)

    expect(result).toHaveLength(2)
    expect(result[0]?.exerciseDefinitionId).toBe('bench')
    expect(result[1]?.exerciseDefinitionId).toBe('squat')
    expect(result[0]?.deltaPercent).toBeGreaterThan(result[1]?.deltaPercent ?? 0)
  })

  it('supports reps_only and skips unsupported tracking modes', () => {
    const sets: ModeAwareSetPoint[] = [
      point({
        exerciseDefinitionId: 'pullup',
        exerciseName: 'Pull Up',
        trackingMode: 'reps_only',
        weightKg: null,
        performedAt: '2026-01-03T12:00:00.000Z',
        reps: 6,
      }),
      point({
        exerciseDefinitionId: 'pullup',
        exerciseName: 'Pull Up',
        trackingMode: 'reps_only',
        weightKg: null,
        performedAt: '2026-02-12T12:00:00.000Z',
        reps: 10,
      }),
      point({
        exerciseDefinitionId: 'run',
        exerciseName: 'Run',
        trackingMode: 'distance_time',
        performedAt: '2026-02-12T12:00:00.000Z',
        reps: null,
        weightKg: null,
        durationSeconds: 1200,
        distanceM: 3000,
      }),
    ]

    const result = computeMostImprovedExercises(sets, fromISO, toISO, 3)

    expect(result).toHaveLength(1)
    expect(result[0]?.exerciseDefinitionId).toBe('pullup')
    expect(result[0]?.trackingMode).toBe('reps_only')
  })

  it('requires data in both halves of the period', () => {
    const sets: ModeAwareSetPoint[] = [
      point({
        exerciseDefinitionId: 'deadlift',
        exerciseName: 'Deadlift',
        performedAt: '2026-02-18T12:00:00.000Z',
        reps: 5,
        weightKg: 140,
      }),
      point({
        exerciseDefinitionId: 'deadlift',
        exerciseName: 'Deadlift',
        performedAt: '2026-02-20T12:00:00.000Z',
        reps: 5,
        weightKg: 150,
      }),
    ]

    expect(computeMostImprovedExercises(sets, fromISO, toISO, 3)).toEqual([])
  })
})
