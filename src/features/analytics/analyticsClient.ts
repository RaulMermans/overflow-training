// ============================================================
// Analytics Client — Phase 2
// ============================================================
//
// RESPONSIBILITIES:
//   • Raw Supabase calls to analytics schema ONLY
//   • No UI formatting, no deltas, no unit conversion
//   • Typed errors via AnalyticsClientError
//   • RLS handled implicitly (no user_id passed)
//
// SCHEMA ACCESS:
//   Supabase JS v2 supports .schema('analytics') for non-public schemas.
//   Since the generated Database type only covers the public schema,
//   we cast to `SupabaseClient<any>` to access analytics.* — all return
//   types are explicitly typed via DTOs in analyticsTypes.ts.
//
// DATE FILTERING:
//   week_start columns are ISO dates in Europe/Madrid timezone space
//   (as set by BLOCKER B1 in migration-027). Client-side filtering uses
//   UTC date arithmetic, which may differ by ≤2 hours from the backend
//   timezone. For weekly aggregates this is negligible; the first week
//   may be partially included or excluded. Documented as acceptable
//   approximation until BLOCKER B1 is resolved with per-user timezone.
//
// NAMING MAP (backend → this file):
//   analytics.rpc_progress_overview   → fetchProgressOverview
//   analytics.weekly_workouts         → fetchWeeklyWorkouts
//   analytics.weekly_strength_volume  → fetchWeeklyStrengthVolume
//   analytics.weekly_muscle_balance   → fetchMuscleBalance
//   analytics.exercise_e1rm_weekly    → fetchExerciseE1RMTrend
//
//   Also available in Phase 1 but NOT used here (view-based approach preferred):
//   analytics.rpc_strength_lift_trend → use fetchExerciseE1RMTrend instead
//   analytics.rpc_muscle_balance      → use fetchMuscleBalance instead
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js' // used in cast below
import { requireSupabase } from '../../lib/supabaseClient'
import type {
  ExerciseE1RMWeeklyRowDTO,
  ProgressOverviewDTO,
  WeeklyMuscleBalanceRowDTO,
  WeeklyStrengthVolumeRowDTO,
  WeeklyWorkoutsRowDTO,
} from './analyticsTypes'
import {
  validateExerciseE1RMWeeklyRows,
  validateProgressOverviewDTO,
  validateWeeklyMuscleBalanceRows,
  validateWeeklyStrengthVolumeRows,
  validateWeeklyWorkoutsRows,
  warnIfInvalid,
} from './analyticsValidators'

// ──────────────────────────────────────────────────────────────
// Error type
// ──────────────────────────────────────────────────────────────

export class AnalyticsClientError extends Error {
  readonly code: string | null
  readonly details: string | null
  readonly hint: string | null
  readonly status: number | null

  constructor(opts: {
    message: string
    code?: string | null
    details?: string | null
    hint?: string | null
    status?: number | null
  }) {
    super(opts.message)
    this.name = 'AnalyticsClientError'
    this.code = opts.code ?? null
    this.details = opts.details ?? null
    this.hint = opts.hint ?? null
    this.status = opts.status ?? null
  }
}

// ──────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────

/**
 * Returns the Supabase client scoped to the analytics schema.
 * We cast via any because the generated Database type does not include
 * the analytics schema — all DTOs are explicitly typed in analyticsTypes.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function analyticsDb(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (requireSupabase() as SupabaseClient<any>).schema('analytics')
}

/**
 * Lifts a Supabase error into AnalyticsClientError and throws it.
 * Call in every fetch after checking `error !== null`.
 */
// ── Analytics error code reference ────────────────────────────────────
// Supabase / Postgres codes most likely to surface here:
//   42P01  — undefined_table:  analytics view or table does not exist (schema not migrated)
//   42501  — insufficient_privilege: RLS or GRANT missing for the analytics schema
//   PGRST*  — PostgREST errors (e.g. PGRST116 = no rows matched, PGRST200 = schema not found)
//   undefined status — network / Supabase client issue before the request reached Postgres
//
// If you see 42P01 in dev, run the pending analytics migrations.
// If you see 42501, check analytics schema GRANT statements in supabase/policies.sql.
// ─────────────────────────────────────────────────────────────────────

function throwFromSupabaseError(
  error: {
    message?: string | null
    code?: string | null
    details?: string | null
    hint?: string | null
  },
  context: string,
): never {
  if (__DEV__) {
    // Log full details so developers can diagnose schema/RLS issues without guessing.
    // Not logged in production to avoid leaking internal schema names.
    console.warn(`[Analytics] ${context} failed`, {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
  }
  throw new AnalyticsClientError({
    message: error.message?.trim() || `Analytics fetch failed: ${context}`,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  })
}

/**
 * Compute the ISO Monday (YYYY-MM-DD) of the week that contains
 * (today_UTC - rangeDays + 1 days). Used as the lower bound for
 * week_start filters on analytics views.
 *
 * UTC is used because user timezone is not available on the client
 * (BLOCKER B1 in migration-027). For weekly aggregates, the difference
 * between UTC and Europe/Madrid (±1–2 h) is negligible.
 */
export function computeStartWeekMonday(rangeDays: number, now: Date = new Date()): string {
  const safe = Math.max(1, Math.floor(rangeDays))
  // Inclusive lower bound: today minus (rangeDays - 1) days
  const startMs = now.getTime() - (safe - 1) * 24 * 60 * 60 * 1000
  const startDate = new Date(startMs)
  // ISO week: Monday=1 … Sunday=0 (getUTCDay: 0=Sun, 1=Mon, …, 6=Sat)
  const dow = startDate.getUTCDay() // 0 = Sunday
  const daysToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(startDate.getTime() - daysToMonday * 24 * 60 * 60 * 1000)
  return monday.toISOString().slice(0, 10) // "YYYY-MM-DD"
}

// ──────────────────────────────────────────────────────────────
// Public fetchers
// ──────────────────────────────────────────────────────────────

/**
 * Calls analytics.rpc_progress_overview(range_days) and returns a typed DTO.
 * The RPC is SECURITY INVOKER and scopes to auth.uid() internally.
 */
export async function fetchProgressOverview(rangeDays: number): Promise<ProgressOverviewDTO> {
  const db = analyticsDb()
  const { data, error } = await db.rpc('rpc_progress_overview', { range_days: rangeDays })

  if (error) throwFromSupabaseError(error, 'rpc_progress_overview')

  // The RPC returns a single JSONB row; data is the parsed object
  const raw = data as Record<string, unknown>
  const dto: ProgressOverviewDTO = {
    range_days: Number(raw.range_days ?? rangeDays),
    workouts: Number(raw.workouts ?? 0),
    workouts_per_week: raw.workouts_per_week != null ? Number(raw.workouts_per_week) : null,
    minutes_trained: raw.minutes_trained != null ? Number(raw.minutes_trained) : null,
    strength_volume_kg: raw.strength_volume_kg != null ? Number(raw.strength_volume_kg) : null,
    avg_effort: raw.avg_effort != null ? Number(raw.avg_effort) : null,
    prs_count: Number(raw.prs_count ?? 0),
  } satisfies ProgressOverviewDTO
  warnIfInvalid(validateProgressOverviewDTO(dto), 'rpc_progress_overview')
  return dto
}

/**
 * Selects rows from analytics.weekly_workouts filtered to weeks within rangeDays.
 * Ordered by week_start ascending.
 */
export async function fetchWeeklyWorkouts(rangeDays: number): Promise<WeeklyWorkoutsRowDTO[]> {
  const startWeek = computeStartWeekMonday(rangeDays)
  const db = analyticsDb()
  const { data, error } = await db
    .from('weekly_workouts')
    .select('user_id, week_start, workouts_completed')
    .gte('week_start', startWeek)
    .order('week_start', { ascending: true })

  if (error) throwFromSupabaseError(error, 'weekly_workouts')

  const rows = ((data as WeeklyWorkoutsRowDTO[] | null) ?? []).map((row) => ({
    user_id: String(row.user_id),
    week_start: String(row.week_start),
    workouts_completed: Number(row.workouts_completed),
  }))
  warnIfInvalid(validateWeeklyWorkoutsRows(rows), 'weekly_workouts')
  return rows
}

/**
 * Selects rows from analytics.weekly_strength_volume filtered to weeks within rangeDays.
 * Ordered by week_start ascending.
 */
export async function fetchWeeklyStrengthVolume(
  rangeDays: number,
): Promise<WeeklyStrengthVolumeRowDTO[]> {
  const startWeek = computeStartWeekMonday(rangeDays)
  const db = analyticsDb()
  const { data, error } = await db
    .from('weekly_strength_volume')
    .select('user_id, week_start, volume_kg, sets_count, reps_count')
    .gte('week_start', startWeek)
    .order('week_start', { ascending: true })

  if (error) throwFromSupabaseError(error, 'weekly_strength_volume')

  const rows = ((data as WeeklyStrengthVolumeRowDTO[] | null) ?? []).map((row) => ({
    user_id: String(row.user_id),
    week_start: String(row.week_start),
    volume_kg: Number(row.volume_kg),
    sets_count: Number(row.sets_count),
    reps_count: Number(row.reps_count),
  }))
  warnIfInvalid(validateWeeklyStrengthVolumeRows(rows), 'weekly_strength_volume')
  return rows
}

/**
 * Selects rows from analytics.weekly_muscle_balance filtered to weeks within rangeDays.
 * Ordered by week_start ascending, then muscle_key for stable iteration.
 */
export async function fetchMuscleBalance(rangeDays: number): Promise<WeeklyMuscleBalanceRowDTO[]> {
  const startWeek = computeStartWeekMonday(rangeDays)
  const db = analyticsDb()
  const { data, error } = await db
    .from('weekly_muscle_balance')
    .select('user_id, week_start, muscle_key, volume_kg, sets_count')
    .gte('week_start', startWeek)
    .order('week_start', { ascending: true })
    .order('muscle_key', { ascending: true })

  if (error) throwFromSupabaseError(error, 'weekly_muscle_balance')

  const rows = ((data as WeeklyMuscleBalanceRowDTO[] | null) ?? []).map((row) => ({
    user_id: String(row.user_id),
    week_start: String(row.week_start),
    muscle_key: String(row.muscle_key),
    volume_kg: Number(row.volume_kg),
    sets_count: Number(row.sets_count),
  }))
  warnIfInvalid(validateWeeklyMuscleBalanceRows(rows), 'weekly_muscle_balance')
  return rows
}

/**
 * Selects rows from analytics.exercise_e1rm_weekly filtered to a specific exercise
 * and weeks within rangeDays. Ordered by week_start ascending.
 *
 * NOTE: analytics.rpc_strength_lift_trend also provides this data with server-side
 * date filtering, but we query the view directly to keep fetch functions uniform.
 */
export async function fetchExerciseE1RMTrend(
  exerciseDefinitionId: string,
  rangeDays: number,
): Promise<ExerciseE1RMWeeklyRowDTO[]> {
  const startWeek = computeStartWeekMonday(rangeDays)
  const db = analyticsDb()
  const { data, error } = await db
    .from('exercise_e1rm_weekly')
    .select('user_id, exercise_definition_id, week_start, best_e1rm')
    .eq('exercise_definition_id', exerciseDefinitionId)
    .gte('week_start', startWeek)
    .order('week_start', { ascending: true })

  if (error) throwFromSupabaseError(error, 'exercise_e1rm_weekly')

  const rows = ((data as ExerciseE1RMWeeklyRowDTO[] | null) ?? []).map((row) => ({
    user_id: String(row.user_id),
    exercise_definition_id: String(row.exercise_definition_id),
    week_start: String(row.week_start),
    best_e1rm: Number(row.best_e1rm),
  }))
  warnIfInvalid(validateExerciseE1RMWeeklyRows(rows), 'exercise_e1rm_weekly')
  return rows
}
