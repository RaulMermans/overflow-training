import type {
  ExerciseE1RMWeeklyRowDTO,
  ProgressOverviewModel,
  WeeklyMuscleBalanceRowDTO,
  WeeklyWorkoutsRowDTO,
} from '../src/features/analytics/analyticsTypes'
import { buildProgressDashboardModel } from '../src/features/progress-v2/progressModel'

const NOW = new Date('2026-03-21T12:00:00.000Z')

function makeOverview(overrides: Partial<ProgressOverviewModel> = {}): ProgressOverviewModel {
  return {
    rangeDays: 28,
    workouts: 16,
    workoutsPerWeek: 4,
    minutesTrained: 220,
    strengthVolumeKg: 12000,
    avgEffort: null,
    prsCount: 2,
    isEmpty: false,
    ...overrides,
  }
}

function makeWorkoutRows(rows: Array<{ week: string; count: number }>): WeeklyWorkoutsRowDTO[] {
  return rows.map((row) => ({
    user_id: 'user-1',
    week_start: row.week,
    workouts_completed: row.count,
  }))
}

function makeStrengthRows(
  rows: Array<{ week: string; value: number }>,
): ExerciseE1RMWeeklyRowDTO[] {
  return rows.map((row) => ({
    user_id: 'user-1',
    exercise_definition_id: 'bench',
    week_start: row.week,
    best_e1rm: row.value,
  }))
}

function makeMuscleRows(
  rows: Array<{ week: string; muscle: string; volume: number }>,
): WeeklyMuscleBalanceRowDTO[] {
  return rows.map((row) => ({
    user_id: 'user-1',
    week_start: row.week,
    muscle_key: row.muscle,
    volume_kg: row.volume,
    sets_count: 4,
  }))
}

describe('buildProgressDashboardModel', () => {
  it('builds an on-track hero when workouts per week meet the goal', () => {
    const model = buildProgressDashboardModel({
      range: '4W',
      weeklyGoal: 4,
      overview: makeOverview(),
      workoutRows: makeWorkoutRows([
        { week: '2026-01-26', count: 2 },
        { week: '2026-02-02', count: 1 },
        { week: '2026-02-09', count: 2 },
        { week: '2026-02-16', count: 1 },
        { week: '2026-02-23', count: 4 },
        { week: '2026-03-02', count: 4 },
        { week: '2026-03-09', count: 4 },
        { week: '2026-03-16', count: 4 },
      ]),
      strengthRows: [],
      muscleRows: [],
      now: NOW,
    })

    expect(model.hero.status).toBe('onTrack')
    expect(model.hero.summaryKey).toBe('progress.v2.hero.summary.onTrackRising')
    expect(model.consistency.goalHitWeeks).toBe(4)
  })

  it('falls back to building when activity improves but is still below goal', () => {
    const model = buildProgressDashboardModel({
      range: '4W',
      weeklyGoal: 4,
      overview: makeOverview({ workoutsPerWeek: 3, workouts: 12, prsCount: 0 }),
      workoutRows: makeWorkoutRows([
        { week: '2026-01-26', count: 1 },
        { week: '2026-02-02', count: 1 },
        { week: '2026-02-09', count: 1 },
        { week: '2026-02-16', count: 1 },
        { week: '2026-02-23', count: 3 },
        { week: '2026-03-02', count: 3 },
        { week: '2026-03-09', count: 3 },
        { week: '2026-03-16', count: 3 },
      ]),
      strengthRows: [],
      muscleRows: [],
      now: NOW,
    })

    expect(model.hero.status).toBe('building')
    expect(model.hero.summaryKey).toBe('progress.v2.hero.summary.building')
    expect(model.consistency.takeawayKey).toBe('progress.v2.consistency.takeaway.activeStreak')
  })

  it('returns empty models for sparse data', () => {
    const model = buildProgressDashboardModel({
      range: '4W',
      weeklyGoal: 4,
      overview: makeOverview({
        workouts: 0,
        workoutsPerWeek: 0,
        minutesTrained: 0,
        strengthVolumeKg: 0,
        prsCount: 0,
        isEmpty: true,
      }),
      workoutRows: [],
      strengthRows: [],
      muscleRows: [],
      now: NOW,
    })

    expect(model.hero.isEmpty).toBe(true)
    expect(model.consistency.isEmpty).toBe(true)
    expect(model.strength.isEmpty).toBe(true)
    expect(model.body.isEmpty).toBe(true)
    expect(model.coaching.bodyKey).toBe('progress.v2.coaching.empty')
  })

  it('computes lift comparison and PR markers from the current period', () => {
    const model = buildProgressDashboardModel({
      range: '4W',
      weeklyGoal: 4,
      overview: makeOverview(),
      workoutRows: makeWorkoutRows([
        { week: '2026-02-23', count: 4 },
        { week: '2026-03-02', count: 4 },
        { week: '2026-03-09', count: 4 },
        { week: '2026-03-16', count: 4 },
      ]),
      strengthRows: makeStrengthRows([
        { week: '2026-01-26', value: 95 },
        { week: '2026-02-02', value: 96 },
        { week: '2026-02-23', value: 100 },
        { week: '2026-03-02', value: 102 },
        { week: '2026-03-09', value: 104 },
        { week: '2026-03-16', value: 108 },
      ]),
      muscleRows: [],
      selectedExerciseName: 'Bench press',
      now: NOW,
    })

    expect(model.strength.isEmpty).toBe(false)
    expect(model.strength.currentBestKg).toBe(108)
    expect(model.strength.previousBestKg).toBe(96)
    expect(model.strength.prCount).toBe(4)
    expect(model.strength.takeawayKey).toBe('progress.v2.strength.takeaway.up')
  })

  it('flags lower-body drift in the body lens and coaching note', () => {
    const model = buildProgressDashboardModel({
      range: '4W',
      weeklyGoal: 4,
      overview: makeOverview(),
      workoutRows: makeWorkoutRows([
        { week: '2026-02-23', count: 4 },
        { week: '2026-03-02', count: 4 },
        { week: '2026-03-09', count: 4 },
        { week: '2026-03-16', count: 4 },
      ]),
      strengthRows: [],
      muscleRows: makeMuscleRows([
        { week: '2026-01-26', muscle: 'quads', volume: 250 },
        { week: '2026-01-26', muscle: 'hamstrings', volume: 200 },
        { week: '2026-01-26', muscle: 'chest', volume: 180 },
        { week: '2026-01-26', muscle: 'back', volume: 180 },
        { week: '2026-02-23', muscle: 'quads', volume: 80 },
        { week: '2026-02-23', muscle: 'hamstrings', volume: 60 },
        { week: '2026-02-23', muscle: 'chest', volume: 220 },
        { week: '2026-02-23', muscle: 'back', volume: 220 },
        { week: '2026-03-02', muscle: 'quads', volume: 80 },
        { week: '2026-03-02', muscle: 'hamstrings', volume: 60 },
        { week: '2026-03-02', muscle: 'chest', volume: 220 },
        { week: '2026-03-02', muscle: 'back', volume: 220 },
      ]),
      now: NOW,
    })

    expect(model.body.isEmpty).toBe(false)
    expect(model.body.takeawayKey).toBe('progress.v2.body.takeaway.trailing')
    expect(model.coaching.bodyKey).toBe('progress.v2.coaching.lowerBody')
  })

  it('uses the selected range to size the current trend window', () => {
    const baseRows = makeWorkoutRows([
      { week: '2025-10-20', count: 2 },
      { week: '2025-12-01', count: 2 },
      { week: '2026-01-26', count: 2 },
      { week: '2026-02-02', count: 2 },
      { week: '2026-02-09', count: 2 },
      { week: '2026-02-16', count: 2 },
      { week: '2026-02-23', count: 2 },
      { week: '2026-03-02', count: 2 },
      { week: '2026-03-09', count: 2 },
      { week: '2026-03-16', count: 2 },
    ])

    const shortRange = buildProgressDashboardModel({
      range: '4W',
      weeklyGoal: 4,
      overview: makeOverview({ workoutsPerWeek: 2, workouts: 8 }),
      workoutRows: baseRows,
      strengthRows: [],
      muscleRows: [],
      now: NOW,
    })
    const longRange = buildProgressDashboardModel({
      range: '3M',
      weeklyGoal: 4,
      overview: makeOverview({ workoutsPerWeek: 2, workouts: 24, rangeDays: 84 }),
      workoutRows: baseRows,
      strengthRows: [],
      muscleRows: [],
      now: NOW,
    })

    expect(shortRange.hero.trendSeries).toHaveLength(4)
    expect(longRange.hero.trendSeries).toHaveLength(12)
  })
})
