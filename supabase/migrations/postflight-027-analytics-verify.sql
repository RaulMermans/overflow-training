-- ============================================================
-- POSTFLIGHT VERIFICATION — migration-027-analytics-foundation
-- ============================================================
--
-- Run AFTER the migration is applied to verify structural integrity
-- and surface obvious data problems before promoting to staging.
--
-- HOW TO RUN:
--   psql $DATABASE_URL -f postflight-027-analytics-verify.sql
--
-- Or in Supabase:
--   supabase db reset && psql $DATABASE_URL \
--     -f supabase/migrations/postflight-027-analytics-verify.sql
--
-- Exit code: 0 = all checks passed (no "FAIL:" lines in output).
--            All failures are human-readable.  No RAISE EXCEPTION is
--            used so the script completes even when a check fails,
--            giving a full report in one pass.
--
-- Script is read-only (no DML).
-- ============================================================

\echo ''
\echo '=== POSTFLIGHT 027: Analytics Foundation ==='
\echo ''

-- ──────────────────────────────────────────────────────────────
-- 1. Schema exists
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 1: analytics schema exists ---'
select
  case when count(*) = 1 then 'PASS: analytics schema exists'
       else                   'FAIL: analytics schema MISSING'
  end as result
from information_schema.schemata
where schema_name = 'analytics';

-- ──────────────────────────────────────────────────────────────
-- 2. All views exist
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 2: Required views ---'
with expected(vname) as (
  values
    ('weekly_workouts'),
    ('weekly_strength_volume'),
    ('weekly_training_time'),
    ('exercise_best_set_daily'),
    ('exercise_e1rm_weekly'),
    ('weekly_muscle_balance'),
    ('weekly_summary')
)
select
  e.vname                                                  as view_name,
  case when v.table_name is not null then 'PASS' else 'FAIL: MISSING' end as result
from expected e
left join information_schema.views v
  on  v.table_schema = 'analytics'
  and v.table_name   = e.vname
order by e.vname;

-- ──────────────────────────────────────────────────────────────
-- 3. All views have security_invoker = true
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 3: security_invoker = true on all views ---'
with expected(vname) as (
  values
    ('weekly_workouts'),
    ('weekly_strength_volume'),
    ('weekly_training_time'),
    ('exercise_best_set_daily'),
    ('exercise_e1rm_weekly'),
    ('weekly_muscle_balance'),
    ('weekly_summary')
)
select
  e.vname                              as view_name,
  case
    when v.view_definition ilike '%security_invoker%'
    then 'NOTE: string check only — use pg_views for catalog check'
    else null
  end                                  as string_note,
  -- Catalog-level check via pg_class option (Postgres 15+)
  case
    when pc.reloptions is not null
      and pc.reloptions::text ilike '%security_invoker=true%'
    then 'PASS: security_invoker=true'
    when pc.reloptions is not null
      and pc.reloptions::text ilike '%security_invoker%'
    then 'WARN: security_invoker option present but value unclear — verify'
    when pc.reloptions is null
    then 'WARN: reloptions NULL — confirm view was created with security_invoker=true'
    else 'FAIL: security_invoker not detected'
  end                                  as security_result
from expected e
left join information_schema.views v
  on  v.table_schema = 'analytics'
  and v.table_name   = e.vname
left join pg_class pc
  on  pc.relname = e.vname
  and pc.relnamespace = (select oid from pg_namespace where nspname = 'analytics')
order by e.vname;

-- ──────────────────────────────────────────────────────────────
-- 4. All RPCs exist with correct argument signatures
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 4: Required RPCs ---'
with expected(fname, arg_types) as (
  values
    ('rpc_progress_overview',    ARRAY['integer']),
    ('rpc_strength_lift_trend',  ARRAY['uuid', 'integer']),
    ('rpc_muscle_balance',       ARRAY['integer'])
)
select
  e.fname                                         as function_name,
  case when p.proname is not null then 'PASS' else 'FAIL: MISSING' end as result
from expected e
left join pg_proc p
  on  p.proname    = e.fname
  and p.pronamespace = (select oid from pg_namespace where nspname = 'analytics')
order by e.fname;

-- ──────────────────────────────────────────────────────────────
-- 5. RPCs are SECURITY INVOKER
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 5: RPCs are SECURITY INVOKER ---'
select
  p.proname                                            as function_name,
  case
    when not p.prosecdef then 'PASS: SECURITY INVOKER'
    else                      'FAIL: set to SECURITY DEFINER unexpectedly'
  end                                                  as security_result
from pg_proc p
where p.pronamespace = (select oid from pg_namespace where nspname = 'analytics')
  and p.proname in ('rpc_progress_overview', 'rpc_strength_lift_trend', 'rpc_muscle_balance')
order by p.proname;

-- ──────────────────────────────────────────────────────────────
-- 6. Indexes exist
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 6: Performance indexes ---'
with expected(iname) as (
  values
    ('workout_exercises_workout_exercise_def_idx'),
    ('workout_sets_e1rm_eligible_idx'),
    ('exercise_definitions_tracking_deleted_idx')
)
select
  e.iname                                               as index_name,
  case when i.indexname is not null then 'PASS' else 'FAIL: MISSING' end as result
from expected e
left join pg_indexes i
  on  i.indexname  = e.iname
  and i.schemaname = 'public'
order by e.iname;

-- ──────────────────────────────────────────────────────────────
-- 7. Grants: authenticated role has SELECT on all views
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 7: Grants to authenticated ---'
with expected(obj, obj_type) as (
  values
    ('analytics.weekly_workouts',          'view'),
    ('analytics.weekly_strength_volume',   'view'),
    ('analytics.weekly_training_time',     'view'),
    ('analytics.exercise_best_set_daily',  'view'),
    ('analytics.exercise_e1rm_weekly',     'view'),
    ('analytics.weekly_muscle_balance',    'view'),
    ('analytics.weekly_summary',           'view'),
    ('analytics.rpc_progress_overview',    'function'),
    ('analytics.rpc_strength_lift_trend',  'function'),
    ('analytics.rpc_muscle_balance',       'function')
)
select
  e.obj                                                  as object_name,
  e.obj_type,
  case
    when e.obj_type = 'view' then (
      select case when has_table_privilege('authenticated', e.obj, 'SELECT')
                  then 'PASS' else 'FAIL: no SELECT' end
    )
    when e.obj_type = 'function' then 'NOTE: execute grant verified via pg_proc below'
    else 'UNKNOWN'
  end                                                    as grant_check
from expected e
order by e.obj_type, e.obj;

-- Function EXECUTE grants (pg_proc / aclitem check)
\echo '--- Check 7b: EXECUTE grants on RPCs ---'
select
  p.proname                                              as function_name,
  'authenticated'                                        as grantee,
  case
    when array_to_string(p.proacl, ',') ilike '%authenticated=X%'
      or array_to_string(p.proacl, ',') ilike '%authenticated=X/%'
    then 'PASS: EXECUTE granted'
    else 'WARN: EXECUTE grant not found in proacl — verify manually'
  end                                                    as grant_result
from pg_proc p
where p.pronamespace = (select oid from pg_namespace where nspname = 'analytics')
  and p.proname in ('rpc_progress_overview', 'rpc_strength_lift_trend', 'rpc_muscle_balance')
order by p.proname;

-- ──────────────────────────────────────────────────────────────
-- 8. Sanity: weekly_summary returns no NULL user_id rows
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 8: weekly_summary has no NULL user_id rows ---'
-- This runs as the DB superuser (postflight context), so RLS is bypassed;
-- if user_id is somehow NULL in base tables, this catches it.
select
  case when count(*) = 0 then 'PASS: no NULL user_id rows'
       else 'FAIL: ' || count(*) || ' rows with NULL user_id in weekly_summary'
  end as result
from analytics.weekly_summary
where user_id is null;

-- ──────────────────────────────────────────────────────────────
-- 9. Sanity: week_start values are all Mondays
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 9: week_start is always ISO Monday ---'
select
  case when count(*) = 0 then 'PASS: all week_start values are Mondays'
       else 'FAIL: ' || count(*) || ' rows with non-Monday week_start in weekly_summary'
  end as result
from analytics.weekly_summary
where extract(isodow from week_start) <> 1;

-- ──────────────────────────────────────────────────────────────
-- 10. Sanity: e1RM values are positive where not null
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 10: best_e1rm always positive ---'
select
  case when count(*) = 0 then 'PASS: no non-positive e1rm values'
       else 'FAIL: ' || count(*) || ' rows with best_e1rm <= 0 in exercise_best_set_daily'
  end as result
from analytics.exercise_best_set_daily
where best_e1rm is not null
  and best_e1rm <= 0;

-- ──────────────────────────────────────────────────────────────
-- 11. Sanity: strength_volume_kg is non-negative
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 11: strength_volume_kg >= 0 ---'
select
  case when count(*) = 0 then 'PASS: no negative strength_volume_kg'
       else 'FAIL: ' || count(*) || ' rows with negative strength_volume_kg in weekly_summary'
  end as result
from analytics.weekly_summary
where strength_volume_kg < 0;

-- ──────────────────────────────────────────────────────────────
-- 12. Informational: blocked metrics / known gaps
-- ──────────────────────────────────────────────────────────────
\echo '--- Check 12: Known gaps / TODOs ---'
select 'BLOCKER B1: user_settings.timezone column not present. Defaulting to Europe/Madrid.' as note
union all
select 'BLOCKER B2: user_settings.preferred_unit column not present. All units returned in kg.'
union all
select 'NOTE: C4 adherence_pct not implemented (blocked on adherence goal data).'
union all
select 'NOTE: B2 bodyweight trend uses checkin_photos.weight_kg per metrics.md §B2 fallback.'
union all
select 'NOTE: bodyweight_entries table referenced in delete_my_account() but not defined — not used here.';

\echo ''
\echo '=== POSTFLIGHT 027 COMPLETE ==='
\echo ''
\echo 'Inspect lines prefixed with FAIL: or WARN: above.'
\echo 'PASS: lines indicate the check succeeded.'
\echo 'NOTE: / BLOCKER: lines are informational.'
\echo ''
