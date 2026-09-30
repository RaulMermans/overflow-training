import type { ProgressWorkout } from '../src/db/progress'
import {
  buildModeAwareSetPoints,
  computeCardioModeStats,
  computeCurrentPRs,
  computeE1RM,
  computeMobilityModeStats,
  computePeriodStats,
  computeRoutineStats,
  computeStrengthModeStats,
  computeTrending,
  normalizeWorkouts,
  computeStreak,
  computeStreakAtDate,
  computeWeeklyVolume,
  computeExercisePRs,
  type ProgressSetPoint,
  type ProgressWorkoutPoint,
} from '../src/features/progress/compute'

// --- Factory helpers ---

function makeWorkout(overrides: Partial<ProgressWorkout> & { ended_at: string }): ProgressWorkout {
  return {
    id: overrides.id ?? 'w-1',
    ended_at: overrides.ended_at,
    started_at: overrides.started_at ?? overrides.ended_at,
    workout_exercises: overrides.workout_exercises ?? [],
  }
}

function makeExercise(
  defId: string,
  name: string,
  sets: { reps: number; weight: number; set_index: number }[],
) {
  return {
    id: `we-${defId}`,
    exercise_definition_id: defId,
    exercise_definitions: {
      id: defId,
      name,
      slug: name.toLowerCase().replace(/ /g, '-'),
    },
    workout_sets: sets.map((s, i) => ({
      id: `ws-${defId}-${i}`,
      reps: s.reps,
      weight: s.weight,
      set_index: s.set_index,
      created_at: null,
    })),
  }
}

/** ISO string for N days ago at noon local */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

// --- Tests ---

describe('computeE1RM', () => {
  it('computes Epley formula correctly', () => {
    // 100 * (1 + 10/30) = 100 * 1.333... = 133.3
    expect(computeE1RM(100, 10)).toBeCloseTo(133.3, 1)
  })

  it('returns weight for 1 rep', () => {
    // 80 * (1 + 1/30) = 80 * 1.0333... ≈ 82.7
    expect(computeE1RM(80, 1)).toBeCloseTo(82.7, 1)
  })

  it('returns 0 for zero weight', () => {
    expect(computeE1RM(0, 10)).toBe(0)
  })

  it('returns 0 for negative reps', () => {
    expect(computeE1RM(100, -1)).toBe(0)
  })

  it('returns 0 for NaN', () => {
    expect(computeE1RM(NaN, 10)).toBe(0)
    expect(computeE1RM(100, NaN)).toBe(0)
  })

  it('returns 0 for Infinity', () => {
    expect(computeE1RM(Infinity, 10)).toBe(0)
  })
})

describe('normalizeWorkouts', () => {
  it('sorts workout_sets by set_index', () => {
    const w = makeWorkout({
      ended_at: daysAgo(0),
      workout_exercises: [
        {
          id: 'we-1',
          exercise_definition_id: 'def-1',
          exercise_definitions: { id: 'def-1', name: 'Bench', slug: 'bench' },
          workout_sets: [
            { id: 's3', reps: 5, weight: 100, set_index: 3, created_at: null },
            { id: 's1', reps: 5, weight: 100, set_index: 1, created_at: null },
            { id: 's2', reps: 5, weight: 100, set_index: 2, created_at: null },
          ],
        },
      ],
    })

    normalizeWorkouts([w])
    const indices = w.workout_exercises[0].workout_sets.map((s) => s.set_index)
    expect(indices).toEqual([1, 2, 3])
  })

  it('sorts workout_exercises by exercise_definition_id', () => {
    const w = makeWorkout({
      ended_at: daysAgo(0),
      workout_exercises: [
        makeExercise('zzz-id', 'Zzz', [{ reps: 5, weight: 50, set_index: 1 }]),
        makeExercise('aaa-id', 'Aaa', [{ reps: 5, weight: 50, set_index: 1 }]),
      ],
    })

    normalizeWorkouts([w])
    const ids = w.workout_exercises.map((e) => e.exercise_definition_id)
    expect(ids).toEqual(['aaa-id', 'zzz-id'])
  })
})

describe('computeStreak', () => {
  it('returns 0 for empty input', () => {
    expect(computeStreak([])).toBe(0)
  })

  it('returns 1 for a single workout today', () => {
    expect(computeStreak([makeWorkout({ ended_at: daysAgo(0) })])).toBe(1)
  })

  it('returns streak for consecutive days ending today', () => {
    const workouts = [
      makeWorkout({ id: 'w1', ended_at: daysAgo(0) }),
      makeWorkout({ id: 'w2', ended_at: daysAgo(1) }),
      makeWorkout({ id: 'w3', ended_at: daysAgo(2) }),
    ]
    expect(computeStreak(workouts)).toBe(3)
  })

  it('returns streak for consecutive days ending yesterday', () => {
    const workouts = [
      makeWorkout({ id: 'w1', ended_at: daysAgo(1) }),
      makeWorkout({ id: 'w2', ended_at: daysAgo(2) }),
    ]
    expect(computeStreak(workouts)).toBe(2)
  })

  it('returns 0 if most recent workout is > 1 day ago', () => {
    const workouts = [
      makeWorkout({ id: 'w1', ended_at: daysAgo(3) }),
      makeWorkout({ id: 'w2', ended_at: daysAgo(4) }),
    ]
    expect(computeStreak(workouts)).toBe(0)
  })

  it('stops at first gap', () => {
    const workouts = [
      makeWorkout({ id: 'w1', ended_at: daysAgo(0) }),
      makeWorkout({ id: 'w2', ended_at: daysAgo(1) }),
      // gap at daysAgo(2)
      makeWorkout({ id: 'w3', ended_at: daysAgo(3) }),
    ]
    expect(computeStreak(workouts)).toBe(2)
  })

  it('deduplicates multiple workouts on the same day', () => {
    const workouts = [
      makeWorkout({ id: 'w1', ended_at: daysAgo(0) }),
      makeWorkout({ id: 'w2', ended_at: daysAgo(0) }),
      makeWorkout({ id: 'w3', ended_at: daysAgo(1) }),
    ]
    expect(computeStreak(workouts)).toBe(2)
  })

  it('matches computeStreakAtDate wrapper semantics for current date', () => {
    const workouts = [
      makeWorkout({ id: 'w1', ended_at: daysAgo(0) }),
      makeWorkout({ id: 'w2', ended_at: daysAgo(1) }),
    ]

    expect(computeStreak(workouts)).toBe(computeStreakAtDate(workouts, new Date()))
  })
})

describe('computeStreakAtDate', () => {
  const fixedNow = new Date(2031, 4, 20, 12, 0, 0, 0)

  function fixedDaysAgo(daysAgoCount: number): string {
    const date = new Date(fixedNow)
    date.setDate(date.getDate() - daysAgoCount)
    return date.toISOString()
  }

  it('returns streak for consecutive days ending on provided date', () => {
    const workouts = [
      makeWorkout({ id: 'w1', ended_at: fixedDaysAgo(0) }),
      makeWorkout({ id: 'w2', ended_at: fixedDaysAgo(1) }),
      makeWorkout({ id: 'w3', ended_at: fixedDaysAgo(2) }),
    ]

    expect(computeStreakAtDate(workouts, fixedNow)).toBe(3)
  })

  it('returns streak for consecutive days ending yesterday of provided date', () => {
    const workouts = [
      makeWorkout({ id: 'w1', ended_at: fixedDaysAgo(1) }),
      makeWorkout({ id: 'w2', ended_at: fixedDaysAgo(2) }),
    ]

    expect(computeStreakAtDate(workouts, fixedNow)).toBe(2)
  })

  it('returns 0 when most recent workout is not today or yesterday for provided date', () => {
    const workouts = [
      makeWorkout({ id: 'w1', ended_at: fixedDaysAgo(3) }),
      makeWorkout({ id: 'w2', ended_at: fixedDaysAgo(4) }),
    ]

    expect(computeStreakAtDate(workouts, fixedNow)).toBe(0)
  })
})

describe('computeWeeklyVolume', () => {
  it('returns 7 entries for empty input', () => {
    const result = computeWeeklyVolume([])
    expect(result.byDay).toHaveLength(7)
    expect(result.total).toBe(0)
    expect(result.byDay.every((d) => d.volume === 0)).toBe(true)
  })

  it('sums weight * reps correctly', () => {
    const w = makeWorkout({
      ended_at: daysAgo(0),
      workout_exercises: [
        makeExercise('def-1', 'Bench', [
          { reps: 10, weight: 100, set_index: 1 }, // 1000
          { reps: 8, weight: 80, set_index: 2 }, // 640
        ]),
      ],
    })
    const result = computeWeeklyVolume([w])
    expect(result.total).toBe(1640)
    // Today is the last entry (index 6)
    expect(result.byDay[6].volume).toBe(1640)
  })

  it('distributes volume across correct days', () => {
    const workouts = [
      makeWorkout({
        id: 'w1',
        ended_at: daysAgo(0),
        workout_exercises: [
          makeExercise('def-1', 'Bench', [{ reps: 10, weight: 100, set_index: 1 }]),
        ],
      }),
      makeWorkout({
        id: 'w2',
        ended_at: daysAgo(3),
        workout_exercises: [
          makeExercise('def-1', 'Bench', [{ reps: 5, weight: 50, set_index: 1 }]),
        ],
      }),
    ]
    const result = computeWeeklyVolume(workouts)
    expect(result.byDay[6].volume).toBe(1000) // today
    expect(result.byDay[3].volume).toBe(250) // 3 days ago
    expect(result.total).toBe(1250)
  })

  it('always returns exactly 7 entries with labels', () => {
    const result = computeWeeklyVolume([makeWorkout({ ended_at: daysAgo(0) })])
    expect(result.byDay).toHaveLength(7)
    result.byDay.forEach((d) => {
      expect(typeof d.label).toBe('string')
      expect(d.label.length).toBeGreaterThan(0)
    })
  })
})

describe('computeExercisePRs', () => {
  it('returns empty array for empty input', () => {
    expect(computeExercisePRs([])).toEqual([])
  })

  it('finds best e1RM per exercise', () => {
    const w = makeWorkout({
      ended_at: daysAgo(0),
      workout_exercises: [
        makeExercise('def-1', 'Bench Press', [
          { reps: 10, weight: 100, set_index: 1 }, // e1RM ≈ 133.3
          { reps: 5, weight: 120, set_index: 2 }, // e1RM = 140
        ]),
      ],
    })
    const prs = computeExercisePRs([w])
    expect(prs).toHaveLength(1)
    expect(prs[0].exerciseName).toBe('Bench Press')
    expect(prs[0].weight).toBe(120)
    expect(prs[0].reps).toBe(5)
    expect(prs[0].e1rm).toBe(140)
  })

  it('groups by exercise_definition_id not name', () => {
    const w = makeWorkout({
      ended_at: daysAgo(0),
      workout_exercises: [
        makeExercise('def-1', 'Bench Press', [{ reps: 10, weight: 100, set_index: 1 }]),
        makeExercise('def-2', 'Squat', [{ reps: 10, weight: 120, set_index: 1 }]),
      ],
    })
    const prs = computeExercisePRs([w])
    expect(prs).toHaveLength(2)
    expect(prs[0].exerciseId).toBe('def-2') // squat has higher e1RM
    expect(prs[1].exerciseId).toBe('def-1')
  })

  it('sorts by e1RM descending', () => {
    const w = makeWorkout({
      ended_at: daysAgo(0),
      workout_exercises: [
        makeExercise('def-1', 'Bench', [{ reps: 5, weight: 60, set_index: 1 }]),
        makeExercise('def-2', 'Squat', [{ reps: 5, weight: 140, set_index: 1 }]),
        makeExercise('def-3', 'OHP', [{ reps: 5, weight: 50, set_index: 1 }]),
      ],
    })
    const prs = computeExercisePRs([w])
    const e1rms = prs.map((p) => p.e1rm)
    expect(e1rms).toEqual([...e1rms].sort((a, b) => b - a))
  })

  it('skips exercises with null exercise_definitions', () => {
    const w: ProgressWorkout = {
      id: 'w-1',
      ended_at: daysAgo(0),
      started_at: daysAgo(0),
      workout_exercises: [
        {
          id: 'we-1',
          exercise_definition_id: 'def-1',
          exercise_definitions: null,
          workout_sets: [
            {
              id: 's-1',
              reps: 10,
              weight: 100,
              set_index: 1,
              created_at: null,
            },
          ],
        },
      ],
    }
    expect(computeExercisePRs([w])).toEqual([])
  })

  it('picks best PR across multiple workouts', () => {
    const workouts = [
      makeWorkout({
        id: 'w1',
        ended_at: daysAgo(5),
        workout_exercises: [
          makeExercise('def-1', 'Bench', [{ reps: 10, weight: 80, set_index: 1 }]),
        ],
      }),
      makeWorkout({
        id: 'w2',
        ended_at: daysAgo(0),
        workout_exercises: [
          makeExercise('def-1', 'Bench', [{ reps: 5, weight: 120, set_index: 1 }]),
        ],
      }),
    ]
    const prs = computeExercisePRs(workouts)
    expect(prs).toHaveLength(1)
    // 120 * (1 + 5/30) = 140 > 80 * (1 + 10/30) = 106.7
    expect(prs[0].weight).toBe(120)
    expect(prs[0].e1rm).toBe(140)
  })
})

describe('computePeriodStats', () => {
  const workouts: ProgressWorkoutPoint[] = [
    { id: 'w1', performedAt: '2026-02-01T12:00:00.000Z' },
    { id: 'w2', performedAt: '2026-02-08T12:00:00.000Z' },
    { id: 'w3', performedAt: '2026-02-15T12:00:00.000Z' },
  ]

  const sets: ProgressSetPoint[] = [
    {
      workoutId: 'w1',
      exerciseDefinitionId: 'bench',
      exerciseName: 'Bench Press',
      reps: 5,
      weight: 100,
      performedAt: '2026-02-01T12:00:00.000Z',
    },
    {
      workoutId: 'w2',
      exerciseDefinitionId: 'bench',
      exerciseName: 'Bench Press',
      reps: 5,
      weight: 105,
      performedAt: '2026-02-08T12:00:00.000Z',
    },
    {
      workoutId: 'w3',
      exerciseDefinitionId: 'bench',
      exerciseName: 'Bench Press',
      reps: 5,
      weight: 110,
      performedAt: '2026-02-15T12:00:00.000Z',
    },
  ]

  it('computes sessions, volume, prsHit, and weeksActive', () => {
    const result = computePeriodStats(
      workouts,
      sets,
      '2026-02-01T00:00:00.000Z',
      '2026-02-15T23:59:59.999Z',
    )

    expect(result.sessions).toBe(3)
    expect(result.volume).toBe(1575)
    expect(result.prsHit).toBe(3)
    expect(result.weeksActive).toBe(3)
  })
})

describe('computeCurrentPRs', () => {
  it('returns deterministic best PR per exercise', () => {
    const sets: ProgressSetPoint[] = [
      {
        workoutId: 'w1',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        reps: 8,
        weight: 100,
        performedAt: '2026-02-01T12:00:00.000Z',
      },
      {
        workoutId: 'w2',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        reps: 5,
        weight: 120,
        performedAt: '2026-02-10T12:00:00.000Z',
      },
      {
        workoutId: 'w3',
        exerciseDefinitionId: 'squat',
        exerciseName: 'Squat',
        reps: 5,
        weight: 140,
        performedAt: '2026-02-12T12:00:00.000Z',
      },
    ]

    const prs = computeCurrentPRs(sets)
    expect(prs).toHaveLength(2)
    expect(prs[0].exerciseDefinitionId).toBe('squat')
    expect(prs[1].exerciseDefinitionId).toBe('bench')
    expect(prs[1].weight).toBe(120)
  })

  it('breaks exact ties deterministically', () => {
    const sets: ProgressSetPoint[] = [
      {
        workoutId: 'w-a',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        reps: 5,
        weight: 120,
        performedAt: '2026-02-10T12:00:00.000Z',
      },
      {
        workoutId: 'w-b',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        reps: 6,
        weight: 115,
        performedAt: '2026-02-10T12:00:00.000Z',
      },
      {
        workoutId: 'w-c',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        reps: 5,
        weight: 120,
        performedAt: '2026-02-10T12:00:00.000Z',
      },
    ]

    const prs = computeCurrentPRs(sets)
    expect(prs).toHaveLength(1)
    expect(prs[0].exerciseDefinitionId).toBe('bench')
    expect(prs[0].weight).toBe(120)
    expect(prs[0].reps).toBe(5)
    expect(prs[0].workoutId).toBe('w-c')
  })
})

describe('computeTrending', () => {
  it('computes deterministic trending order', () => {
    const sets: ProgressSetPoint[] = [
      {
        workoutId: 'w1',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        reps: 6,
        weight: 90,
        performedAt: '2026-01-01T12:00:00.000Z',
      },
      {
        workoutId: 'w2',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        reps: 6,
        weight: 100,
        performedAt: '2026-01-20T12:00:00.000Z',
      },
      {
        workoutId: 'w1',
        exerciseDefinitionId: 'squat',
        exerciseName: 'Squat',
        reps: 5,
        weight: 100,
        performedAt: '2026-01-01T12:00:00.000Z',
      },
      {
        workoutId: 'w2',
        exerciseDefinitionId: 'squat',
        exerciseName: 'Squat',
        reps: 5,
        weight: 110,
        performedAt: '2026-01-20T12:00:00.000Z',
      },
    ]

    const trending = computeTrending(sets, 30)
    expect(trending).toHaveLength(2)
    expect(trending[0].exerciseDefinitionId).toBe('bench')
    expect(trending[1].exerciseDefinitionId).toBe('squat')
    expect(trending[0].deltaPercent).toBeGreaterThan(0)
  })

  it('uses stable ordering when deltas and names tie', () => {
    const sets: ProgressSetPoint[] = [
      {
        workoutId: 'w1',
        exerciseDefinitionId: 'a-def',
        exerciseName: 'Row',
        reps: 5,
        weight: 100,
        performedAt: '2026-01-01T12:00:00.000Z',
      },
      {
        workoutId: 'w2',
        exerciseDefinitionId: 'a-def',
        exerciseName: 'Row',
        reps: 5,
        weight: 110,
        performedAt: '2026-01-20T12:00:00.000Z',
      },
      {
        workoutId: 'w1',
        exerciseDefinitionId: 'b-def',
        exerciseName: 'Row',
        reps: 5,
        weight: 100,
        performedAt: '2026-01-01T12:00:00.000Z',
      },
      {
        workoutId: 'w2',
        exerciseDefinitionId: 'b-def',
        exerciseName: 'Row',
        reps: 5,
        weight: 110,
        performedAt: '2026-01-20T12:00:00.000Z',
      },
    ]

    const trending = computeTrending(sets, 30)
    expect(trending).toHaveLength(2)
    expect(trending[0].exerciseDefinitionId).toBe('a-def')
    expect(trending[1].exerciseDefinitionId).toBe('b-def')
  })
})

describe('computeRoutineStats', () => {
  it('computes routine-attributed summary', () => {
    const workouts: ProgressWorkoutPoint[] = [
      {
        id: 'w1',
        performedAt: '2026-02-01T12:00:00.000Z',
        routineId: 'routine-a',
      },
      {
        id: 'w2',
        performedAt: '2026-02-08T12:00:00.000Z',
        routineId: 'routine-a',
      },
      {
        id: 'w3',
        performedAt: '2026-02-10T12:00:00.000Z',
        routineId: 'routine-b',
      },
    ]

    const sets: ProgressSetPoint[] = [
      {
        workoutId: 'w1',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        reps: 5,
        weight: 100,
        performedAt: '2026-02-01T12:00:00.000Z',
      },
      {
        workoutId: 'w2',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        reps: 5,
        weight: 110,
        performedAt: '2026-02-08T12:00:00.000Z',
      },
      {
        workoutId: 'w3',
        exerciseDefinitionId: 'squat',
        exerciseName: 'Squat',
        reps: 5,
        weight: 150,
        performedAt: '2026-02-10T12:00:00.000Z',
      },
    ]

    const stats = computeRoutineStats('routine-a', workouts, sets)
    expect(stats.sessions).toBe(2)
    expect(stats.volume).toBe(1050)
    expect(stats.prsHit).toBe(2)
    expect(stats.keyLifts[0].exerciseDefinitionId).toBe('bench')
    expect(stats.keyLifts[0].best.weight).toBe(110)
  })

  it('returns only period-attributed values when period-limited inputs are provided', () => {
    const workouts: ProgressWorkoutPoint[] = [
      {
        id: 'w1',
        performedAt: '2026-01-01T12:00:00.000Z',
        routineId: 'routine-a',
      },
      {
        id: 'w2',
        performedAt: '2026-02-01T12:00:00.000Z',
        routineId: 'routine-a',
      },
    ]

    const sets: ProgressSetPoint[] = [
      {
        workoutId: 'w1',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        reps: 5,
        weight: 100,
        performedAt: '2026-01-01T12:00:00.000Z',
      },
      {
        workoutId: 'w2',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        reps: 5,
        weight: 110,
        performedAt: '2026-02-01T12:00:00.000Z',
      },
    ]

    const januaryOnly = computeRoutineStats('routine-a', [workouts[0]], [sets[0]])
    expect(januaryOnly.sessions).toBe(1)
    expect(januaryOnly.volume).toBe(500)
    expect(januaryOnly.prsHit).toBe(1)

    const februaryOnly = computeRoutineStats('routine-a', [workouts[1]], [sets[1]])
    expect(februaryOnly.sessions).toBe(1)
    expect(februaryOnly.volume).toBe(550)
    expect(februaryOnly.prsHit).toBe(1)
  })
})

describe('mode-aware progress stats', () => {
  it('builds set points including tracking fields', () => {
    const workouts: ProgressWorkout[] = [
      makeWorkout({
        id: 'w-mode-1',
        ended_at: '2026-02-10T12:00:00.000Z',
        workout_exercises: [
          {
            id: 'we-cardio',
            exercise_definition_id: 'run',
            exercise_definitions: {
              id: 'run',
              name: 'Jogging',
              slug: 'jogging',
              category: 'cardio',
              tracking_mode: 'distance_time',
            },
            workout_sets: [
              {
                id: 'set-cardio',
                reps: null,
                weight: null,
                set_index: 0,
                duration_seconds: 720,
                distance_m: 2000,
                created_at: '2026-02-10T12:00:00.000Z',
              },
            ],
          },
        ],
      }),
    ]

    const points = buildModeAwareSetPoints(workouts)
    expect(points).toHaveLength(1)
    expect(points[0].trackingMode).toBe('distance_time')
    expect(points[0].category).toBe('cardio')
    expect(points[0].distanceM).toBe(2000)
  })

  it('computes strength summary with nullable-safe volume', () => {
    const sets = [
      {
        workoutId: 'w1',
        exerciseDefinitionId: 'bench',
        exerciseName: 'Bench Press',
        category: 'strength',
        trackingMode: 'weight_reps',
        reps: 5,
        weightKg: 100,
        durationSeconds: null,
        distanceM: null,
        performedAt: '2026-02-01T12:00:00.000Z',
      },
      {
        workoutId: 'w2',
        exerciseDefinitionId: 'pullup',
        exerciseName: 'Pull Up',
        category: 'strength',
        trackingMode: 'reps_only',
        reps: 10,
        weightKg: null,
        durationSeconds: null,
        distanceM: null,
        performedAt: '2026-02-08T12:00:00.000Z',
      },
    ] as const

    const stats = computeStrengthModeStats(
      [...sets],
      '2026-02-01T00:00:00.000Z',
      '2026-02-15T23:59:59.999Z',
      3,
    )

    expect(stats.sessions).toBe(2)
    expect(stats.totalVolumeKg).toBe(500)
    expect(stats.weeklyGoal).toBe(3)
  })

  it('computes cardio distance and pace summaries', () => {
    const stats = computeCardioModeStats(
      [
        {
          workoutId: 'w1',
          exerciseDefinitionId: 'run',
          exerciseName: 'Jogging',
          category: 'cardio',
          trackingMode: 'distance_time',
          reps: null,
          weightKg: null,
          durationSeconds: 720,
          distanceM: 2000,
          performedAt: '2026-02-10T12:00:00.000Z',
        },
      ],
      '2026-02-01T00:00:00.000Z',
      '2026-02-28T23:59:59.999Z',
    )

    expect(stats.sessions).toBe(1)
    expect(stats.totalDistanceM).toBe(2000)
    expect(stats.avgPaceSecondsPerKm).toBe(360)
    expect(stats.bestRecent).toHaveLength(1)
  })

  it('computes mobility minutes and consistency', () => {
    const stats = computeMobilityModeStats(
      [
        {
          workoutId: 'w1',
          exerciseDefinitionId: 'stretch',
          exerciseName: 'Hamstring Stretch',
          category: 'stretch',
          trackingMode: 'time',
          reps: null,
          weightKg: null,
          durationSeconds: 45,
          distanceM: null,
          performedAt: '2026-02-10T12:00:00.000Z',
        },
        {
          workoutId: 'w2',
          exerciseDefinitionId: 'yoga-flow',
          exerciseName: 'Yoga Flow',
          category: 'yoga',
          trackingMode: 'time',
          reps: null,
          weightKg: null,
          durationSeconds: 900,
          distanceM: null,
          performedAt: '2026-02-11T12:00:00.000Z',
        },
      ],
      '2026-02-01T00:00:00.000Z',
      '2026-02-28T23:59:59.999Z',
    )

    expect(stats.sessions).toBe(2)
    expect(stats.daysPracticed).toBe(2)
    expect(stats.totalMinutes).toBeGreaterThan(15)
    expect(stats.recentSessions).toHaveLength(2)
  })
})
