-- Post-migration verification for migration-020-quarantine-exercises.sql
-- Run this in the Supabase Dashboard SQL Editor AFTER applying migration-020.
--
-- E. Grants should be empty for anon/authenticated/PUBLIC
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('exercises','exercise_catalog','exercise_aliases')
  AND grantee IN ('anon','authenticated','PUBLIC');
-- Expect: 0 rows

-- F. RLS must be enabled AND forced
SELECT relname, relrowsecurity AS rls_enabled, relforcerowsecurity AS force_rls
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('exercises','exercise_catalog','exercise_aliases');
-- Expect: rls_enabled=true, force_rls=true for each

-- G. Policies (expect exactly one per table: *_service_read_only)
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('exercises','exercise_catalog','exercise_aliases');

-- H. Simulate client denial (run as authenticated role)
--    Must throw permission denied for table exercises
SET ROLE authenticated;
SELECT count(*) FROM public.exercises;
RESET ROLE;

-- I. Confirm service_role can still SELECT
SET ROLE service_role;
SELECT count(*) FROM public.exercises;
RESET ROLE;
