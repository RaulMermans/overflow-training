-- Migration 020: Hard-quarantine legacy exercise tables
--
-- Before applying: run preflight-020-legacy-exercises.sql and capture results.
--
-- Scope: exercises, exercise_catalog, exercise_aliases
-- These tables were deprecated in migration-002/003 (writes revoked).
-- This migration completes the quarantine:
--   * Revokes SELECT (previously left open) from anon/authenticated/PUBLIC
--   * Enables and forces RLS (client queries blocked at engine level)
--   * Adds a service_role-only audit SELECT policy
--   * Updates deprecation comments
--
-- Does NOT drop tables — that is migration-021, applied after the beta
-- verification window (one cycle with zero blocked-access log events).
--
-- All DDL is wrapped in to_regclass guards; safe to run if any table
-- is already absent (e.g. test environments).
-- ============================================================

DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY['exercises','exercise_catalog','exercise_aliases'] LOOP
    IF to_regclass('public.' || _tbl) IS NOT NULL THEN

      -- 1. Strip all client-facing grants (idempotent)
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',        _tbl);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',          _tbl);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', _tbl);
      RAISE NOTICE 'migration-020: revoked all grants on %', _tbl;

      -- 2. Enable and force RLS
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',  _tbl);
      RAISE NOTICE 'migration-020: RLS enabled + forced on %', _tbl;

    ELSE
      RAISE NOTICE 'migration-020: % does not exist, skipping', _tbl;
    END IF;
  END LOOP;
END $$;

-- 3. Deprecation comments (individual COMMENT ON statements; not dynamic)
DO $$
BEGIN
  IF to_regclass('public.exercises') IS NOT NULL THEN
    COMMENT ON TABLE public.exercises IS
      'QUARANTINED (migration-020). Legacy table superseded by '
      'exercise_definitions + workout_exercises + workout_sets. '
      'anon/authenticated: all privileges revoked. RLS forced. '
      'service_role may SELECT for audit only. '
      'Scheduled for DROP in migration-021 after beta verification window.';
  END IF;

  IF to_regclass('public.exercise_catalog') IS NOT NULL THEN
    COMMENT ON TABLE public.exercise_catalog IS
      'QUARANTINED (migration-020). Legacy catalog superseded by exercise_definitions. '
      'anon/authenticated: all privileges revoked. RLS forced. '
      'Scheduled for DROP in migration-021.';
  END IF;

  IF to_regclass('public.exercise_aliases') IS NOT NULL THEN
    COMMENT ON TABLE public.exercise_aliases IS
      'QUARANTINED (migration-020). Legacy aliases superseded by exercise_definitions. '
      'anon/authenticated: all privileges revoked. RLS forced. '
      'Scheduled for DROP in migration-021.';
  END IF;
END $$;

-- 4. RLS policy: service_role audit SELECT only.
--    Write policies intentionally absent — INSERT/UPDATE/DELETE remain
--    denied by default for all roles including service_role.
DO $$
DECLARE
  _tbl    text;
  _policy text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY['exercises','exercise_catalog','exercise_aliases'] LOOP
    IF to_regclass('public.' || _tbl) IS NOT NULL THEN
      _policy := _tbl || '_service_read_only';

      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I', _policy, _tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO service_role USING (true)',
        _policy, _tbl
      );
      RAISE NOTICE 'migration-020: created service_role SELECT policy on %', _tbl;
    END IF;
  END LOOP;
END $$;
