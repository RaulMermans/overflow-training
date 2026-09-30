// ============================================================
// Analytics Service — Phase 2
// ============================================================
//
// RESPONSIBILITIES:
//   • DTO → UI model mapping
//   • Delta computation (week-over-week, period-over-period)
//   • Normalizing sparse series to contiguous weekly series
//   • Empty state detection
//   • Unit conversion helpers (numbers + metadata; no string formatting)
//   • LoadState derivation helper
//
// UNIT POLICY (BLOCKER B2):
//   All weights from the backend are in kg.
//   This service does NOT format strings. It exposes:
//     • shapeXxx() → UI models with values in kg
//     • fromWeightKg(kg, unit) → converted number (re-exported from units.ts)
//   Screens call fromWeightKg at render time only.
//
// DATE / TIMEZONE:
//   Week series use ISO Monday dates (YYYY-MM-DD).
//   computeStartWeekMonday() in analyticsClient.ts is the reference for
//   the lower-bound start week. normalizeWeekSeries fills gaps between
//   the first and last observed weeks (inclusive) with zero/null points.
// ============================================================

import { fromWeightKg } from '../../lib/units'
import type {
  Delta,
  ExerciseE1RMWeeklyRowDTO,
  LoadState,
  MuscleBalanceModel,
  MuscleEntry,
  ProgressOverviewDTO,
  ProgressOverviewModel,
  TrendModel,
  TrendPoint,
  WeeklyMuscleBalanceRowDTO,
  WeeklyStrengthVolumeModel,
  WeeklyStrengthVolumeRowDTO,
  WeeklyWorkoutsModel,
  WeeklyWorkoutsRowDTO,
  WeekPoint,
} from './analyticsTypes'

// Re-export for hook convenience so callers don't need to import units.ts directly
export { fromWeightKg }

// ──────────────────────────────────────────────────────────────
// LoadState helper
// ──────────────────────────────────────────────────────────────

/**
 * Derives a LoadState from TanStack Query result flags and an isEmpty flag
 * produced by the shape functions below.
 *
 * Usage:
 *   const state = deriveLoadState({ isLoading, isError, isEmpty: model.isEmpty })
 */
export function deriveLoadState({
  isLoading,
  isError,
  isEmpty,
}: {
  isLoading: boolean
  isError: boolean
  isEmpty: boolean
}): LoadState {
  if (isLoading) return 'loading'
  if (isError) return 'error'
  if (isEmpty) return 'empty'
  return 'ready'
}

// ──────────────────────────────────────────────────────────────
// Delta computation
// ──────────────────────────────────────────────────────────────

/**
 * Computes a delta between a current and previous numeric value.
 *
 * Edge cases:
 *   • prev = 0, curr = 0  → label='—', tone='neutral', pct=null
 *   • prev = 0, curr > 0  → label='New', tone='up', pct=null
 *   • prev = 0, curr < 0  → label='New', tone='down', pct=null  (shouldn't occur for volumes)
 *   • prev > 0 or < 0     → label='+X%' or '-X%', pct = (curr-prev)/|prev|*100
 */
export function computeDelta(curr: number, prev: number): Delta {
  const abs = curr - prev

  if (prev === 0 && curr === 0) {
    return { abs: 0, pct: null, label: '—', tone: 'neutral' }
  }

  if (prev === 0) {
    return {
      abs,
      pct: null,
      label: 'New',
      tone: abs >= 0 ? 'up' : 'down',
    }
  }

  const pct = (abs / Math.abs(prev)) * 100
  const sign = pct >= 0 ? '+' : ''
  const label = `${sign}${Math.round(pct)}%`
  const tone: Delta['tone'] = pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral'

  return { abs, pct, label, tone }
}

// ──────────────────────────────────────────────────────────────
// Weekly series normalization
// ──────────────────────────────────────────────────────────────

/**
 * Advances a YYYY-MM-DD ISO Monday by 7 days.
 */
function nextMonday(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString().slice(0, 10)
}

/**
 * Fills a sparse array of (weekStart, value) pairs into a contiguous
 * Monday-to-Monday series between the first and last observed weeks.
 * Missing weeks receive value=0 and isFilled=true.
 *
 * If rows is empty, returns [].
 */
export function normalizeWeekSeries(rows: { weekStart: string; value: number }[]): WeekPoint[] {
  if (rows.length === 0) return []

  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.weekStart, r.value)
  }

  const sorted = [...map.keys()].sort()
  const firstWeek = sorted[0]
  const lastWeek = sorted[sorted.length - 1]

  const result: WeekPoint[] = []
  let current = firstWeek
  while (current <= lastWeek) {
    const value = map.get(current) ?? 0
    result.push({ weekStart: current, value, isFilled: !map.has(current) })
    current = nextMonday(current)
  }
  return result
}

/**
 * Same as normalizeWeekSeries but uses null for missing weeks instead of 0.
 * Useful for e1RM trends where gaps (missed training) should NOT be zero-filled.
 */
export function normalizeWeekSeriesNullable(
  rows: { weekStart: string; value: number | null }[],
): TrendPoint[] {
  if (rows.length === 0) return []

  const map = new Map<string, number | null>()
  for (const r of rows) {
    if (r.value !== null) map.set(r.weekStart, r.value)
  }

  const sorted = [...map.keys()].sort()
  if (sorted.length === 0) return []

  const firstWeek = sorted[0]
  const lastWeek = sorted[sorted.length - 1]

  const result: TrendPoint[] = []
  let current = firstWeek
  while (current <= lastWeek) {
    const hasData = map.has(current)
    result.push({
      weekStart: current,
      value: hasData ? (map.get(current) ?? null) : null,
      isFilled: !hasData,
    })
    current = nextMonday(current)
  }
  return result
}

// ──────────────────────────────────────────────────────────────
// DTO → UI model shapers
// ──────────────────────────────────────────────────────────────

/**
 * Shapes a ProgressOverviewDTO into the UI ProgressOverviewModel.
 * Null backend values are coerced to safe defaults (0) for display.
 */
export function shapeProgressOverview(dto: ProgressOverviewDTO): ProgressOverviewModel {
  const workouts = dto.workouts
  return {
    rangeDays: dto.range_days,
    workouts,
    workoutsPerWeek: dto.workouts_per_week ?? 0,
    minutesTrained: dto.minutes_trained ?? 0,
    strengthVolumeKg: dto.strength_volume_kg ?? 0,
    avgEffort: dto.avg_effort,
    prsCount: dto.prs_count,
    isEmpty: workouts === 0,
  }
}

/**
 * Shapes a list of WeeklyWorkoutsRowDTO rows into a WeeklyWorkoutsModel,
 * producing a contiguous zero-filled weekly series.
 */
export function shapeWeeklyWorkouts(rows: WeeklyWorkoutsRowDTO[]): WeeklyWorkoutsModel {
  if (rows.length === 0) {
    return { series: [], isEmpty: true }
  }

  const series = normalizeWeekSeries(
    rows.map((r) => ({ weekStart: r.week_start, value: r.workouts_completed })),
  )

  const totalWorkouts = rows.reduce((sum, r) => sum + r.workouts_completed, 0)
  return { series, isEmpty: totalWorkouts === 0 }
}

/**
 * Shapes a list of WeeklyStrengthVolumeRowDTO rows into a WeeklyStrengthVolumeModel.
 * Provides both a volume series and a sets series (both zero-filled for missing weeks).
 */
export function shapeWeeklyStrengthVolume(
  rows: WeeklyStrengthVolumeRowDTO[],
): WeeklyStrengthVolumeModel {
  if (rows.length === 0) {
    return {
      volumeSeries: [],
      setsSeries: [],
      totalVolumeKg: 0,
      totalSets: 0,
      isEmpty: true,
    }
  }

  const volumeSeries = normalizeWeekSeries(
    rows.map((r) => ({ weekStart: r.week_start, value: r.volume_kg })),
  )
  const setsSeries = normalizeWeekSeries(
    rows.map((r) => ({ weekStart: r.week_start, value: r.sets_count })),
  )

  const totalVolumeKg = rows.reduce((sum, r) => sum + r.volume_kg, 0)
  const totalSets = rows.reduce((sum, r) => sum + r.sets_count, 0)

  return {
    volumeSeries,
    setsSeries,
    totalVolumeKg,
    totalSets,
    isEmpty: totalVolumeKg === 0,
  }
}

/**
 * Shapes a list of WeeklyMuscleBalanceRowDTO rows into a MuscleBalanceModel.
 * Aggregates all weeks in the range into a single distribution, then sorts
 * by volume descending. The `topMuscles` slice contains the 6 highest-volume muscles.
 */
export function shapeMuscleBalance(rows: WeeklyMuscleBalanceRowDTO[]): MuscleBalanceModel {
  if (rows.length === 0) {
    return { topMuscles: [], distribution: [], totalVolumeKg: 0, isEmpty: true }
  }

  // Aggregate across all weeks
  const muscleMap = new Map<string, number>()
  for (const row of rows) {
    muscleMap.set(row.muscle_key, (muscleMap.get(row.muscle_key) ?? 0) + row.volume_kg)
  }

  const totalVolumeKg = [...muscleMap.values()].reduce((s, v) => s + v, 0)
  if (totalVolumeKg === 0) {
    return { topMuscles: [], distribution: [], totalVolumeKg: 0, isEmpty: true }
  }

  const distribution: MuscleEntry[] = [...muscleMap.entries()]
    .map(([muscleKey, volumeKg]) => ({
      muscleKey,
      volumeKg,
      pct: Math.round((volumeKg / totalVolumeKg) * 100),
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg)

  return {
    topMuscles: distribution.slice(0, 6),
    distribution,
    totalVolumeKg,
    isEmpty: false,
  }
}

/**
 * Shapes a list of ExerciseE1RMWeeklyRowDTO rows into a TrendModel.
 * Uses null-preserving normalization so training gaps appear as null points
 * (not zero, which would misrepresent strength regression).
 */
export function shapeExerciseTrend(
  exerciseDefinitionId: string,
  rows: ExerciseE1RMWeeklyRowDTO[],
): TrendModel {
  if (rows.length === 0) {
    return {
      exerciseDefinitionId,
      points: [],
      currentBestKg: null,
      isEmpty: true,
    }
  }

  const points = normalizeWeekSeriesNullable(
    rows.map((r) => ({ weekStart: r.week_start, value: r.best_e1rm })),
  )

  // Current best = the last non-null value in chronological order
  let currentBestKg: number | null = null
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value !== null) {
      currentBestKg = points[i].value
      break
    }
  }

  return {
    exerciseDefinitionId,
    points,
    currentBestKg,
    isEmpty: currentBestKg === null,
  }
}
