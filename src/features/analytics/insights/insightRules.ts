// ============================================================
// Insight Rules — Phase 4
// ============================================================
//
// Each exported rule set implements InsightRule<T>.
// Rules are pure functions — no side effects, no randomness.
//
// RULE ORDERING (via score()):
//   Warnings (large drops) > Positive improvements > Neutral/new info
//   Within a tone, larger absolute change = higher score.
//   Ties break lexicographically by id (earlier id wins).
//
// SUFFICIENCY GATING:
//   Each rule's applies() calls hasSufficient*() helpers.
//   If confidence === 'low', applies() returns false.
//   Rules that require previous period data short-circuit when prev === 0
//   (OV-04 handles the "brand new user" case instead).
//
// COPY DELEGATION:
//   All message/details/nextStep strings come from insightCopy.ts.
//   The translator function (t: TFn) is threaded through build().
// ============================================================

import type {
  BalanceInsightInput,
  BodyInsightInput,
  Insight,
  InsightRule,
  OverviewInsightInput,
  StrengthInsightInput,
} from './insightTypes'

import {
  DROP_WARNING_PCT,
  FLAT_PCT_BAND,
  LIFT_TREND_UP_PCT,
  MIN_WEEKS_FOR_SLOPE,
  MUSCLE_BALANCE_MIN_TOTAL_VOLUME_KG,
  SIGNIFICANT_PCT_CHANGE,
  TOP1_CONCENTRATION_THRESHOLD,
  hasSufficientOverviewData,
  hasSufficientTrendSeries,
  pctChange,
  seriesSlopeProxy,
} from './insightThresholds'

import {
  BL_01_NEGLECTED_AREA,
  BL_02_OVER_CONCENTRATION,
  OV_01_CONSISTENCY_SLIPPED,
  OV_02_DENSITY_IMPROVED,
  OV_03_WORKOUTS_UP_VOLUME_FLAT,
  OV_04_NEW_MOMENTUM,
  ST_01_LIFT_TRENDING_UP,
  ST_02_PLATEAU_SIGNAL,
} from './insightCopy'

// ──────────────────────────────────────────────────────────────────
// A. OVERVIEW RULES
// ──────────────────────────────────────────────────────────────────

/**
 * Major muscle groups checked for absence in BL-01.
 * Order matters: the first absent group is surfaced.
 */
const MAJOR_MUSCLE_GROUPS: ReadonlyArray<string> = [
  'chest',
  'back',
  'lats',
  'quads',
  'hamstrings',
  'glutes',
  'shoulders',
]

/**
 * OV-04: New momentum.
 * Previous period had no workouts; this period has data.
 * Scored highest so a first-timer gets an encouraging baseline message
 * rather than misleading "vs last period" comparisons.
 */
const OV_04_RULE: InsightRule<OverviewInsightInput> = {
  id: 'OV-04',
  applies(input) {
    return input.prevWorkouts === 0 && input.currentWorkouts > 0
  },
  score(_input) {
    return 1000
  },
  build(_input, basedOn, t) {
    const copy = OV_04_NEW_MOMENTUM(t)
    return {
      id: 'OV-04',
      tone: 'positive',
      message: copy.message,
      details: copy.details,
      nextStep: copy.nextStep,
      confidence: 'medium',
      basedOn,
    }
  },
}

/**
 * OV-01: Consistency slipped.
 * Workouts down >= DROP_WARNING_PCT vs previous period.
 * Only fires when both periods have enough data (hasSufficientOverviewData !== 'low').
 */
const OV_01_RULE: InsightRule<OverviewInsightInput> = {
  id: 'OV-01',
  applies(input) {
    const confidence = hasSufficientOverviewData(input)
    if (confidence === 'low') return false
    const pct = pctChange(input.currentWorkouts, input.prevWorkouts)
    return pct !== null && pct <= -DROP_WARNING_PCT
  },
  score(input) {
    const pct = pctChange(input.currentWorkouts, input.prevWorkouts) ?? 0
    // Larger drop → higher urgency → higher score
    return 500 + Math.abs(pct) * 100
  },
  build(input, basedOn, t) {
    const copy = OV_01_CONSISTENCY_SLIPPED(t)
    const confidence = hasSufficientOverviewData(input)
    return {
      id: 'OV-01',
      tone: 'warning',
      message: copy.message,
      details: copy.details,
      nextStep: copy.nextStep,
      confidence,
      basedOn,
    }
  },
}

/**
 * OV-02: Density improved.
 * Volume up >= SIGNIFICANT_PCT_CHANGE while session count is flat (±FLAT_PCT_BAND).
 */
const OV_02_RULE: InsightRule<OverviewInsightInput> = {
  id: 'OV-02',
  applies(input) {
    const confidence = hasSufficientOverviewData(input)
    if (confidence === 'low') return false
    const workoutsPct = pctChange(input.currentWorkouts, input.prevWorkouts)
    const volumePct = pctChange(input.currentVolumeKg, input.prevVolumeKg)
    if (workoutsPct === null || volumePct === null) return false
    return Math.abs(workoutsPct) <= FLAT_PCT_BAND && volumePct >= SIGNIFICANT_PCT_CHANGE
  },
  score(input) {
    const volumePct = pctChange(input.currentVolumeKg, input.prevVolumeKg) ?? 0
    return 300 + Math.abs(volumePct) * 100
  },
  build(input, basedOn, t) {
    const copy = OV_02_DENSITY_IMPROVED(t)
    const confidence = hasSufficientOverviewData(input)
    return {
      id: 'OV-02',
      tone: 'positive',
      message: copy.message,
      details: copy.details,
      confidence,
      basedOn,
    }
  },
}

/**
 * OV-03: More sessions, volume flat.
 * Workouts up >= SIGNIFICANT_PCT_CHANGE while volume is flat (±FLAT_PCT_BAND).
 */
const OV_03_RULE: InsightRule<OverviewInsightInput> = {
  id: 'OV-03',
  applies(input) {
    const confidence = hasSufficientOverviewData(input)
    if (confidence === 'low') return false
    const workoutsPct = pctChange(input.currentWorkouts, input.prevWorkouts)
    const volumePct = pctChange(input.currentVolumeKg, input.prevVolumeKg)
    if (workoutsPct === null || volumePct === null) return false
    return Math.abs(volumePct) <= FLAT_PCT_BAND && workoutsPct >= SIGNIFICANT_PCT_CHANGE
  },
  score(input) {
    const workoutsPct = pctChange(input.currentWorkouts, input.prevWorkouts) ?? 0
    return 200 + Math.abs(workoutsPct) * 100
  },
  build(input, basedOn, t) {
    const copy = OV_03_WORKOUTS_UP_VOLUME_FLAT(t)
    const confidence = hasSufficientOverviewData(input)
    return {
      id: 'OV-03',
      tone: 'neutral',
      message: copy.message,
      details: copy.details,
      confidence,
      basedOn,
    }
  },
}

/** Ordered set of overview rules. Engine selects the highest-scoring applicable one. */
export const OVERVIEW_RULES: ReadonlyArray<InsightRule<OverviewInsightInput>> = [
  OV_04_RULE,
  OV_01_RULE,
  OV_02_RULE,
  OV_03_RULE,
]

// ──────────────────────────────────────────────────────────────────
// B. STRENGTH RULES
// ──────────────────────────────────────────────────────────────────

/**
 * ST-01: Lift trending up.
 * e1RM slope (first → last non-null point) >= LIFT_TREND_UP_PCT.
 * Only fires with >= MIN_WEEKS_FOR_SLOPE non-null data points.
 */
const ST_01_RULE: InsightRule<StrengthInsightInput> = {
  id: 'ST-01',
  applies(input) {
    const confidence = hasSufficientTrendSeries(input.trendPoints, MIN_WEEKS_FOR_SLOPE)
    if (confidence === 'low') return false
    const slope = seriesSlopeProxy(input.trendPoints)
    return slope !== null && slope >= LIFT_TREND_UP_PCT
  },
  score(input) {
    const slope = seriesSlopeProxy(input.trendPoints) ?? 0
    return 400 + Math.abs(slope) * 100
  },
  build(input, basedOn, t) {
    const copy = ST_01_LIFT_TRENDING_UP(t)
    const confidence = hasSufficientTrendSeries(input.trendPoints, MIN_WEEKS_FOR_SLOPE)
    return {
      id: 'ST-01',
      tone: 'positive',
      message: copy.message,
      details: copy.details,
      nextStep: copy.nextStep,
      confidence,
      basedOn,
    }
  },
}

/**
 * ST-02: Plateau signal.
 * e1RM slope is within ±FLAT_PCT_BAND (approximately zero).
 * Requires >= MIN_WEEKS_FOR_SLOPE non-null data points.
 * Does not fire when ST-01 fires (mutually exclusive via score ordering).
 */
const ST_02_RULE: InsightRule<StrengthInsightInput> = {
  id: 'ST-02',
  applies(input) {
    const confidence = hasSufficientTrendSeries(input.trendPoints, MIN_WEEKS_FOR_SLOPE)
    if (confidence === 'low') return false
    const slope = seriesSlopeProxy(input.trendPoints)
    if (slope === null) return false
    return Math.abs(slope) <= FLAT_PCT_BAND
  },
  score(_input) {
    return 200
  },
  build(input, basedOn, t) {
    const copy = ST_02_PLATEAU_SIGNAL(t)
    const confidence = hasSufficientTrendSeries(input.trendPoints, MIN_WEEKS_FOR_SLOPE)
    return {
      id: 'ST-02',
      tone: 'neutral',
      message: copy.message,
      details: copy.details,
      nextStep: copy.nextStep,
      confidence,
      basedOn,
    }
  },
}

/** Ordered set of strength rules. */
export const STRENGTH_RULES: ReadonlyArray<InsightRule<StrengthInsightInput>> = [
  ST_01_RULE,
  ST_02_RULE,
]

// ──────────────────────────────────────────────────────────────────
// C. BALANCE RULES
// ──────────────────────────────────────────────────────────────────

/**
 * BL-02: Over-concentration.
 * Top muscle group > TOP1_CONCENTRATION_THRESHOLD of total volume.
 * Scored higher than BL-01 because concentration is a stronger signal.
 */
const BL_02_RULE: InsightRule<BalanceInsightInput> = {
  id: 'BL-02',
  applies(input) {
    if (input.totalVolumeKg < MUSCLE_BALANCE_MIN_TOTAL_VOLUME_KG) return false
    if (input.distribution.length === 0) return false
    const top1Share = input.distribution[0].pct / 100
    return top1Share > TOP1_CONCENTRATION_THRESHOLD
  },
  score(input) {
    const top1Share = input.distribution.length > 0 ? input.distribution[0].pct / 100 : 0
    return 400 + top1Share * 100
  },
  build(input, basedOn, t) {
    const top = input.distribution[0]
    const copy = BL_02_OVER_CONCENTRATION(t, top.muscleKey, top.pct)
    return {
      id: 'BL-02',
      tone: 'warning',
      message: copy.message,
      details: copy.details,
      confidence: 'high',
      basedOn,
    }
  },
}

/**
 * BL-01: Neglected major area.
 * A major muscle group (from MAJOR_MUSCLE_GROUPS) is absent from the distribution.
 * Requires a minimum total volume so sparse data doesn't trigger false positives.
 */
const BL_01_RULE: InsightRule<BalanceInsightInput> = {
  id: 'BL-01',
  applies(input) {
    if (input.totalVolumeKg < MUSCLE_BALANCE_MIN_TOTAL_VOLUME_KG) return false
    const present = new Set(input.distribution.map((e) => e.muscleKey))
    return MAJOR_MUSCLE_GROUPS.some((mg) => !present.has(mg))
  },
  score(_input) {
    return 300
  },
  build(input, basedOn, t): Insight {
    const present = new Set(input.distribution.map((e) => e.muscleKey))
    const missingKey = MAJOR_MUSCLE_GROUPS.find((mg) => !present.has(mg)) ?? 'muscle'
    const copy = BL_01_NEGLECTED_AREA(t, missingKey)
    return {
      id: 'BL-01',
      tone: 'neutral',
      message: copy.message,
      details: copy.details,
      nextStep: copy.nextStep,
      confidence: 'high',
      basedOn,
    }
  },
}

/** Ordered set of balance rules. BL-02 scored higher than BL-01. */
export const BALANCE_RULES: ReadonlyArray<InsightRule<BalanceInsightInput>> = [
  BL_02_RULE,
  BL_01_RULE,
]

// ──────────────────────────────────────────────────────────────────
// D. BODY RULES — deferred (no data layer in Phase 4)
// ──────────────────────────────────────────────────────────────────
//
// BD-01 (weight trend) and BD-02 (check-in cadence) are scaffolded
// in insightCopy.ts but not exported as active rules.
// The engine returns null for bodyInsight until this is wired.
// @deferred TODO: Implement when a check-in analytics hook is available.

export const BODY_RULES: ReadonlyArray<InsightRule<BodyInsightInput>> = []
