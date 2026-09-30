// ============================================================
// Analytics Types — Phase 2
// ============================================================
//
// This file defines:
//   1. DTOs — exact mirrors of Phase 1 backend payloads
//   2. UI models — what screens consume (deltas, empty flags, series)
//   3. Unified query contract — AnalyticsQuery
//   4. LoadState — UI state machine
//
// BACKEND NAMING MAP (migration-027):
//   analytics.weekly_workouts             → WeeklyWorkoutsRowDTO
//   analytics.weekly_strength_volume      → WeeklyStrengthVolumeRowDTO
//   analytics.weekly_muscle_balance       → WeeklyMuscleBalanceRowDTO
//   analytics.exercise_e1rm_weekly        → ExerciseE1RMWeeklyRowDTO
//   analytics.rpc_progress_overview(int)  → ProgressOverviewDTO
//
// NOTE: Phase 1 also exposes analytics.rpc_muscle_balance and
//   analytics.rpc_strength_lift_trend but Phase 2 reads the raw views
//   and shapes them in the service layer for finer control.
//
// UNIT POLICY: All weights are stored and returned in kg by the backend.
//   Unit conversion is the UI's responsibility. The service layer
//   provides a `fromWeightKg` helper re-export for convenience but
//   does NOT format strings itself.
// ============================================================

// ──────────────────────────────────────────────────────────────
// 1. DTOs — backend payload mirrors (no computed fields)
// ──────────────────────────────────────────────────────────────

/** Row from analytics.rpc_progress_overview(range_days int) */
export type ProgressOverviewDTO = {
  range_days: number
  workouts: number
  workouts_per_week: number | null
  minutes_trained: number | null
  strength_volume_kg: number | null
  avg_effort: number | null
  prs_count: number
}

/** Row from analytics.weekly_workouts */
export type WeeklyWorkoutsRowDTO = {
  /** UUID — returned by view but RLS ensures it matches auth.uid() */
  user_id: string
  /** ISO date string (YYYY-MM-DD), ISO Monday */
  week_start: string
  workouts_completed: number
}

/** Row from analytics.weekly_strength_volume */
export type WeeklyStrengthVolumeRowDTO = {
  user_id: string
  week_start: string
  /** Total volume in kg (weight_kg * reps) for strength sets */
  volume_kg: number
  sets_count: number
  reps_count: number
}

/** Row from analytics.weekly_muscle_balance */
export type WeeklyMuscleBalanceRowDTO = {
  user_id: string
  week_start: string
  muscle_key: string
  /** Volume contribution in kg via 70/30 primary/secondary split (ADR-AN-003) */
  volume_kg: number
  sets_count: number
}

/** Row from analytics.exercise_e1rm_weekly */
export type ExerciseE1RMWeeklyRowDTO = {
  user_id: string
  exercise_definition_id: string
  week_start: string
  /** Weekly best e1RM in kg (Epley formula, rounded to 1dp) */
  best_e1rm: number
}

// ──────────────────────────────────────────────────────────────
// 2. UI Models — what screens consume
// ──────────────────────────────────────────────────────────────

/** A single data point in a weekly series */
export type WeekPoint = {
  /** ISO date string, ISO Monday */
  weekStart: string
  value: number
  /** True when this week had no data and was zero-filled */
  isFilled: boolean
}

/** A single point in an e1RM trend series; value may be null for missing weeks */
export type TrendPoint = {
  weekStart: string
  /** null = no data for this week (gap in training) */
  value: number | null
  isFilled: boolean
}

/** Delta between current and previous period */
export type Delta = {
  /** Absolute change */
  abs: number
  /** Percentage change; null when prev was 0 */
  pct: number | null
  /** Human-readable label: '+5%', '-3%', 'New', '—' */
  label: string
  tone: 'up' | 'down' | 'neutral'
}

/** UI model for the progress overview hero card */
export type ProgressOverviewModel = {
  rangeDays: number
  workouts: number
  workoutsPerWeek: number
  minutesTrained: number
  strengthVolumeKg: number
  avgEffort: number | null
  prsCount: number
  isEmpty: boolean
}

/** UI model for a weekly workout consistency series */
export type WeeklyWorkoutsModel = {
  series: WeekPoint[]
  isEmpty: boolean
}

/** UI model for weekly strength volume series */
export type WeeklyStrengthVolumeModel = {
  volumeSeries: WeekPoint[]
  setsSeries: WeekPoint[]
  totalVolumeKg: number
  totalSets: number
  isEmpty: boolean
}

/** UI model for muscle balance within a period */
export type MuscleEntry = {
  muscleKey: string
  volumeKg: number
  pct: number
}

export type MuscleBalanceModel = {
  /** Up to 6 muscles by volume desc */
  topMuscles: MuscleEntry[]
  /** Full distribution */
  distribution: MuscleEntry[]
  totalVolumeKg: number
  isEmpty: boolean
}

/** UI model for an exercise e1RM trend */
export type TrendModel = {
  exerciseDefinitionId: string
  points: TrendPoint[]
  /** Current period best e1RM in kg */
  currentBestKg: number | null
  isEmpty: boolean
}

// ──────────────────────────────────────────────────────────────
// 3. Unified query contract (forward-compatible)
// ──────────────────────────────────────────────────────────────

/**
 * Unified analytics query parameters.
 * Only `rangeDays` is used in Phase 2 MVP.
 * Other fields are reserved for future phases.
 */
export type AnalyticsQuery = {
  /** Rolling window in days. Default: 28. */
  rangeDays?: number
  /** Reserved: filter by routine (Phase 3+) */
  routineId?: string
  /** Required for exercise-level hooks */
  exerciseDefinitionId?: string
  /** Reserved: filter by training mode (Phase 3+) */
  mode?: 'strength' | 'cardio' | 'mobility' | 'all'
}

// ──────────────────────────────────────────────────────────────
// 4. LoadState — UI state machine
// ──────────────────────────────────────────────────────────────

/**
 * Derived UI state for any analytics query result.
 * Screens map this to:
 *   loading → skeleton
 *   empty   → CTA
 *   ready   → data
 *   error   → retry prompt
 */
export type LoadState = 'loading' | 'empty' | 'ready' | 'error'
