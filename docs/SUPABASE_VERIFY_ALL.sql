-- ============================================================
-- Workout Tracker iOS — Consolidated Schema Verification
-- ============================================================
-- Run this ENTIRE script in the Supabase SQL Editor (one paste, one click).
-- Each SELECT produces a separate result grid.
-- See docs/SUPABASE_VERIFY.md for expected outputs and pass criteria.
-- ============================================================


-- ============ SECTION 1: Tables exist ============
-- PASS: 6 rows (exercise_definitions, exercise_favorites, routine_favorites, workout_exercises, workout_sets, workouts)

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'exercise_definitions',
    'exercise_favorites',
    'routine_favorites',
    'workouts',
    'workout_exercises',
    'workout_sets'
  )
ORDER BY table_name;


-- ============ SECTION 2: workout_status enum ============
-- PASS: 2 rows (completed, in_progress)

SELECT e.enumlabel AS enum_value
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'workout_status'
ORDER BY e.enumsortorder;


-- ============ SECTION 3a: Columns — exercise_definitions ============
-- PASS: 18 rows; includes scope/owner/category/tracking + name_norm fields

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'exercise_definitions'
ORDER BY ordinal_position;


-- ============ SECTION 3b: Columns — workouts ============
-- PASS: 10 rows; includes client_uuid and status data_type = USER-DEFINED (the enum)

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'workouts'
ORDER BY ordinal_position;


-- ============ SECTION 3c: Columns — workout_exercises ============
-- PASS: 7 rows; includes client_uuid

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'workout_exercises'
ORDER BY ordinal_position;


-- ============ SECTION 3d: Columns — workout_sets ============
-- PASS: 12 rows; includes duration_seconds and distance_m, with nullable strength metrics

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'workout_sets'
ORDER BY ordinal_position;


-- ============ SECTION 4: RLS enabled ============
-- PASS: 4 rows, all rowsecurity = true

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'exercise_definitions',
    'workouts',
    'workout_exercises',
    'workout_sets'
  )
ORDER BY tablename;


-- ============ SECTION 5: RLS policies ============
-- PASS: 16 rows (4 for exercise_definitions, 4 each for the other 3 tables)

SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'exercise_definitions',
    'workouts',
    'workout_exercises',
    'workout_sets'
  )
ORDER BY tablename, cmd;


-- ============ SECTION 6: Check constraints ============
-- PASS: 10 rows (exercise scope/owner consistency + order/set checks + metric_presence + duration/distance nonneg + workout effort range)

SELECT conname, conrelid::regclass AS table_name
FROM pg_constraint
WHERE conrelid::regclass::text IN ('exercise_definitions', 'workout_exercises', 'workout_sets', 'workouts')
  AND contype = 'c'
ORDER BY table_name, conname;


-- ============ SECTION 6b: Legacy derivation trigger ============
-- PASS: 1 row for exercise_definitions_sync_exercise_type_trg with sync_exercise_type_from_category function

SELECT
  t.tgname AS trigger_name,
  p.proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.exercise_definitions'::regclass
  AND NOT t.tgisinternal
  AND t.tgname = 'exercise_definitions_sync_exercise_type_trg';


-- ============ SECTION 7: Indexes ============
-- PASS: 17+ rows covering PKs, unique, and performance indexes
--       including exercise_definitions_aliases_gin_idx,
--       exercise_definitions_owner_user_id_idx,
--       exercise_definitions_scope_idx,
--       exercise_definitions_category_idx,
--       exercise_definitions_tracking_mode_idx,
--       exercise_definitions_name_norm_idx,
--       exercise_definitions_primary_targets_gin_idx,
--       exercise_definitions_secondary_targets_gin_idx,
--       and exercise_definitions_exercise_type_idx

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'exercise_definitions',
    'workouts',
    'workout_exercises',
    'workout_sets'
  )
ORDER BY tablename, indexname;


-- ============ SECTION 8: Seed count ============
-- PASS: exercise_count >= 10

SELECT count(*) AS exercise_count FROM exercise_definitions;


-- ============ SECTION 9: Seed slugs ============
-- PASS: 10 known slugs (bench-press, bicep-curl, deadlift, dumbbell-bench-press,
--       dumbbell-row, incline-bench-press, lat-pulldown, overhead-press, squat,
--       tricep-pushdown)

SELECT slug FROM exercise_definitions ORDER BY slug;


-- ============ SECTION 10: Legacy table status ============
-- PASS: 0 rows (no legacy tables), OR all listed tables have deprecation comments
-- If tables exist, they should have 'DEPRECATED' in their comment

SELECT
  c.relname AS table_name,
  d.description AS table_comment,
  CASE
    WHEN d.description ILIKE '%deprecated%' THEN 'DEPRECATED (ok)'
    ELSE 'NOT DEPRECATED (review needed)'
  END AS status
FROM pg_class c
LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('exercise_catalog', 'exercise_aliases', 'exercises')
  AND c.relkind = 'r'
ORDER BY c.relname;


-- ============ SECTION 11: FK integrity for exercise_definition_id ============
-- PASS: 0 orphan rows (all exercise_definition_id values reference valid exercise_definitions)

SELECT count(*) AS orphan_exercise_refs
FROM workout_exercises we
WHERE we.exercise_definition_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM exercise_definitions ed WHERE ed.id = we.exercise_definition_id
  );


-- ============ SECTION 12: workouts.title status ============
-- PASS: 0 rows (title column does not exist) OR is_nullable = 'YES'

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workouts'
  AND column_name = 'title';


-- ============ SECTION 13: updated_at triggers ============
-- PASS: 7 rows (touch_updated_at on routines, routine_items, plans, plan_days,
--       user_settings, checkin_photos, exercise_definitions)

SELECT t.tgname AS trigger_name
FROM pg_trigger t
WHERE t.tgrelid IN (
  'public.routines'::regclass,
  'public.routine_items'::regclass,
  'public.plans'::regclass,
  'public.plan_days'::regclass,
  'public.user_settings'::regclass,
  'public.checkin_photos'::regclass,
  'public.exercise_definitions'::regclass
)
AND NOT t.tgisinternal
AND t.tgname LIKE '%touch_updated_at'
ORDER BY t.tgname;


-- ============ SECTION 14: plans one-active-per-user index ============
-- PASS: 1 row (plans_one_active_per_user partial unique index)

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'plans'
  AND indexname = 'plans_one_active_per_user';


-- ============ SECTION 15a: execution ordering uniqueness (indexes) ============
-- PASS: 2 rows (workout_exercises_order_unique, workout_sets_set_unique)

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    (tablename = 'workout_exercises' AND indexname = 'workout_exercises_order_unique')
    OR (tablename = 'workout_sets' AND indexname = 'workout_sets_set_unique')
  )
ORDER BY tablename, indexname;


-- ============ SECTION 15b: weight consistency constraint ============
-- PASS: 1 row (workout_sets_weight_consistency)

SELECT conname
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid = 'public.workout_sets'::regclass
  AND conname = 'workout_sets_weight_consistency';


-- ============ SECTION 16: activate_plan RPC ============
-- PASS: 1 row (activate_plan function exists)

SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'activate_plan';


-- ============ SECTION 17: Performance indexes (migration-025) ============
-- PASS: 3 rows (workouts_user_started_at_desc, routines_user_updated_at_desc, plans_user_active_updated_at_desc)

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'workouts_user_started_at_desc',
    'routines_user_updated_at_desc',
    'plans_user_active_updated_at_desc'
  )
ORDER BY indexname;


-- ============ SECTION 18: RLS policy expression optimization (migration-025) ============
-- PASS: All hot-table policies use (select auth.uid()) in USING/with_check
-- qual and with_check are pg_policies columns; policies without with_check show null

SELECT schemaname, tablename, policyname,
       (qual IS NOT NULL AND qual::text LIKE '%auth.uid()%') AS uses_select_auth_uid_in_using,
       (with_check IS NOT NULL AND with_check::text LIKE '%auth.uid()%') AS uses_select_auth_uid_in_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('workouts', 'routines', 'plans', 'user_settings', 'exercise_definitions')
ORDER BY tablename, policyname;


-- ============ SECTION 19: Sync diagnostic RPCs exist ============
-- PASS: 4 rows
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('rpc_whoami','rpc_sync_health','rpc_user_last_changed','rpc_policy_audit')
order by p.proname;
