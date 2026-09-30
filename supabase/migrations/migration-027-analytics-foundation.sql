-- ============================================================
-- MIGRATION 027: Analytics Foundation — Phase 1
-- ============================================================
--
-- Purpose: Build a read-optimised analytics surface (schema, views, RPCs,
-- indexes) that powers the Progress tab without touching canonical
-- execution / planning tables.
--
-- ─────────────────────────────────────────────────────────────
-- PHASE 1.0 — SCHEMA PRECONDITIONS (verified against schema.sql)
-- ─────────────────────────────────────────────────────────────
--
-- ✅ workouts           : user_id, started_at, ended_at, status, effort_rating, updated_at
-- ✅ workout_exercises  : workout_id, exercise_definition_id, updated_at
-- ✅ workout_sets       : workout_exercise_id, reps, weight, weight_kg,
--                        is_completed, set_type, updated_at
-- ✅ exercise_definitions: id, muscle_group (nullable text),
--                         tracking_mode, category,
--                         primary_targets text[], secondary_targets text[],
--                         deleted_at
--
-- ⚠️ BLOCKER B1: user_settings.timezone DOES NOT EXIST (confirmed in
--    docs/analytics/time_windows.md §3 "Contract Gap").
--    Resolution: hard-code 'Europe/Madrid' everywhere in this migration.
--    All views and RPCs emit a comment referencing this blocker.
--    TODO: add `timezone text not null default 'Europe/Madrid'` to
--    user_settings once approved, then update the constant below.
--
-- ⚠️ BLOCKER B2: user_settings.preferred_unit DOES NOT EXIST.
--    Resolution: all volumes / weights stored and returned in kg.
--    Unit conversion is the UI layer's responsibility.
--
-- Warmup sets INCLUDED in strength volume per metrics.md §S1 edge cases.
-- All set_type values ('normal','warmup','drop','failure') are included.
--
-- ─────────────────────────────────────────────────────────────
-- SECURITY MODEL
-- ─────────────────────────────────────────────────────────────
-- Views   : security_invoker = true (Postgres 15+).
--           Queries run under the calling user's credentials.
--           Base-table RLS (workouts/workout_exercises/workout_sets) applies
--           automatically.  No cross-user data can leak through these views.
-- RPCs    : SECURITY INVOKER (explicit).  Uses auth.uid() for isolation.
-- Grants  : SELECT on analytics views / EXECUTE on analytics functions
--           granted to `authenticated` only.  No `anon` grants (all workout
--           data is private).
--
-- ─────────────────────────────────────────────────────────────
-- NAMING CONVENTIONS (analytics schema)
-- ─────────────────────────────────────────────────────────────
-- • Time-series views keyed by (user_id uuid, week_start date).
-- • week_start  = ISO Monday (Postgres date_trunc('week') is Monday-based).
-- • period_start is an inclusive lower bound (user-local date).
-- • Strength volume always stored in kg.
-- • Training duration in minutes (numeric).
-- • No base-table denormalisation; views join on demand.
--
-- ─────────────────────────────────────────────────────────────
-- LOCAL VALIDATION (Phase 1.6)
-- ─────────────────────────────────────────────────────────────
-- Apply:
--   supabase db reset   -- or npx supabase db push
--
-- Spot-check views (replace <uid> with a real user UUID):
--   select * from analytics.weekly_summary
--     where user_id = '<uid>'
--     order by week_start desc limit 8;
--
--   select analytics.rpc_progress_overview(28);
--
--   select * from analytics.rpc_strength_lift_trend(
--     '<exercise_definition_id>', 365);
--
-- Index usage check:
--   explain (analyze, buffers)
--   select * from analytics.weekly_strength_volume
--   where user_id = '<uid>'
--   order by week_start desc limit 4;
--
--   (Expect: Index Scan on workouts_completed_user_started_at_idx)
-- ============================================================


-- ============================================================
-- PHASE 1.1 — SCHEMA + GRANTS
-- ============================================================

create schema if not exists analytics;

-- Grant schema usage; no object-level access yet (granted per view/function below).
-- Repo convention: `authenticated` only; no anon (private data).
grant usage on schema analytics to authenticated;


-- ============================================================
-- PHASE 1.2 — VIEWS
-- ============================================================
-- All views:
--   • WITH (security_invoker = true)  → base-table RLS enforced
--   • Stable columns documented; do not remove or rename
--   • Filters follow metrics.md Global Conventions G1–G7
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- A) analytics.weekly_workouts
--    Metric: C1 (workouts completed, by ISO week, user-local tz)
--    Columns: user_id, week_start, workouts_completed
-- ──────────────────────────────────────────────────────────────
-- BLOCKER B1: timezone hard-coded to 'Europe/Madrid'.
create or replace view analytics.weekly_workouts
  with (security_invoker = true)
as
select
  w.user_id,
  -- G3: canonical workout timestamp anchor
  -- G4: bucket into user-local ISO week (Monday)
  date_trunc(
    'week',
    coalesce(w.started_at, w.ended_at, w.created_at)
      at time zone 'Europe/Madrid'  -- BLOCKER B1
  )::date                                          as week_start,
  count(distinct w.id)::bigint                     as workouts_completed
from public.workouts w
where w.status = 'completed'  -- G1
group by
  w.user_id,
  date_trunc(
    'week',
    coalesce(w.started_at, w.ended_at, w.created_at)
      at time zone 'Europe/Madrid'
  )::date;

grant select on analytics.weekly_workouts to authenticated;

-- ──────────────────────────────────────────────────────────────
-- B) analytics.weekly_strength_volume
--    Metrics: S1 (volume_kg), S2 (sets_count), reps_count
--    Columns: user_id, week_start, volume_kg, sets_count, reps_count
--
--    volume_kg  (S1): sum of weight_kg * reps for strength sets where
--                     BOTH weight and reps are non-null and weight >= 0.
--    sets_count (S2): count of ALL completed strength sets
--                     (regardless of weight; reps_only contributes 0 vol).
--    reps_count     : total reps (informational, for future UI use).
--
--    Warmup sets: INCLUDED per metrics.md §S1 "set_type='warmup': included".
-- ──────────────────────────────────────────────────────────────
create or replace view analytics.weekly_strength_volume
  with (security_invoker = true)
as
select
  w.user_id,
  date_trunc(
    'week',
    coalesce(w.started_at, w.ended_at, w.created_at)
      at time zone 'Europe/Madrid'  -- BLOCKER B1
  )::date                                                      as week_start,
  -- S1: volume only when weight and reps are valid
  coalesce(
    sum(
      case
        when ws.reps is not null
          and ws.reps > 0
          and coalesce(ws.weight_kg, ws.weight) is not null
          and coalesce(ws.weight_kg, ws.weight) >= 0
        then coalesce(ws.weight_kg, ws.weight) * ws.reps::numeric
        else 0
      end
    ), 0
  )::numeric                                                   as volume_kg,
  -- S2: every strength set that is completed
  count(ws.id)::bigint                                         as sets_count,
  -- informational
  coalesce(sum(case when ws.reps is not null then ws.reps else 0 end), 0)::bigint as reps_count
from public.workouts w
join public.workout_exercises we  on we.workout_id = w.id
join public.workout_sets ws       on ws.workout_exercise_id = we.id
join public.exercise_definitions ed on ed.id = we.exercise_definition_id
where w.status = 'completed'                          -- G1
  and ws.is_completed is not false                    -- G2
  and ed.tracking_mode in ('weight_reps', 'reps_only') -- G7 strength modality
  and ed.deleted_at is null                            -- G6
group by
  w.user_id,
  date_trunc(
    'week',
    coalesce(w.started_at, w.ended_at, w.created_at)
      at time zone 'Europe/Madrid'
  )::date;

grant select on analytics.weekly_strength_volume to authenticated;

-- ──────────────────────────────────────────────────────────────
-- C) analytics.weekly_training_time
--    Columns: user_id, week_start, minutes_trained, avg_effort
--
--    minutes_trained: sum of workout durations (ended_at - started_at) in
--                     minutes, only when ended_at is not null and
--                     ended_at >= started_at (guards bad clock data).
--    avg_effort     : avg(effort_rating) per week; NULL when no ratings.
--                     effort_rating exists on workouts (int, nullable).
-- ──────────────────────────────────────────────────────────────
create or replace view analytics.weekly_training_time
  with (security_invoker = true)
as
select
  w.user_id,
  date_trunc(
    'week',
    coalesce(w.started_at, w.ended_at, w.created_at)
      at time zone 'Europe/Madrid'  -- BLOCKER B1
  )::date                                                       as week_start,
  coalesce(
    sum(
      case
        when w.ended_at is not null
          and w.ended_at >= w.started_at
        then extract(epoch from (w.ended_at - w.started_at)) / 60.0
        else null
      end
    ), 0
  )::numeric                                                    as minutes_trained,
  -- effort_rating is nullable; avg returns null when all are null
  avg(w.effort_rating)::numeric                                 as avg_effort
from public.workouts w
where w.status = 'completed'  -- G1
group by
  w.user_id,
  date_trunc(
    'week',
    coalesce(w.started_at, w.ended_at, w.created_at)
      at time zone 'Europe/Madrid'
  )::date;

grant select on analytics.weekly_training_time to authenticated;

-- ──────────────────────────────────────────────────────────────
-- D) analytics.exercise_best_set_daily
--    Metric: S3/S4 input (all-time; RPCs filter to date range)
--    Columns: user_id, exercise_definition_id, day, best_weight_kg,
--             best_reps, best_e1rm
--
--    e1RM formula: Epley — weight * (1 + reps / 30.0)
--    Constraints (ADR-AN-002):
--      reps BETWEEN 1 AND 36
--      COALESCE(weight_kg, weight) > 0
--    Tie-breaking (best set per user/exercise/day):
--      1) best_e1rm desc, 2) weight desc, 3) reps desc, 4) updated_at desc
-- ──────────────────────────────────────────────────────────────
create or replace view analytics.exercise_best_set_daily
  with (security_invoker = true)
as
with set_with_e1rm as (
  select
    w.user_id,
    we.exercise_definition_id,
    -- G3+G4: user-local day anchor
    (coalesce(w.started_at, w.ended_at, w.created_at)
      at time zone 'Europe/Madrid')::date                      as day, -- BLOCKER B1
    coalesce(ws.weight_kg, ws.weight)                          as best_weight_kg,  -- G5
    ws.reps                                                    as best_reps,
    -- ADR-AN-002: Epley e1RM
    coalesce(ws.weight_kg, ws.weight)
      * (1.0 + ws.reps::numeric / 30.0)                       as e1rm_raw,
    ws.updated_at,
    -- Rank sets: best e1RM first within (user, exercise, day)
    row_number() over (
      partition by
        w.user_id,
        we.exercise_definition_id,
        (coalesce(w.started_at, w.ended_at, w.created_at)
          at time zone 'Europe/Madrid')::date
      order by
        coalesce(ws.weight_kg, ws.weight)
          * (1.0 + ws.reps::numeric / 30.0) desc nulls last,  -- 1) best e1RM
        coalesce(ws.weight_kg, ws.weight) desc nulls last,     -- 2) heavier weight
        ws.reps desc nulls last,                               -- 3) more reps
        ws.updated_at desc nulls last                          -- 4) most recent
    ) as rn
  from public.workouts w
  join public.workout_exercises we  on we.workout_id = w.id
  join public.workout_sets ws       on ws.workout_exercise_id = we.id
  join public.exercise_definitions ed on ed.id = we.exercise_definition_id
  where w.status = 'completed'                           -- G1
    and ws.is_completed is not false                     -- G2
    and ed.tracking_mode in ('weight_reps', 'reps_only') -- G7
    and ed.deleted_at is null                             -- G6
    -- ADR-AN-002 validity constraints
    and ws.reps between 1 and 36
    and coalesce(ws.weight_kg, ws.weight) > 0
)
select
  user_id,
  exercise_definition_id,
  day,
  best_weight_kg,
  best_reps,
  round(e1rm_raw::numeric, 1)  as best_e1rm
from set_with_e1rm
where rn = 1;

grant select on analytics.exercise_best_set_daily to authenticated;

-- ──────────────────────────────────────────────────────────────
-- E) analytics.exercise_e1rm_weekly
--    Metric: S3 (weekly best e1RM per exercise, all-time)
--    Columns: user_id, exercise_definition_id, week_start, best_e1rm
--
--    Aggregation: MAX(best_e1rm) per ISO week — weekly best per ADR-AN-002 §3.
--    NOTE: `day` in exercise_best_set_daily is already in user-local space
--    (Europe/Madrid), so casting date→timestamp then truncating to week is
--    correct without a second timezone conversion.
-- ──────────────────────────────────────────────────────────────
create or replace view analytics.exercise_e1rm_weekly
  with (security_invoker = true)
as
select
  user_id,
  exercise_definition_id,
  date_trunc('week', day::timestamp)::date  as week_start,
  round(max(best_e1rm)::numeric, 1)         as best_e1rm
from analytics.exercise_best_set_daily
group by
  user_id,
  exercise_definition_id,
  date_trunc('week', day::timestamp)::date;

grant select on analytics.exercise_e1rm_weekly to authenticated;

-- ──────────────────────────────────────────────────────────────
-- F) analytics.weekly_muscle_balance
--    Metric: B1 (muscle group volume distribution, by ISO week)
--    Columns: user_id, week_start, muscle_key, volume_kg, sets_count
--
--    Attribution (ADR-AN-003):
--      70% of set volume → primary_targets (split equally among them)
--      30% of set volume → secondary_targets (split equally)
--      Fallback: if both arrays empty → use muscle_group (100%); or 'Unknown'.
--
--    PLAN CONFLICT NOTE: Phase 1 task spec suggested "Option A" (muscle_group only).
--    Repo docs (ADR-AN-003, metrics.md §B1) require 70/30 primary/secondary split.
--    Per conflict-resolution rule ("prefer repo docs"), full ADR-AN-003 is
--    implemented here. Option A (muscle_group only) is NOT used.
--
--    sets_count: counts each set once (primary attribution only + fallback),
--    to avoid inflating the count via secondary targets.
--
--    reps_only exercises: COALESCE(ws.reps, 1) per metrics.md §B1.
-- ──────────────────────────────────────────────────────────────
create or replace view analytics.weekly_muscle_balance
  with (security_invoker = true)
as
with strength_sets as (
  select
    w.user_id,
    date_trunc(
      'week',
      coalesce(w.started_at, w.ended_at, w.created_at)
        at time zone 'Europe/Madrid'  -- BLOCKER B1
    )::date                                                as week_start,
    coalesce(ws.weight_kg, ws.weight)                      as w_kg,  -- G5
    coalesce(ws.reps, 1)::numeric                          as reps,   -- B1 reps_only rule
    ed.primary_targets,
    ed.secondary_targets,
    ed.muscle_group
  from public.workouts w
  join public.workout_exercises we  on we.workout_id = w.id
  join public.workout_sets ws       on ws.workout_exercise_id = we.id
  join public.exercise_definitions ed on ed.id = we.exercise_definition_id
  where w.status = 'completed'                           -- G1
    and ws.is_completed is not false                     -- G2
    and ed.tracking_mode in ('weight_reps', 'reps_only') -- G7
    and ed.deleted_at is null                             -- G6
),
-- 70% of volume to primary targets (split equally)
primary_contrib as (
  select
    s.user_id,
    s.week_start,
    unnest(s.primary_targets)                              as muscle_key,
    0.70 * coalesce(s.w_kg, 0) * s.reps
      / nullif(cardinality(s.primary_targets), 0)         as load,
    1::bigint                                              as set_unit  -- count each set once
  from strength_sets s
  where cardinality(s.primary_targets) > 0
),
-- 30% of volume to secondary targets (split equally); sets not counted again
secondary_contrib as (
  select
    s.user_id,
    s.week_start,
    unnest(s.secondary_targets)                            as muscle_key,
    0.30 * coalesce(s.w_kg, 0) * s.reps
      / nullif(cardinality(s.secondary_targets), 0)       as load,
    0::bigint                                              as set_unit  -- avoid double-count
  from strength_sets s
  where cardinality(s.secondary_targets) > 0
),
-- Fallback: exercise has no targets → use muscle_group or 'Unknown'
-- ADR-AN-003 §3: when primary empty but secondary non-empty, treat secondary as primary
-- (this handles the edge case but is rare in practice)
secondary_as_primary as (
  select
    s.user_id,
    s.week_start,
    unnest(s.secondary_targets)                            as muscle_key,
    coalesce(s.w_kg, 0) * s.reps
      / nullif(cardinality(s.secondary_targets), 0)       as load,
    1::bigint                                              as set_unit
  from strength_sets s
  where cardinality(s.primary_targets) = 0
    and cardinality(s.secondary_targets) > 0
),
fallback_contrib as (
  select
    s.user_id,
    s.week_start,
    coalesce(s.muscle_group, 'Unknown')                    as muscle_key,
    coalesce(s.w_kg, 0) * s.reps                          as load,
    1::bigint                                              as set_unit
  from strength_sets s
  where cardinality(s.primary_targets) = 0
    and cardinality(s.secondary_targets) = 0
),
all_contrib as (
  select user_id, week_start, muscle_key, load, set_unit from primary_contrib
  union all
  select user_id, week_start, muscle_key, load, set_unit from secondary_contrib
  union all
  select user_id, week_start, muscle_key, load, set_unit from secondary_as_primary
  union all
  select user_id, week_start, muscle_key, load, set_unit from fallback_contrib
)
select
  user_id,
  week_start,
  muscle_key,
  coalesce(sum(load), 0)::numeric   as volume_kg,
  sum(set_unit)::bigint             as sets_count
from all_contrib
group by user_id, week_start, muscle_key;

grant select on analytics.weekly_muscle_balance to authenticated;

-- ──────────────────────────────────────────────────────────────
-- G) analytics.weekly_summary  (core rollup — single source for UI cards)
--    Columns: user_id, week_start, workouts_completed, minutes_trained,
--             avg_effort, strength_volume_kg, strength_sets_count
--
--    weekly_workouts is the driving table (every completed workout week).
--    LEFT JOINs handle weeks with no strength data or no timed workouts.
-- ──────────────────────────────────────────────────────────────
create or replace view analytics.weekly_summary
  with (security_invoker = true)
as
select
  ww.user_id,
  ww.week_start,
  ww.workouts_completed,
  coalesce(tt.minutes_trained, 0)       as minutes_trained,
  tt.avg_effort,                         -- nullable; null = no effort ratings that week
  coalesce(sv.volume_kg, 0)             as strength_volume_kg,
  coalesce(sv.sets_count, 0)            as strength_sets_count
from analytics.weekly_workouts ww
left join analytics.weekly_training_time tt
  on  tt.user_id    = ww.user_id
  and tt.week_start = ww.week_start
left join analytics.weekly_strength_volume sv
  on  sv.user_id    = ww.user_id
  and sv.week_start = ww.week_start;

grant select on analytics.weekly_summary to authenticated;


-- ============================================================
-- PHASE 1.3 — PERFORMANCE INDEXES
-- ============================================================
-- Existing indexes in schema.sql that are already sufficient:
--   workouts_completed_user_started_at_idx  (user_id, started_at desc) WHERE status='completed'
--   workouts_user_started_at_desc           (user_id, started_at desc)
--   workout_exercises_workout_id_idx        (workout_id)
--   workout_exercises_exercise_definition_id_idx (exercise_definition_id)
--   workout_sets_workout_exercise_id_idx    (workout_exercise_id)
--
-- New indexes added below target analytics-specific join paths.
-- ============================================================

-- Supports: weekly_strength_volume, exercise_best_set_daily, weekly_muscle_balance
-- Covers the workout_exercises join path:  w.id → we.workout_id + we.exercise_definition_id
-- in a single index scan, avoiding a separate lookup on exercise_definition_id.
create index if not exists workout_exercises_workout_exercise_def_idx
  on public.workout_exercises (workout_id, exercise_definition_id);

-- Supports: exercise_best_set_daily, rpc_progress_overview (S4 PR scan)
-- Partial index: only e1RM-eligible sets (reps 1–36, is_completed not false).
-- Reduces the set scan for the window function in exercise_best_set_daily.
create index if not exists workout_sets_e1rm_eligible_idx
  on public.workout_sets (workout_exercise_id, reps, weight_kg)
  where reps between 1 and 36
    and is_completed is not false;

-- Supports: weekly_strength_volume, exercise_best_set_daily, weekly_muscle_balance
-- Covers the exercise_definitions lookup with the key filter columns together.
-- NOTE: exercise_definitions_tracking_mode_idx already exists (single col).
--       This compound index covers tracking_mode + deleted_at in one read.
create index if not exists exercise_definitions_tracking_deleted_idx
  on public.exercise_definitions (tracking_mode, deleted_at)
  where deleted_at is null;


-- ============================================================
-- PHASE 1.4 — RPCs (SECURITY INVOKER, STABLE)
-- ============================================================
-- All functions:
--   • SECURITY INVOKER — RLS enforced via auth.uid()
--   • STABLE — reads data; does not modify tables
--   • LANGUAGE sql (pure SQL, preferred for STABLE read-only functions)
--   • Timezone: 'Europe/Madrid' hard-coded (BLOCKER B1)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1) analytics.rpc_progress_overview
--    Returns compact JSON card for the Progress tab hero section.
--    range_days default 28 (= W28 per time_windows.md).
--
--    Period: [today_local - (range_days-1), today_local] inclusive.
--    (e.g., range_days=28 → last 28 days including today.)
--
--    workouts_per_week uses the simplified formula from Phase 1 spec:
--      workouts / (range_days / 7.0)
--    (differs from C2 metric which counts distinct ISO weeks;
--     for range_days=28 the results are identical when the window
--     contains exactly 4 weeks.)
--
--    prs_count (S4): full ADR-AN-002 window-function implementation.
--    All sets ever for the user are scanned to determine prev_best_e1rm.
--    For users with large history, this is the dominant cost.
--    If this becomes a performance problem, add a materialised table for
--    all-time PR tracking (Phase 2 candidate).
--
--    Sources: analytics.weekly_summary (C1, S1, training time),
--             direct set scan (S4 PR count).
-- ──────────────────────────────────────────────────────────────
create or replace function analytics.rpc_progress_overview(
  range_days int default 28
)
returns jsonb
language sql
stable
security invoker
set search_path = analytics, public, pg_temp
as $$
  with
  -- Compute user-local date boundaries (BLOCKER B1: tz hard-coded)
  period as (
    select
      (current_timestamp at time zone 'Europe/Madrid')::date             as today_local,
      (current_timestamp at time zone 'Europe/Madrid')::date
        - ((least(greatest(range_days, 1), 3650) - 1) * interval '1 day')::interval as period_start
  ),
  -- ISO week Monday for period boundaries (for joining weekly_summary)
  period_weeks as (
    select
      date_trunc('week', p.period_start::timestamp)::date  as first_week,
      p.today_local                                         as last_day,
      p.period_start,
      p.today_local                                         as period_end
    from period p
  ),
  -- Aggregate weekly_summary for the period
  -- Note: week_start is ISO Monday; we include weeks that START on or after
  -- the first ISO Monday of the period (slight over-count at the first partial
  -- week is acceptable for the overview card).
  summary_agg as (
    select
      coalesce(sum(ws.workouts_completed), 0)::int         as workouts,
      coalesce(sum(ws.minutes_trained), 0)::numeric        as minutes_trained,
      coalesce(sum(ws.strength_volume_kg), 0)::numeric     as strength_volume_kg,
      avg(nullif(ws.avg_effort, null))::numeric            as avg_effort
    from analytics.weekly_summary ws
    cross join period_weeks pw
    where ws.user_id = (select auth.uid())
      and ws.week_start >= pw.first_week
      and ws.week_start <= date_trunc('week', pw.last_day::timestamp)::date
  ),
  -- S4: PR count — window function over all-time e1RM history
  -- A set is a PR if its e1RM strictly exceeds all prior e1RMs for the
  -- same exercise. Count only PRs whose workout_ts falls in the period.
  all_e1rm as (
    select
      we.exercise_definition_id,
      coalesce(w.started_at, w.ended_at, w.created_at)     as workout_ts,
      coalesce(ws.weight_kg, ws.weight)
        * (1.0 + ws.reps::numeric / 30.0)                  as e1rm_kg
    from public.workouts w
    join public.workout_exercises we  on we.workout_id = w.id
    join public.workout_sets ws       on ws.workout_exercise_id = we.id
    join public.exercise_definitions ed on ed.id = we.exercise_definition_id
    where w.user_id = (select auth.uid())
      and w.status = 'completed'
      and ws.is_completed is not false
      and ed.tracking_mode in ('weight_reps', 'reps_only')
      and ed.deleted_at is null
      and ws.reps between 1 and 36
      and coalesce(ws.weight_kg, ws.weight) > 0
  ),
  with_prev_max as (
    select
      workout_ts,
      e1rm_kg,
      max(e1rm_kg) over (
        partition by exercise_definition_id
        order by workout_ts
        rows between unbounded preceding and 1 preceding
      ) as prev_best_e1rm
    from all_e1rm
  ),
  pr_count as (
    select count(*)::int as prs_count
    from with_prev_max
    cross join period_weeks pw
    where (prev_best_e1rm is null or e1rm_kg > prev_best_e1rm)  -- new PR condition
      and (workout_ts at time zone 'Europe/Madrid')::date
          between pw.period_start and pw.period_end
  )
  select jsonb_build_object(
    'range_days',           least(greatest(range_days, 1), 3650),
    'workouts',             sa.workouts,
    'workouts_per_week',    round((sa.workouts::numeric
                              / nullif(least(greatest(range_days, 1), 3650)::numeric / 7.0, 0)
                            )::numeric, 1),
    'minutes_trained',      round(sa.minutes_trained, 1),
    'strength_volume_kg',   round(sa.strength_volume_kg, 1),
    'avg_effort',           round(sa.avg_effort, 1),     -- null if no effort_rating data
    'prs_count',            pc.prs_count
  )
  from summary_agg sa
  cross join pr_count pc;
$$;

grant execute on function analytics.rpc_progress_overview(int) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 2) analytics.rpc_strength_lift_trend
--    Returns a weekly e1RM series for a single exercise.
--    Useful for trend charts in the exercise detail screen.
--
--    range_days default 365 (= W1Y per time_windows.md).
--    Returns rows ordered by week_start ASC; gaps (weeks with no
--    valid sets) are omitted (no NULL row emitted per metrics.md §S3).
-- ──────────────────────────────────────────────────────────────
create or replace function analytics.rpc_strength_lift_trend(
  exercise_definition_id uuid,
  range_days             int default 365
)
returns table (
  week_start date,
  best_e1rm  numeric
)
language sql
stable
security invoker
set search_path = analytics, public, pg_temp
as $$
  select
    ew.week_start,
    ew.best_e1rm
  from analytics.exercise_e1rm_weekly ew
  where ew.user_id            = (select auth.uid())
    and ew.exercise_definition_id = rpc_strength_lift_trend.exercise_definition_id
    and ew.week_start >= date_trunc(
          'week',
          (
            (current_timestamp at time zone 'Europe/Madrid')::date
              - ((least(greatest(range_days, 1), 3650) - 1) * interval '1 day')
          )::timestamp
        )::date
  order by ew.week_start asc;
$$;

grant execute on function analytics.rpc_strength_lift_trend(uuid, int) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 3) analytics.rpc_muscle_balance
--    Returns muscle group distribution for a rolling window.
--    Aggregates analytics.weekly_muscle_balance.
--
--    range_days default 28.
--    top_muscles: up to 6 muscles by volume descending.
--    distribution: full list (all muscles in the period).
--    pct: each muscle's share of total volume (guards total = 0).
-- ──────────────────────────────────────────────────────────────
create or replace function analytics.rpc_muscle_balance(
  range_days int default 28
)
returns jsonb
language sql
stable
security invoker
set search_path = analytics, public, pg_temp
as $$
  with period_start as (
    select
      date_trunc(
        'week',
        (
          (current_timestamp at time zone 'Europe/Madrid')::date
            - ((least(greatest(range_days, 1), 3650) - 1) * interval '1 day')
        )::timestamp
      )::date as first_week
  ),
  muscle_totals as (
    select
      mb.muscle_key,
      sum(mb.volume_kg)::numeric  as volume_kg
    from analytics.weekly_muscle_balance mb
    cross join period_start ps
    where mb.user_id    = (select auth.uid())
      and mb.week_start >= ps.first_week
    group by mb.muscle_key
  ),
  grand_total as (
    select coalesce(sum(volume_kg), 0) as total from muscle_totals
  ),
  with_pct as (
    select
      mt.muscle_key,
      round(mt.volume_kg, 1)                                   as volume_kg,
      round(
        mt.volume_kg / nullif((select total from grand_total), 0) * 100.0,
        1
      )                                                        as pct
    from muscle_totals mt
    order by mt.volume_kg desc
  )
  select jsonb_build_object(
    'range_days',    least(greatest(range_days, 1), 3650),
    'top_muscles',   coalesce(
                       (select jsonb_agg(
                          jsonb_build_object(
                            'muscle_key', w.muscle_key,
                            'volume_kg',  w.volume_kg,
                            'pct',        w.pct
                          )
                        )
                        from (select * from with_pct limit 6) w),
                       '[]'::jsonb
                     ),
    'distribution',  coalesce(
                       (select jsonb_agg(
                          jsonb_build_object(
                            'muscle_key', w.muscle_key,
                            'volume_kg',  w.volume_kg
                          )
                        )
                        from with_pct w),
                       '[]'::jsonb
                     )
  );
$$;

grant execute on function analytics.rpc_muscle_balance(int) to authenticated;


-- ============================================================
-- END OF MIGRATION 027
-- ============================================================
