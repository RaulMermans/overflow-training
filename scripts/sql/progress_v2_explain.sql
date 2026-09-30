-- ============================================================
-- Progress v2 — EXPLAIN ANALYZE Queries
-- ============================================================
--
-- PURPOSE:
--   Capture query plans for the three analytics RPCs and the
--   most expensive views to catch missing-index regressions
--   and plan instability before production.
--
-- REQUIREMENTS:
--   • Run as AUTHENTICATED user (not service role) so that
--     RLS and security_invoker apply correctly.
--   • Replace <USER_ID> with the authenticated user's UUID.
--   • Enable track_io_timing in the DB before running for
--     accurate I/O measurements:
--       SET track_io_timing = on;
--
-- INTERPRETATION:
--   Target: all Seq Scans on large tables should be replaced
--   by Index Scans. Acceptable plan for workouts: Index Scan
--   on (user_id, status). Flag any Seq Scan on workouts,
--   workout_exercises, or workout_sets.
-- ============================================================

-- 0. Enable I/O timing (session-scoped, safe)
set track_io_timing = on;

-- ── RPC: rpc_progress_overview(28) ───────────────────────────────

explain (analyze, buffers, format text)
select * from analytics.rpc_progress_overview(28);

-- Expected plan notes:
--   • Index Scan on workouts using idx_workouts_user_status (user_id, status)
--   • Nested Loop or Hash Join on workout_exercises
--   • Filter on started_at range should use idx_workouts_started_at
--   • Total cost should be <50ms on a warm cache with <10k workouts

-- ── RPC: rpc_strength_lift_trend(28, '<exercise_definition_id>') ──

explain (analyze, buffers, format text)
select * from analytics.rpc_strength_lift_trend(
  28,
  'eed00001-0000-0000-0000-000000000001'  -- replace with target exercise
);

-- Expected plan notes:
--   • Index Scan on exercise_e1rm_weekly view
--   • exercise_definition_id equality filter resolved early
--   • Aggregate (max e1RM per week) without Seq Scan

-- ── RPC: rpc_muscle_balance(28) ──────────────────────────────────

explain (analyze, buffers, format text)
select * from analytics.rpc_muscle_balance(28);

-- Expected plan notes:
--   • Index Scan on exercise_definitions for primary_targets/secondary_targets
--   • GIN index on primary_targets array used if filtering by muscle group
--   • No full table scan on workout_sets (use idx_workout_sets_exercise for join)

-- ── View: weekly_workouts (baseline) ─────────────────────────────

explain (analyze, buffers, format text)
select * from analytics.weekly_workouts;

-- Expected: Index Scan on workouts (user_id predicate from RLS)
-- Flag: Seq Scan on workouts means RLS predicate not pushed down

-- ── View: weekly_strength_volume ─────────────────────────────────

explain (analyze, buffers, format text)
select * from analytics.weekly_strength_volume;

-- Expected: same as weekly_workouts; additionally, nested index scan
-- on workout_exercises and workout_sets using FK indexes

-- ── View: exercise_e1rm_weekly (all exercises) ───────────────────

explain (analyze, buffers, format text)
select * from analytics.exercise_e1rm_weekly;

-- Expected: Index Scan on workout_sets using set_index or exercise FK

-- ── View: weekly_muscle_balance ──────────────────────────────────

explain (analyze, buffers, format text)
select * from analytics.weekly_muscle_balance;

-- This is the most join-heavy view. Flag any Seq Scan cost > 100.

-- ── Index coverage check ─────────────────────────────────────────
-- Confirm the migration-027 performance indexes exist.

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_workouts_user_status',
    'idx_workouts_started_at',
    'idx_workout_exercises_workout_def',
    'idx_workout_sets_exercise'
  )
order by indexname;

-- If any of the above 4 are missing, re-apply migration-027.
