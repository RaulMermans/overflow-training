-- ============================================================
-- Progress v2 — Smoke SQL
-- ============================================================
--
-- PURPOSE:
--   Fast sanity checks against the analytics schema after
--   migration-027 is applied. Validates view structure, data
--   types, and per-scenario row counts.
--
-- REQUIREMENTS:
--   • migration-027-analytics-foundation.sql applied
--   • progress_v2_golden_scenarios.sql seed applied (for S0–S3)
--   • Run from Supabase SQL editor with SERVICE ROLE
--
-- GREEN CRITERIA:
--   Every query labeled "-- EXPECT:" must match its annotation.
--   Any deviation is a regression.
-- ============================================================

-- ── 1. Schema & view existence ────────────────────────────────────

select count(*) as analytics_schema_exists
from pg_namespace where nspname = 'analytics';
-- EXPECT: 1

select count(*) as view_count
from pg_views
where schemaname = 'analytics'
  and viewname in (
    'weekly_workouts',
    'weekly_strength_volume',
    'weekly_training_time',
    'exercise_best_set_daily',
    'exercise_e1rm_weekly',
    'weekly_muscle_balance',
    'weekly_summary'
  );
-- EXPECT: 7

-- ── 2. security_invoker=true on all views ─────────────────────────

select viewname, 'security_invoker=true' in unnest(reloptions) as has_si
from pg_views v
join pg_class c on c.relname = v.viewname
                and c.relnamespace = (select oid from pg_namespace where nspname = 'analytics')
where v.schemaname = 'analytics'
order by viewname;
-- EXPECT: all rows has_si = true

-- ── 3. RPC existence ─────────────────────────────────────────────

select count(*) as rpc_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'analytics'
  and p.proname in (
    'rpc_progress_overview',
    'rpc_strength_lift_trend',
    'rpc_muscle_balance'
  );
-- EXPECT: 3

-- ── 4. S0: blank user — all views return 0 rows ──────────────────

select count(*) as s0_weekly_workouts
from analytics.weekly_workouts
where user_id = 'aa000000-0000-0000-0000-000000000000';
-- EXPECT: 0

select count(*) as s0_weekly_strength_volume
from analytics.weekly_strength_volume
where user_id = 'aa000000-0000-0000-0000-000000000000';
-- EXPECT: 0

select count(*) as s0_exercise_e1rm
from analytics.exercise_e1rm_weekly
where user_id = 'aa000000-0000-0000-0000-000000000000';
-- EXPECT: 0

select count(*) as s0_weekly_muscle_balance
from analytics.weekly_muscle_balance
where user_id = 'aa000000-0000-0000-0000-000000000000';
-- EXPECT: 0

-- ── 5. S1: sparse — 3 workouts across 3 distinct weeks ────────────

select count(*) as s1_weekly_workouts_rows
from analytics.weekly_workouts
where user_id = 'aa000000-0000-0000-0000-000000000001';
-- EXPECT: 3

select sum(workouts_completed) as s1_total_workouts
from analytics.weekly_workouts
where user_id = 'aa000000-0000-0000-0000-000000000001';
-- EXPECT: 3

select count(*) as s1_strength_volume_rows
from analytics.weekly_strength_volume
where user_id = 'aa000000-0000-0000-0000-000000000001';
-- EXPECT: 3

select round(sum(strength_volume_kg)::numeric, 1) as s1_total_vol
from analytics.weekly_strength_volume
where user_id = 'aa000000-0000-0000-0000-000000000001';
-- EXPECT: 4825.0

select round(sum(minutes_trained)::numeric, 1) as s1_total_mins
from analytics.weekly_training_time
where user_id = 'aa000000-0000-0000-0000-000000000001';
-- EXPECT: 165.0

-- e1RM progression for bench (2 weeks logged)
select count(*) as s1_bench_e1rm_rows
from analytics.exercise_e1rm_weekly
where user_id = 'aa000000-0000-0000-0000-000000000001'
  and exercise_definition_id = 'eed00001-0000-0000-0000-000000000001';
-- EXPECT: 2

-- bench e1RM week 1 ≈ 81.67 (70 × 1.167)
select round(best_e1rm::numeric, 2) as s1_bench_e1rm_wk1
from analytics.exercise_e1rm_weekly
where user_id = 'aa000000-0000-0000-0000-000000000001'
  and exercise_definition_id = 'eed00001-0000-0000-0000-000000000001'
  and week_start = '2026-01-19';
-- EXPECT: 81.67

-- muscle balance: 6 unique muscle keys in week 2026-01-19
select count(*) as s1_muscle_keys_wk1
from analytics.weekly_muscle_balance
where user_id = 'aa000000-0000-0000-0000-000000000001'
  and week_start = '2026-01-19';
-- EXPECT: 6

-- ── 6. S2: consistent — 10 workouts, 4 weeks ─────────────────────

select sum(workouts_completed) as s2_total_workouts
from analytics.weekly_workouts
where user_id = 'aa000000-0000-0000-0000-000000000002';
-- EXPECT: 10

select count(distinct week_start) as s2_active_weeks
from analytics.weekly_workouts
where user_id = 'aa000000-0000-0000-0000-000000000002';
-- EXPECT: 4

-- ── 7. S3: focused — 8 weeks of bench e1RM, monotone increase ─────

select count(*) as s3_bench_e1rm_rows
from analytics.exercise_e1rm_weekly
where user_id = 'aa000000-0000-0000-0000-000000000003'
  and exercise_definition_id = 'eed00001-0000-0000-0000-000000000001';
-- EXPECT: 8

-- Last e1RM should exceed first e1RM
select
  (max(best_e1rm) - min(best_e1rm)) as e1rm_gain,
  case when max(best_e1rm) > min(best_e1rm) then 'PASS' else 'FAIL' end as trend_check
from analytics.exercise_e1rm_weekly
where user_id = 'aa000000-0000-0000-0000-000000000003'
  and exercise_definition_id = 'eed00001-0000-0000-0000-000000000001';
-- EXPECT: trend_check = 'PASS', e1rm_gain > 0

-- ── 8. Data integrity ─────────────────────────────────────────────

-- No NULL user_id rows
select count(*) as null_user_id_rows
from analytics.weekly_summary
where user_id is null;
-- EXPECT: 0

-- All week_start values are Mondays (dow=1 in Postgres = Monday)
select count(*) as non_monday_week_starts
from analytics.weekly_workouts
where extract(isodow from week_start) != 1;
-- EXPECT: 0

-- No zero or negative e1RM
select count(*) as invalid_e1rm
from analytics.exercise_e1rm_weekly
where best_e1rm <= 0;
-- EXPECT: 0

-- No negative strength volume
select count(*) as negative_volume
from analytics.weekly_strength_volume
where strength_volume_kg < 0;
-- EXPECT: 0
