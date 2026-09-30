// Unit tests for analytics service pure functions
// Run with: npm test -- analyticsService

import {
  computeDelta,
  deriveLoadState,
  normalizeWeekSeries,
  normalizeWeekSeriesNullable,
  shapeMuscleBalance,
  shapeProgressOverview,
  shapeWeeklyWorkouts,
} from '../analyticsService'
import type {
  ProgressOverviewDTO,
  WeeklyMuscleBalanceRowDTO,
  WeeklyWorkoutsRowDTO,
} from '../analyticsTypes'

// ──────────────────────────────────────────────────────────────
// computeDelta
// ──────────────────────────────────────────────────────────────

describe('computeDelta', () => {
  it('returns neutral when both are 0', () => {
    const d = computeDelta(0, 0)
    expect(d.label).toBe('—')
    expect(d.tone).toBe('neutral')
    expect(d.pct).toBeNull()
    expect(d.abs).toBe(0)
  })

  it('returns New when prev is 0 and curr > 0', () => {
    const d = computeDelta(100, 0)
    expect(d.label).toBe('New')
    expect(d.tone).toBe('up')
    expect(d.pct).toBeNull()
    expect(d.abs).toBe(100)
  })

  it('returns New with down tone when prev is 0 and curr < 0', () => {
    const d = computeDelta(-5, 0)
    expect(d.label).toBe('New')
    expect(d.tone).toBe('down')
  })

  it('calculates +100% correctly', () => {
    const d = computeDelta(200, 100)
    expect(d.pct).toBeCloseTo(100)
    expect(d.label).toBe('+100%')
    expect(d.tone).toBe('up')
    expect(d.abs).toBe(100)
  })

  it('calculates -50% correctly', () => {
    const d = computeDelta(50, 100)
    expect(d.pct).toBeCloseTo(-50)
    expect(d.label).toBe('-50%')
    expect(d.tone).toBe('down')
    expect(d.abs).toBe(-50)
  })

  it('returns neutral tone when pct is exactly 0', () => {
    const d = computeDelta(100, 100)
    expect(d.pct).toBe(0)
    expect(d.tone).toBe('neutral')
    expect(d.label).toBe('+0%')
  })

  it('rounds pct to integer', () => {
    const d = computeDelta(10, 3) // 233.33...%
    expect(d.label).toBe('+233%')
  })

  it('handles negative prev correctly', () => {
    // prev = -100, curr = -50: abs=50, pct = 50 / 100 * 100 = 50% (up)
    const d = computeDelta(-50, -100)
    expect(d.abs).toBe(50)
    expect(d.pct).toBeCloseTo(50)
    expect(d.tone).toBe('up')
  })
})

// ──────────────────────────────────────────────────────────────
// normalizeWeekSeries
// ──────────────────────────────────────────────────────────────

describe('normalizeWeekSeries', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeWeekSeries([])).toEqual([])
  })

  it('returns a single point unchanged', () => {
    const result = normalizeWeekSeries([{ weekStart: '2024-01-01', value: 5 }])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ weekStart: '2024-01-01', value: 5, isFilled: false })
  })

  it('fills missing weeks between first and last', () => {
    const rows = [
      { weekStart: '2024-01-01', value: 3 },
      { weekStart: '2024-01-15', value: 5 }, // skip 2024-01-08
    ]
    const result = normalizeWeekSeries(rows)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ weekStart: '2024-01-01', value: 3, isFilled: false })
    expect(result[1]).toEqual({ weekStart: '2024-01-08', value: 0, isFilled: true })
    expect(result[2]).toEqual({ weekStart: '2024-01-15', value: 5, isFilled: false })
  })

  it('handles contiguous weeks without filling', () => {
    const rows = [
      { weekStart: '2024-01-01', value: 1 },
      { weekStart: '2024-01-08', value: 2 },
      { weekStart: '2024-01-15', value: 3 },
    ]
    const result = normalizeWeekSeries(rows)
    expect(result).toHaveLength(3)
    expect(result.every((p) => !p.isFilled)).toBe(true)
  })

  it('deduplicates same week_start (last write wins via Map)', () => {
    const rows = [
      { weekStart: '2024-01-01', value: 1 },
      { weekStart: '2024-01-01', value: 9 },
    ]
    const result = normalizeWeekSeries(rows)
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe(9)
  })

  it('produces sorted output even if input is unsorted', () => {
    const rows = [
      { weekStart: '2024-01-15', value: 5 },
      { weekStart: '2024-01-01', value: 3 },
    ]
    const result = normalizeWeekSeries(rows)
    expect(result[0].weekStart).toBe('2024-01-01')
    expect(result[2].weekStart).toBe('2024-01-15')
  })

  it('fills multiple gaps correctly', () => {
    const rows = [
      { weekStart: '2024-01-01', value: 1 },
      { weekStart: '2024-01-29', value: 4 }, // 3 gaps: Jan 8, Jan 15, Jan 22
    ]
    const result = normalizeWeekSeries(rows)
    expect(result).toHaveLength(5)
    const filledWeeks = result.filter((p) => p.isFilled)
    expect(filledWeeks).toHaveLength(3)
    expect(filledWeeks.every((p) => p.value === 0)).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────
// normalizeWeekSeriesNullable
// ──────────────────────────────────────────────────────────────

describe('normalizeWeekSeriesNullable', () => {
  it('returns empty for empty input', () => {
    expect(normalizeWeekSeriesNullable([])).toEqual([])
  })

  it('fills gaps with null rather than 0', () => {
    const rows = [
      { weekStart: '2024-01-01', value: 100 },
      { weekStart: '2024-01-15', value: 110 },
    ]
    const result = normalizeWeekSeriesNullable(rows)
    expect(result[1]).toEqual({ weekStart: '2024-01-08', value: null, isFilled: true })
  })

  it('ignores input rows with null values', () => {
    const rows = [
      { weekStart: '2024-01-01', value: 100 },
      { weekStart: '2024-01-08', value: null },
      { weekStart: '2024-01-15', value: 110 },
    ]
    const result = normalizeWeekSeriesNullable(rows)
    // Jan 8 was null in input; same result as a gap
    expect(result[1]).toEqual({ weekStart: '2024-01-08', value: null, isFilled: true })
  })
})

// ──────────────────────────────────────────────────────────────
// deriveLoadState
// ──────────────────────────────────────────────────────────────

describe('deriveLoadState', () => {
  it('returns loading when isLoading is true', () => {
    expect(deriveLoadState({ isLoading: true, isError: false, isEmpty: false })).toBe('loading')
  })

  it('loading takes priority over error', () => {
    expect(deriveLoadState({ isLoading: true, isError: true, isEmpty: false })).toBe('loading')
  })

  it('returns error when not loading and isError true', () => {
    expect(deriveLoadState({ isLoading: false, isError: true, isEmpty: false })).toBe('error')
  })

  it('returns empty when not loading, no error, isEmpty true', () => {
    expect(deriveLoadState({ isLoading: false, isError: false, isEmpty: true })).toBe('empty')
  })

  it('returns ready when not loading, no error, not empty', () => {
    expect(deriveLoadState({ isLoading: false, isError: false, isEmpty: false })).toBe('ready')
  })
})

// ──────────────────────────────────────────────────────────────
// shapeProgressOverview
// ──────────────────────────────────────────────────────────────

describe('shapeProgressOverview', () => {
  const base: ProgressOverviewDTO = {
    range_days: 28,
    workouts: 8,
    workouts_per_week: 2,
    minutes_trained: 320,
    strength_volume_kg: 12000,
    avg_effort: 7.5,
    prs_count: 3,
  }

  it('maps all fields correctly', () => {
    const m = shapeProgressOverview(base)
    expect(m.rangeDays).toBe(28)
    expect(m.workouts).toBe(8)
    expect(m.workoutsPerWeek).toBe(2)
    expect(m.minutesTrained).toBe(320)
    expect(m.strengthVolumeKg).toBe(12000)
    expect(m.avgEffort).toBe(7.5)
    expect(m.prsCount).toBe(3)
    expect(m.isEmpty).toBe(false)
  })

  it('isEmpty is true when workouts is 0', () => {
    const m = shapeProgressOverview({ ...base, workouts: 0 })
    expect(m.isEmpty).toBe(true)
  })

  it('coerces null numerics to 0', () => {
    const m = shapeProgressOverview({
      ...base,
      workouts_per_week: null,
      minutes_trained: null,
      strength_volume_kg: null,
    })
    expect(m.workoutsPerWeek).toBe(0)
    expect(m.minutesTrained).toBe(0)
    expect(m.strengthVolumeKg).toBe(0)
  })

  it('preserves null avgEffort', () => {
    const m = shapeProgressOverview({ ...base, avg_effort: null })
    expect(m.avgEffort).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────
// shapeWeeklyWorkouts
// ──────────────────────────────────────────────────────────────

describe('shapeWeeklyWorkouts', () => {
  it('returns empty model for empty rows', () => {
    const m = shapeWeeklyWorkouts([])
    expect(m.isEmpty).toBe(true)
    expect(m.series).toHaveLength(0)
  })

  it('builds a filled series', () => {
    const rows: WeeklyWorkoutsRowDTO[] = [
      { user_id: 'u1', week_start: '2024-01-01', workouts_completed: 3 },
      { user_id: 'u1', week_start: '2024-01-15', workouts_completed: 2 },
    ]
    const m = shapeWeeklyWorkouts(rows)
    expect(m.isEmpty).toBe(false)
    expect(m.series).toHaveLength(3) // includes filled week
    expect(m.series[1].isFilled).toBe(true)
    expect(m.series[1].value).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────
// shapeMuscleBalance
// ──────────────────────────────────────────────────────────────

describe('shapeMuscleBalance', () => {
  it('returns empty model for empty rows', () => {
    const m = shapeMuscleBalance([])
    expect(m.isEmpty).toBe(true)
    expect(m.topMuscles).toHaveLength(0)
  })

  it('aggregates across multiple weeks', () => {
    const rows: WeeklyMuscleBalanceRowDTO[] = [
      {
        user_id: 'u',
        week_start: '2024-01-01',
        muscle_key: 'chest',
        volume_kg: 500,
        sets_count: 10,
      },
      {
        user_id: 'u',
        week_start: '2024-01-08',
        muscle_key: 'chest',
        volume_kg: 600,
        sets_count: 12,
      },
      { user_id: 'u', week_start: '2024-01-01', muscle_key: 'back', volume_kg: 400, sets_count: 8 },
    ]
    const m = shapeMuscleBalance(rows)
    expect(m.totalVolumeKg).toBeCloseTo(1500)
    expect(m.distribution[0].muscleKey).toBe('chest')
    expect(m.distribution[0].volumeKg).toBeCloseTo(1100)
  })

  it('limits topMuscles to 6', () => {
    const rows: WeeklyMuscleBalanceRowDTO[] = Array.from({ length: 8 }, (_, i) => ({
      user_id: 'u',
      week_start: '2024-01-01',
      muscle_key: `muscle_${i}`,
      volume_kg: (8 - i) * 100,
      sets_count: 5,
    }))
    const m = shapeMuscleBalance(rows)
    expect(m.topMuscles).toHaveLength(6)
    expect(m.distribution).toHaveLength(8)
  })

  it('calculates percentages summing to ~100', () => {
    const rows: WeeklyMuscleBalanceRowDTO[] = [
      { user_id: 'u', week_start: '2024-01-01', muscle_key: 'a', volume_kg: 300, sets_count: 6 },
      { user_id: 'u', week_start: '2024-01-01', muscle_key: 'b', volume_kg: 700, sets_count: 14 },
    ]
    const m = shapeMuscleBalance(rows)
    const totalPct = m.distribution.reduce((s, e) => s + e.pct, 0)
    // Due to Math.round, sum may be 99–101
    expect(totalPct).toBeGreaterThanOrEqual(99)
    expect(totalPct).toBeLessThanOrEqual(101)
  })
})
