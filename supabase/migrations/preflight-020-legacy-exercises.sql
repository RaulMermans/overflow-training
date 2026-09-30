-- Preflight for migration-020-quarantine-exercises.sql
-- Run this in the Supabase Dashboard SQL Editor BEFORE applying migration-020.
-- Capture the results (table existence, row counts, grants, RLS status) for your records.
--
-- A. Confirm tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('exercises','exercise_catalog','exercise_aliases');

-- B. Row counts (expect low/zero for legacy tables)
SELECT 'exercises'        AS tbl, count(*) FROM public.exercises
UNION ALL
SELECT 'exercise_catalog', count(*) FROM public.exercise_catalog
UNION ALL
SELECT 'exercise_aliases', count(*) FROM public.exercise_aliases;

-- C. Current grants (expect anon/authenticated to have SELECT at minimum)
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('exercises','exercise_catalog','exercise_aliases')
ORDER BY table_name, grantee, privilege_type;

-- D. Current RLS status (expect rls_enabled=false, force_row_security=false)
SELECT relname, relrowsecurity AS rls_enabled, relforcerowsecurity AS force_rls
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('exercises','exercise_catalog','exercise_aliases');
