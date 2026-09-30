// ============================================================
// Insight Types — Phase 4
// ============================================================
//
// Public contracts for the rules-based insight (coach) engine.
//   • InsightRule<Input>    — rule contract (applies / score / build)
//   • Insight               — what the UI renders
//   • *InsightInput         — typed inputs per module
//
// All insight text is produced by insightCopy.ts.
// All rule logic lives in insightRules.ts.
// ============================================================

import type { TFn } from './insightCopy'

export type InsightTone = 'positive' | 'neutral' | 'warning'

export type InsightConfidence = 'high' | 'medium' | 'low'

export type Insight = {
  /** Stable identifier, e.g. "OV-01". Used as React key. */
  id: string
  tone: InsightTone
  title?: string
  /** 1-liner displayed by default */
  message: string
  /** Expandable bullet context (shown when user taps "Learn more") */
  details?: string[]
  /** Single suggested action (shown when expanded) */
  nextStep?: string
  confidence: InsightConfidence
  basedOn: {
    rangeDays: number
    /** ISO timestamp; injectable for deterministic test snapshots */
    generatedAt: string
  }
}

// ── Module input shapes ────────────────────────────────────────────

/** Derived from current and previous period overview RPCs */
export type OverviewInsightInput = {
  currentWorkouts: number
  prevWorkouts: number
  currentVolumeKg: number
  prevVolumeKg: number
  rangeDays: number
}

/** Derived from the exercise e1RM trend model */
export type StrengthInsightInput = {
  /** Chronological series; null values represent training gaps */
  trendPoints: Array<{ weekStart: string; value: number | null }>
  currentBestKg: number | null
  rangeDays: number
}

/** Derived from the muscle balance model */
export type BalanceInsightInput = {
  /** Full distribution, sorted by volume descending */
  distribution: Array<{ muscleKey: string; volumeKg: number; pct: number }>
  totalVolumeKg: number
  rangeDays: number
}

/**
 * Body insight input shape.
 *
 * NOTE: The check-in / body data layer does not exist yet in Phase 4.
 * Body rules are scaffolded but not activated (BODY_RULES = []).
 * @deferred TODO: Wire when a check-in analytics hook is available.
 */
export type BodyInsightInput = {
  entries: Array<{ date: string; weightKg: number }>
  rangeDays: number
}

// ── Rule contract ──────────────────────────────────────────────────

export type InsightRule<Input> = {
  /** Must match the produced Insight.id */
  id: string
  /**
   * Returns true when this rule is a candidate for the given input.
   * Sufficiency gating (confidence checks) must happen inside applies().
   */
  applies: (input: Input) => boolean
  /**
   * Numeric priority score. Higher = more urgent.
   * The engine selects the highest-scoring applicable rule.
   * Ties are broken by id (lexicographic ascending) for stability.
   */
  score: (input: Input) => number
  /** Produces the fully formed Insight */
  build: (input: Input, basedOn: { rangeDays: number; generatedAt: string }, t: TFn) => Insight
}
