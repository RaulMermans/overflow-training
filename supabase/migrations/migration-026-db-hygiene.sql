-- migration-026-db-hygiene.sql
-- Purpose: capture manual DB changes (drops + hygiene) into git to prevent schema drift.
-- Usage: place in supabase/migrations/, append filename to supabase/migrations/manifest.json,
-- then align supabase/schema.sql to match the post-migration state.

/*
  This migration is written to be idempotent and safe to run in environments
  where some objects may already be absent.
*/

------------------------------------------------------------
-- 1) plan_days routine FK: make ON DELETE compatible with NOT NULL
--    (routine_id is enforced non-null; SET NULL would conflict)
------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.plan_days') IS NOT NULL THEN
    -- Drop existing FK if present
    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.plan_days'::regclass
        AND conname = 'plan_days_routine_id_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE public.plan_days DROP CONSTRAINT plan_days_routine_id_fkey';
    END IF;

    -- Recreate FK with RESTRICT semantics (default NO ACTION behaves like RESTRICT)
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.plan_days'::regclass
        AND conname = 'plan_days_routine_id_fkey'
    ) THEN
      EXECUTE '
        ALTER TABLE public.plan_days
        ADD CONSTRAINT plan_days_routine_id_fkey
        FOREIGN KEY (routine_id)
        REFERENCES public.routines(id)
        ON DELETE RESTRICT
      ';
    END IF;
  END IF;
END $$;

------------------------------------------------------------
-- 2) Timestamp triggers hygiene (remove unconditional triggers)
------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.user_settings') IS NOT NULL THEN
    -- If both existed, prefer touch_updated_at() and drop the unconditional one.
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.user_settings'::regclass
        AND tgname = 'trg_user_settings_updated_at'
        AND NOT tgisinternal
    ) THEN
      EXECUTE 'DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON public.user_settings';
    END IF;

    -- Ensure the touch trigger exists (safe if already present)
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.user_settings'::regclass
        AND tgname = 'user_settings_touch_updated_at'
        AND NOT tgisinternal
    ) THEN
      EXECUTE '
        CREATE TRIGGER user_settings_touch_updated_at
        BEFORE UPDATE ON public.user_settings
        FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()
      ';
    END IF;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    -- Remove unconditional updated_at trigger if present.
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND tgname = 'trg_profiles_updated_at'
        AND NOT tgisinternal
    ) THEN
      EXECUTE 'DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles';
    END IF;

    -- Optionally ensure profiles uses touch_updated_at (safe if it already exists)
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND tgname = 'profiles_touch_updated_at'
        AND NOT tgisinternal
    ) THEN
      EXECUTE '
        CREATE TRIGGER profiles_touch_updated_at
        BEFORE UPDATE ON public.profiles
        FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()
      ';
    END IF;
  END IF;
END $$;

------------------------------------------------------------
-- 3) Remove redundant constraints (noise + maintenance)
------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.workout_sets') IS NOT NULL THEN
    -- These two constraints were duplicates in the DB snapshot; keep only one.
    EXECUTE 'ALTER TABLE public.workout_sets DROP CONSTRAINT IF EXISTS workout_sets_has_metric_chk';
    -- (If you preferred to drop the other instead, swap the name here.)
  END IF;
END $$;

------------------------------------------------------------
-- 4) Add updated_at to execution tables + triggers (if missing)
------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.workouts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE IF EXISTS public.workouts ADD COLUMN IF NOT EXISTS updated_at timestamptz';
    EXECUTE 'UPDATE public.workouts SET updated_at = created_at WHERE updated_at IS NULL';
    EXECUTE 'ALTER TABLE public.workouts ALTER COLUMN updated_at SET DEFAULT now()';
    EXECUTE 'ALTER TABLE public.workouts ALTER COLUMN updated_at SET NOT NULL';

    EXECUTE 'DROP TRIGGER IF EXISTS workouts_touch_updated_at ON public.workouts';
    EXECUTE '
      CREATE TRIGGER workouts_touch_updated_at
      BEFORE UPDATE ON public.workouts
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()
    ';
  END IF;

  IF to_regclass('public.workout_exercises') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE IF EXISTS public.workout_exercises ADD COLUMN IF NOT EXISTS updated_at timestamptz';
    EXECUTE 'UPDATE public.workout_exercises SET updated_at = created_at WHERE updated_at IS NULL';
    EXECUTE 'ALTER TABLE public.workout_exercises ALTER COLUMN updated_at SET DEFAULT now()';
    EXECUTE 'ALTER TABLE public.workout_exercises ALTER COLUMN updated_at SET NOT NULL';

    EXECUTE 'DROP TRIGGER IF EXISTS workout_exercises_touch_updated_at ON public.workout_exercises';
    EXECUTE '
      CREATE TRIGGER workout_exercises_touch_updated_at
      BEFORE UPDATE ON public.workout_exercises
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()
    ';
  END IF;

  IF to_regclass('public.workout_sets') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE IF EXISTS public.workout_sets ADD COLUMN IF NOT EXISTS updated_at timestamptz';
    EXECUTE 'UPDATE public.workout_sets SET updated_at = created_at WHERE updated_at IS NULL';
    EXECUTE 'ALTER TABLE public.workout_sets ALTER COLUMN updated_at SET DEFAULT now()';
    EXECUTE 'ALTER TABLE public.workout_sets ALTER COLUMN updated_at SET NOT NULL';

    EXECUTE 'DROP TRIGGER IF EXISTS workout_sets_touch_updated_at ON public.workout_sets';
    EXECUTE '
      CREATE TRIGGER workout_sets_touch_updated_at
      BEFORE UPDATE ON public.workout_sets
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()
    ';
  END IF;
END $$;

------------------------------------------------------------
-- 5) Drop unused tables (goals/templates) if present
------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.workout_template_exercises') IS NOT NULL THEN
    EXECUTE 'DROP TABLE IF EXISTS public.workout_template_exercises';
  END IF;

  IF to_regclass('public.workout_templates') IS NOT NULL THEN
    EXECUTE 'DROP TABLE IF EXISTS public.workout_templates';
  END IF;

  IF to_regclass('public.goals') IS NOT NULL THEN
    EXECUTE 'DROP TABLE IF EXISTS public.goals';
  END IF;
END $$;

------------------------------------------------------------
-- 6) RLS policy hygiene
--    - Remove redundant "deny_all" permissive policies
--    - Ensure user-owned CRUD policies are TO authenticated (not public)
--    - Remove duplicate policy sets where applicable
------------------------------------------------------------
DO $$
BEGIN
  -- bodyweight_entries: drop deny policy and ensure CRUD policy is authenticated
  IF to_regclass('public.bodyweight_entries') IS NOT NULL THEN
    -- Drop redundant deny policy (PERMISSIVE false does not deny)
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='bodyweight_entries' AND policyname='deny_all_bw'
    ) THEN
      EXECUTE 'DROP POLICY IF EXISTS deny_all_bw ON public.bodyweight_entries';
    END IF;

    -- Ensure bodyweight_crud_own is authenticated
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='bodyweight_entries' AND policyname='bodyweight_crud_own'
    ) THEN
      EXECUTE 'ALTER POLICY bodyweight_crud_own ON public.bodyweight_entries TO authenticated';
    END IF;
  END IF;

  -- user_settings: keep single ALL policy (user_settings_crud_own) and ensure authenticated
  IF to_regclass('public.user_settings') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_settings' AND policyname='user_settings_crud_own'
    ) THEN
      EXECUTE 'ALTER POLICY user_settings_crud_own ON public.user_settings TO authenticated';
    END IF;

    -- Drop redundant per-command policies if they exist
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_settings' AND policyname='user_settings_insert_own'
    ) THEN
      EXECUTE 'DROP POLICY IF EXISTS user_settings_insert_own ON public.user_settings';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_settings' AND policyname='user_settings_select_own'
    ) THEN
      EXECUTE 'DROP POLICY IF EXISTS user_settings_select_own ON public.user_settings';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_settings' AND policyname='user_settings_update_own'
    ) THEN
      EXECUTE 'DROP POLICY IF EXISTS user_settings_update_own ON public.user_settings';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_settings' AND policyname='user_settings_delete_own'
    ) THEN
      EXECUTE 'DROP POLICY IF EXISTS user_settings_delete_own ON public.user_settings';
    END IF;
  END IF;
END $$;

------------------------------------------------------------
-- 7) Index dedupe (remove exact duplicates / redundant pairs)
------------------------------------------------------------
-- plans: duplicate unique (user_id, client_uuid)
DROP INDEX IF EXISTS public.plans_user_id_client_uuid_uidx;

-- routines: duplicate unique (user_id, client_uuid)
DROP INDEX IF EXISTS public.routines_user_id_client_uuid_uidx;

-- execution: non-unique duplicates of already-unique pairs
DROP INDEX IF EXISTS public.workout_exercises_workout_order_idx;
DROP INDEX IF EXISTS public.workout_sets_exercise_set_idx;

------------------------------------------------------------
-- 8) profiles: drop legacy settings columns (identity-only profiles)
------------------------------------------------------------
ALTER TABLE IF EXISTS public.profiles
  DROP COLUMN IF EXISTS preferred_unit,
  DROP COLUMN IF EXISTS experience_level,
  DROP COLUMN IF EXISTS default_rest_seconds;

-- End of migration
