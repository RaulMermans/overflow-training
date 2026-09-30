import {
  buildWorkoutShareData,
  buildWorkoutShareFallbackText,
} from '../src/features/share/buildWorkoutShareData'

describe('workout share data shaping', () => {
  it('computes duration, volume, and top lifts in rank order', () => {
    const data = buildWorkoutShareData({
      workoutId: 'w-1',
      title: 'Workout summary',
      performedAt: '2026-02-17T10:00:00.000Z',
      performedDateLabel: 'Feb 17, 2026',
      startedAt: '2026-02-17T10:00:00.000Z',
      endedAt: '2026-02-17T11:01:00.000Z',
      units: 'lb',
      exercises: [
        {
          exerciseDefinitionId: 'bench',
          exerciseName: 'Bench Press',
          sets: [{ reps: 10, weight: 100 }],
        },
        {
          exerciseDefinitionId: 'squat',
          exerciseName: 'Back Squat',
          sets: [{ reps: 5, weight: 200 }],
        },
      ],
    })

    expect(data.durationSeconds).toBe(3660)
    expect(data.totalVolume).toBe(2000)
    expect(data.topLifts).toHaveLength(2)
    expect(data.topLifts[0]?.exerciseName).toBe('Back Squat')
    expect(data.topLifts[1]?.exerciseName).toBe('Bench Press')
  })

  it('marks PR badges only when previous best exists and is exceeded', () => {
    const data = buildWorkoutShareData({
      workoutId: 'w-2',
      title: 'Workout summary',
      performedAt: '2026-02-17T10:00:00.000Z',
      performedDateLabel: 'Feb 17, 2026',
      durationSeconds: 1200,
      units: 'kg',
      exercises: [
        {
          exerciseDefinitionId: 'deadlift',
          exerciseName: 'Deadlift',
          previousBestE1rmKg: 110,
          sets: [{ reps: 5, weight: 100, weightKg: 100, isWeightCanonical: true }],
        },
        {
          exerciseDefinitionId: 'row',
          exerciseName: 'Row',
          previousBestE1rmKg: 90,
          sets: [{ reps: 8, weight: 70, weightKg: 70, isWeightCanonical: true }],
        },
        {
          exerciseDefinitionId: 'ohp',
          exerciseName: 'Overhead Press',
          sets: [{ reps: 8, weight: 55, weightKg: 55, isWeightCanonical: true }],
        },
      ],
    })

    const deadliftLift = data.topLifts.find((lift) => lift.exerciseDefinitionId === 'deadlift')
    const rowLift = data.topLifts.find((lift) => lift.exerciseDefinitionId === 'row')
    const ohpLift = data.topLifts.find((lift) => lift.exerciseDefinitionId === 'ohp')

    expect(deadliftLift?.isPR).toBe(true)
    expect(rowLift?.isPR).toBe(false)
    expect(ohpLift?.isPR).toBe(false)
  })

  it('builds fallback text and handles empty top lifts', () => {
    const data = buildWorkoutShareData({
      workoutId: 'w-3',
      title: 'Workout summary',
      performedAt: '2026-02-17T10:00:00.000Z',
      performedDateLabel: 'Feb 17, 2026',
      durationSeconds: 600,
      units: 'kg',
      exercises: [],
    })

    const text = buildWorkoutShareFallbackText(data, {
      durationLabel: 'Duration',
      volumeLabel: 'Volume',
      streakLabel: 'Streak',
      topLiftsLabel: 'Top lifts',
      prBadge: 'PR',
      noTopLiftsLabel: 'No top lifts yet',
    })

    expect(text).toContain('Workout summary')
    expect(text).toContain('Duration: 10m')
    expect(text).toContain('Volume: 0 kg')
    expect(text).toContain('Top lifts:')
    expect(text).toContain('- No top lifts yet')
  })
})
