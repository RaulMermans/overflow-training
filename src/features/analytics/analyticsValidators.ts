// ============================================================
// Analytics DTO Validators — Phase 5 (QA hardening)
// ============================================================
//
// Lightweight runtime validators for analytics DTOs.
// These run on COERCED client outputs (post Number()/String()
// mapping in analyticsClient.ts) to catch:
//   • NaN — from Number(undefined) on missing/renamed fields
//   • Negative volumes / e1RM — indicates a DB schema regression
//   • Invalid week_start — detects timezone/date pipeline bugs
//   • Empty user_id / muscle_key — detects RLS or join bugs
//
// Design goals:
//   • Zero external dependencies (no Zod)
//   • Non-throwing in production — warnIfInvalid logs, never crashes
//   • Individually testable — each validator is a pure function
//   • CI-gated via Jest tests in __tests__/analyticsValidators.test.ts
// ============================================================

import type {
  ExerciseE1RMWeeklyRowDTO,
  ProgressOverviewDTO,
  WeeklyMuscleBalanceRowDTO,
  WeeklyStrengthVolumeRowDTO,
  WeeklyWorkoutsRowDTO,
} from './analyticsTypes'

export type ValidationResult = {
  valid: boolean
  violations: string[]
}

// ──────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────

/**
 * Matches YYYY-MM-DD and verifies the date components are real.
 * We construct the date from UTC parts and compare back, because
 * `new Date('2024-02-30T00:00:00Z')` overflows silently in V8
 * (it becomes 2024-03-01 instead of Invalid Date).
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidISODate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false
  const parts = s.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  const d = new Date(Date.UTC(year, month - 1, day))
  // If any component overflowed (e.g. Feb 30 → Mar 1), the round-trip fails
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

function isFiniteNonNeg(n: number): boolean {
  return Number.isFinite(n) && n >= 0
}

function isNonEmptyString(s: string): boolean {
  return typeof s === 'string' && s.trim().length > 0
}

// ──────────────────────────────────────────────────────────────
// DTO validators (pure functions, no side effects)
// ──────────────────────────────────────────────────────────────

/**
 * Validates a ProgressOverviewDTO for numeric coherence.
 * avg_effort is optional (null allowed) and validated to 0–10 when present.
 */
export function validateProgressOverviewDTO(dto: ProgressOverviewDTO): ValidationResult {
  const v: string[] = []

  if (!Number.isFinite(dto.range_days) || dto.range_days <= 0) {
    v.push(`range_days must be a positive finite number, got: ${dto.range_days}`)
  }
  if (!isFiniteNonNeg(dto.workouts)) {
    v.push(`workouts must be >= 0 and finite, got: ${dto.workouts}`)
  }
  if (dto.workouts_per_week !== null && !isFiniteNonNeg(dto.workouts_per_week)) {
    v.push(`workouts_per_week must be null or >= 0, got: ${dto.workouts_per_week}`)
  }
  if (dto.minutes_trained !== null && !isFiniteNonNeg(dto.minutes_trained)) {
    v.push(`minutes_trained must be null or >= 0, got: ${dto.minutes_trained}`)
  }
  if (dto.strength_volume_kg !== null && !isFiniteNonNeg(dto.strength_volume_kg)) {
    v.push(`strength_volume_kg must be null or >= 0, got: ${dto.strength_volume_kg}`)
  }
  if (dto.avg_effort !== null) {
    if (!Number.isFinite(dto.avg_effort) || dto.avg_effort < 0 || dto.avg_effort > 10) {
      v.push(`avg_effort must be null or in [0, 10], got: ${dto.avg_effort}`)
    }
  }
  if (!isFiniteNonNeg(dto.prs_count)) {
    v.push(`prs_count must be >= 0 and finite, got: ${dto.prs_count}`)
  }

  return { valid: v.length === 0, violations: v }
}

/**
 * Validates an array of WeeklyWorkoutsRowDTOs.
 * Checks user_id non-empty, week_start valid ISO date, counts non-negative.
 */
export function validateWeeklyWorkoutsRows(rows: WeeklyWorkoutsRowDTO[]): ValidationResult {
  const v: string[] = []

  for (const [i, row] of rows.entries()) {
    const p = `row[${i}]`
    if (!isNonEmptyString(row.user_id)) v.push(`${p}.user_id: expected non-empty string`)
    if (!isValidISODate(row.week_start)) {
      v.push(`${p}.week_start: invalid ISO date '${row.week_start}'`)
    }
    if (!isFiniteNonNeg(row.workouts_completed)) {
      v.push(`${p}.workouts_completed: expected >= 0, got ${row.workouts_completed}`)
    }
  }

  return { valid: v.length === 0, violations: v }
}

/**
 * Validates an array of WeeklyStrengthVolumeRowDTOs.
 * volume_kg / sets_count / reps_count must all be finite non-negative.
 */
export function validateWeeklyStrengthVolumeRows(
  rows: WeeklyStrengthVolumeRowDTO[],
): ValidationResult {
  const v: string[] = []

  for (const [i, row] of rows.entries()) {
    const p = `row[${i}]`
    if (!isNonEmptyString(row.user_id)) v.push(`${p}.user_id: expected non-empty string`)
    if (!isValidISODate(row.week_start)) {
      v.push(`${p}.week_start: invalid ISO date '${row.week_start}'`)
    }
    if (!isFiniteNonNeg(row.volume_kg)) {
      v.push(`${p}.volume_kg: expected >= 0, got ${row.volume_kg}`)
    }
    if (!isFiniteNonNeg(row.sets_count)) {
      v.push(`${p}.sets_count: expected >= 0, got ${row.sets_count}`)
    }
    if (!isFiniteNonNeg(row.reps_count)) {
      v.push(`${p}.reps_count: expected >= 0, got ${row.reps_count}`)
    }
  }

  return { valid: v.length === 0, violations: v }
}

/**
 * Validates an array of WeeklyMuscleBalanceRowDTOs.
 * muscle_key must be a non-empty string; volume_kg must be non-negative.
 */
export function validateWeeklyMuscleBalanceRows(
  rows: WeeklyMuscleBalanceRowDTO[],
): ValidationResult {
  const v: string[] = []

  for (const [i, row] of rows.entries()) {
    const p = `row[${i}]`
    if (!isNonEmptyString(row.user_id)) v.push(`${p}.user_id: expected non-empty string`)
    if (!isValidISODate(row.week_start)) {
      v.push(`${p}.week_start: invalid ISO date '${row.week_start}'`)
    }
    if (!isNonEmptyString(row.muscle_key)) {
      v.push(`${p}.muscle_key: expected non-empty string, got '${row.muscle_key}'`)
    }
    if (!isFiniteNonNeg(row.volume_kg)) {
      v.push(`${p}.volume_kg: expected >= 0, got ${row.volume_kg}`)
    }
    if (!isFiniteNonNeg(row.sets_count)) {
      v.push(`${p}.sets_count: expected >= 0, got ${row.sets_count}`)
    }
  }

  return { valid: v.length === 0, violations: v }
}

/**
 * Validates an array of ExerciseE1RMWeeklyRowDTOs.
 * best_e1rm must be > 0: the Epley formula (weight * (1 + reps/30))
 * always yields a positive value for any real lift.
 */
export function validateExerciseE1RMWeeklyRows(rows: ExerciseE1RMWeeklyRowDTO[]): ValidationResult {
  const v: string[] = []

  for (const [i, row] of rows.entries()) {
    const p = `row[${i}]`
    if (!isNonEmptyString(row.user_id)) v.push(`${p}.user_id: expected non-empty string`)
    if (!isNonEmptyString(row.exercise_definition_id)) {
      v.push(`${p}.exercise_definition_id: expected non-empty string`)
    }
    if (!isValidISODate(row.week_start)) {
      v.push(`${p}.week_start: invalid ISO date '${row.week_start}'`)
    }
    if (!Number.isFinite(row.best_e1rm) || row.best_e1rm <= 0) {
      v.push(`${p}.best_e1rm: expected > 0 (Epley formula), got ${row.best_e1rm}`)
    }
  }

  return { valid: v.length === 0, violations: v }
}

// ──────────────────────────────────────────────────────────────
// Production warning helper
// ──────────────────────────────────────────────────────────────

/**
 * Logs a console.warn for each violation in the result.
 * Never throws — analytics degradation must not crash the app.
 * Tests import validators directly to assert violation arrays.
 */
export function warnIfInvalid(result: ValidationResult, context: string): void {
  if (result.valid) return
  console.warn(
    `[analytics] DTO validation violations for "${context}":\n` +
      result.violations.map((line) => `  • ${line}`).join('\n'),
  )
}
