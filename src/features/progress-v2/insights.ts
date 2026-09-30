// ============================================================
// Progress V2 — Deterministic Insights
// ============================================================
//
// Rules:
//   • Each insight is ONLY returned when a measurable threshold is met.
//   • No LLM, no heuristic fudging, no causality claims.
//   • Tone is derived from the direction of the change, not sentiment.
//   • computeInsights() returns at most 2 insights (highest signal first).
//   • computeMuscleInsight() is separate so callers can render it inline.
//
// Thresholds:
//   CONSISTENCY_DROP_THRESHOLD  0.20  →  workouts/week down >20% = warning
//   CONSISTENCY_RISE_THRESHOLD  0.20  →  workouts/week up >20% = positive
//   VOLUME_DENSITY_THRESHOLD    0.10  →  volume up >10% while workouts flat = positive
//   VOLUME_DROP_THRESHOLD       0.20  →  volume down >20% while workouts flat = warning
// ============================================================

import { computeDelta } from '../analytics/analyticsService'
import type {
  MuscleBalanceModel,
  ProgressOverviewModel,
  WeeklyStrengthVolumeModel,
  WeeklyWorkoutsModel,
  WeekPoint,
} from '../analytics/analyticsTypes'

// ── Types ────────────────────────────────────────────────────────────

export type InsightTone = 'positive' | 'neutral' | 'warning'

export type Insight = {
  key: string
  tone: InsightTone
  message: string
}

// ── Thresholds ───────────────────────────────────────────────────────

const CONSISTENCY_DROP_THRESHOLD = 0.2
const CONSISTENCY_RISE_THRESHOLD = 0.2
const VOLUME_DENSITY_THRESHOLD = 0.1
const VOLUME_DROP_THRESHOLD = 0.2
/** Workouts considered "flat" if within ±5% */
const WORKOUTS_FLAT_BAND = 0.05

// ── Helpers ──────────────────────────────────────────────────────────

function avg(points: WeekPoint[]): number {
  if (points.length === 0) return 0
  return points.reduce((s, p) => s + p.value, 0) / points.length
}

/**
 * Splits a series into first-half / second-half and returns the
 * fractional change in average (positive = trending up).
 * Returns 0 when the series is too short (< 4 points) or the first-half avg is 0.
 */
function inPeriodTrend(series: WeekPoint[]): number {
  if (series.length < 4) return 0
  const mid = Math.floor(series.length / 2)
  const firstAvg = avg(series.slice(0, mid))
  const secondAvg = avg(series.slice(mid))
  if (firstAvg === 0) return 0
  return (secondAvg - firstAvg) / firstAvg
}

// ── Muscle display labels ─────────────────────────────────────────────

const MUSCLE_DISPLAY: Record<string, string> = {
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulder',
  lats: 'lat',
  upperBack: 'upper back',
  quads: 'quad',
  hamstrings: 'hamstring',
  glutes: 'glute',
  biceps: 'biceps',
  triceps: 'triceps',
  calves: 'calf',
  core: 'core',
  forearms: 'forearm',
}

/** Major muscle groups surfaced if absent from the balance distribution */
const MAJOR_MUSCLE_GROUPS = ['chest', 'back', 'lats', 'quads', 'hamstrings', 'glutes', 'shoulders']

// ── Compute functions ─────────────────────────────────────────────────

export type InsightInputs = {
  /**
   * Overview for the current period (rangeDays).
   * The prev-period overview is computed externally as:
   *   prevVolumeKg = overview2x.strengthVolumeKg - overview1x.strengthVolumeKg
   * and passed here via prevPeriodVolume, prevPeriodWorkouts.
   */
  overview: ProgressOverviewModel
  /** Pre-computed: workouts count for the *previous* period (0 if unavailable). */
  prevPeriodWorkouts: number
  /** Pre-computed: strengthVolumeKg for the *previous* period (0 if unavailable). */
  prevPeriodVolumeKg: number
  muscleBalance: MuscleBalanceModel | undefined
  weeklyWorkouts: WeeklyWorkoutsModel | undefined
  weeklyVolume: WeeklyStrengthVolumeModel | undefined
}

/**
 * Compute deterministic cross-domain insights.
 * Returns at most 2 insights, prioritised by signal strength.
 */
export function computeInsights(inputs: InsightInputs): Insight[] {
  const { overview, prevPeriodVolumeKg, weeklyWorkouts, weeklyVolume } = inputs

  const results: Insight[] = []

  // ── 1. In-period consistency trend (first-half vs second-half of series) ──
  if (weeklyWorkouts && !weeklyWorkouts.isEmpty) {
    const trend = inPeriodTrend(weeklyWorkouts.series)
    if (trend < -CONSISTENCY_DROP_THRESHOLD) {
      results.push({
        key: 'consistency_drop',
        tone: 'warning',
        message: 'Consistency dipped — aim for one extra session next week.',
      })
    } else if (trend > CONSISTENCY_RISE_THRESHOLD) {
      results.push({
        key: 'consistency_rise',
        tone: 'positive',
        message: 'Training frequency is trending up — great momentum.',
      })
    }
  }

  // ── 2. Volume density vs workouts (in-period) ────────────────────────────
  if (weeklyVolume && weeklyWorkouts && !weeklyVolume.isEmpty && !weeklyWorkouts.isEmpty) {
    const volumeTrend = inPeriodTrend(weeklyVolume.volumeSeries)
    const workoutsTrend = inPeriodTrend(weeklyWorkouts.series)
    const workoutsFlat = Math.abs(workoutsTrend) < WORKOUTS_FLAT_BAND

    if (volumeTrend > VOLUME_DENSITY_THRESHOLD && workoutsFlat) {
      results.push({
        key: 'denser_sessions',
        tone: 'positive',
        message: "Sessions got denser — you're lifting more per workout.",
      })
    } else if (volumeTrend < -VOLUME_DROP_THRESHOLD && workoutsFlat) {
      results.push({
        key: 'volume_drop',
        tone: 'warning',
        message: 'Volume dipped this period — if not a deload, check your set targets.',
      })
    }
  }

  // ── 3. Period-over-period volume (only when prev data is available) ───────
  if (prevPeriodVolumeKg > 0 && !overview.isEmpty && results.length < 2) {
    const delta = computeDelta(overview.strengthVolumeKg, prevPeriodVolumeKg)
    if (delta.tone === 'up' && (delta.pct ?? 0) >= 15) {
      const alreadyCovered = results.some(
        (r) => r.key === 'denser_sessions' || r.key === 'consistency_rise',
      )
      if (!alreadyCovered) {
        results.push({
          key: 'volume_up_period',
          tone: 'positive',
          message: `Volume is up ${delta.label} vs last period — solid progression.`,
        })
      }
    }
  }

  // ── 4. PRs fallback (only if no other positive insight) ──────────────────
  if (overview.prsCount > 0 && !results.some((r) => r.tone === 'positive')) {
    const n = overview.prsCount
    results.push({
      key: 'prs_achieved',
      tone: 'positive',
      message: `You hit ${n} best-effort lift${n !== 1 ? 's' : ''} this period — keep building.`,
    })
  }

  return results.slice(0, 2)
}

/**
 * Compute a single muscle-balance insight.
 * Returns null when no major muscle is missing from the distribution.
 * Rendered inline inside the Balance module.
 */
export function computeMuscleInsight(
  muscleBalance: MuscleBalanceModel | undefined,
): Insight | null {
  if (!muscleBalance || muscleBalance.isEmpty) return null

  const presentMuscles = new Set(muscleBalance.distribution.map((e) => e.muscleKey))

  for (const muscle of MAJOR_MUSCLE_GROUPS) {
    if (!presentMuscles.has(muscle)) {
      const label = MUSCLE_DISPLAY[muscle] ?? muscle
      return {
        key: `missing_${muscle}`,
        tone: 'neutral',
        message: `No direct ${label} work logged this period.`,
      }
    }
  }

  return null
}
