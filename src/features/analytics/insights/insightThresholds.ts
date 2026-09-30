// ============================================================
// Insight Thresholds — Phase 4
// ============================================================
//
// Single source of truth for all numeric gates used by the insight
// engine. All copy lives in insightCopy.ts; no strings here.
//
// THRESHOLD RATIONALE:
//   MIN_WORKOUTS_FOR_TREND  = 4   — 1 month of ~1×/week is the minimum signal
//   SIGNIFICANT_PCT_CHANGE  = 10% — avoids noise from small fluctuations
//   DROP_WARNING_PCT        = 20% — meaningful consistency regression
//   FLAT_PCT_BAND           = 5%  — "flat" = within normal week-to-week noise
//   TOP1_CONCENTRATION      = 45% — one muscle dominating almost half of volume
// ============================================================

import type { InsightConfidence } from './insightTypes'

// ── Numeric thresholds ─────────────────────────────────────────────

/** Minimum workouts in a period to compute reliable period-over-period trends */
export const MIN_WORKOUTS_FOR_TREND = 4

/** Volume or frequency change must exceed this fraction to be considered significant */
export const SIGNIFICANT_PCT_CHANGE = 0.1

/** Frequency drop >= this fraction triggers a warning signal */
export const DROP_WARNING_PCT = 0.2

/** Minimum non-null weekly data points required to compute a slope */
export const MIN_WEEKS_FOR_SLOPE = 3

/** Minimum total volume (kg) for muscle balance insights to be meaningful */
export const MUSCLE_BALANCE_MIN_TOTAL_VOLUME_KG = 100

/** Change within ±this fraction is considered "flat" (within noise band) */
export const FLAT_PCT_BAND = 0.05

/** e1RM must rise by at least this fraction to fire the "trending up" rule */
export const LIFT_TREND_UP_PCT = 0.02

/** Top-muscle share above this fraction triggers the over-concentration warning */
export const TOP1_CONCENTRATION_THRESHOLD = 0.45

/** Body weight must shift by at least this many kg to surface a trend insight */
export const BODY_WEIGHT_CHANGE_THRESHOLD_KG = 1.0

/** Minimum check-in entries required for body trend computation */
export const BODY_MIN_ENTRIES = 3

// ── Sufficiency helpers ────────────────────────────────────────────

/**
 * Determines confidence level for period-over-period overview insights.
 *
 * 'high'   — both periods have >= MIN_WORKOUTS_FOR_TREND workouts
 * 'medium' — at least one period has some data
 * 'low'    — both periods are empty, or insufficient for comparison
 */
export function hasSufficientOverviewData(input: {
  currentWorkouts: number
  prevWorkouts: number
}): InsightConfidence {
  const { currentWorkouts, prevWorkouts } = input

  if (currentWorkouts === 0 && prevWorkouts === 0) return 'low'
  // Previous period is zero: can signal "new momentum" but not reliable trend
  if (prevWorkouts === 0) return 'medium'
  if (currentWorkouts >= MIN_WORKOUTS_FOR_TREND && prevWorkouts >= MIN_WORKOUTS_FOR_TREND) {
    return 'high'
  }
  return 'medium'
}

/**
 * Determines confidence level for series-based trend insights.
 * Counts only non-null data points (training gaps are excluded).
 *
 * 'high'   — at least 2× the required minimum non-null points
 * 'medium' — meets minimum but not 2×
 * 'low'    — below minimum
 */
export function hasSufficientTrendSeries(
  points: Array<{ value: number | null }>,
  minPoints: number,
): InsightConfidence {
  const nonNull = points.filter((p) => p.value !== null).length
  if (nonNull < minPoints) return 'low'
  if (nonNull < minPoints * 2) return 'medium'
  return 'high'
}

/**
 * Safe fractional percentage change.
 *
 * Returns null when prev === 0 (avoids division-by-zero).
 * Result is a fraction: 0.10 means +10%, -0.20 means -20%.
 */
export function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return null
  return (current - prev) / Math.abs(prev)
}

/**
 * Computes a simple slope proxy: the fractional change between the first
 * and last non-null values in the series (chronological order).
 *
 * Returns null when fewer than 2 non-null points exist.
 * This is deterministic and testable without floating-point regression fits.
 */
export function seriesSlopeProxy(points: Array<{ value: number | null }>): number | null {
  const nonNull = points.map((p) => p.value).filter((v): v is number => v !== null)

  if (nonNull.length < 2) return null

  const first = nonNull[0]
  const last = nonNull[nonNull.length - 1]

  return pctChange(last, first)
}
