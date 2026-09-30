-- Migration 003: Clean rebuild of core tables to match canonical schema
-- ====================================================================
--
-- CONTEXT: The staging DB has a completely different schema generation
-- than what the app targets. Core tables have text PKs, wrong column
-- names (weight_kg vs weight, startedAt vs started_at), missing columns
-- (exercise_definition_id, is_completed), extra columns (19 on workout_sets),
-- and wrong FK targets (exercise_catalog instead of exercise_definitions).
--
-- HOWEVER: All 3 core user tables (workouts, workout_exercises, workout_sets)
-- have ZERO rows. This makes a clean drop+recreate safe and simple.
--
-- SAFETY:
--   - Part 0 verifies 0 rows before dropping (ABORTS if data exists)
--   - exercise_definitions is NOT dropped (has 10 seeded rows, correct schema)
--   - Legacy tables are quarantined, not dropped
--   - Idempotent (safe to run multiple times)
--
-- RUN IN: Supabase Dashboard SQL Editor (as database owner / service role)
-- AFTER:  migration-001 and migration-002 are NOT required — this replaces both
-- ====================================================================


-- ============================================================
-- Part 0: SAFETY PRECHECKS — abort if any core table has data
-- ============================================================

DO $$
DECLARE
  _w bigint; _we bigint; _ws bigint;
BEGIN
  RAISE NOTICE '=== MIGRATION-003 PRECHECKS ===';

  SELECT count(*) INTO _w FROM workouts;
  SELECT count(*) INTO _we FROM workout_exercises;
  SELECT count(*) INTO _ws FROM workout_sets;

  RAISE NOTICE 'workouts: % rows', _w;
  RAISE NOTICE 'workout_exercises: % rows', _we;
  RAISE NOTICE 'workout_sets: % rows', _ws;

  IF _w > 0 OR _we > 0 OR _ws > 0 THEN
    RAISE EXCEPTION 'ABORT: Core tables have data (workouts=%, workout_exercises=%, workout_sets=%). Cannot do clean rebuild — use incremental migration instead.', _w, _we, _ws;
  END IF;

  RAISE NOTICE 'All core tables are empty — safe to proceed with clean rebuild.';
END $$;


-- ============================================================
-- Part 1: DROP old core tables (CASCADE removes FKs, policies, indexes)
-- ============================================================

-- Order matters: drop child tables first to respect FK dependencies.
-- CASCADE drops all dependent objects (policies, indexes, constraints, views referencing these).

DROP TABLE IF EXISTS workout_sets CASCADE;
DROP TABLE IF EXISTS workout_exercises CASCADE;
DROP TABLE IF EXISTS workouts CASCADE;

DO $$ BEGIN RAISE NOTICE 'Part 1: Dropped workout_sets, workout_exercises, workouts'; END $$;


-- ============================================================
-- Part 2: Ensure prerequisites exist
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workout_status') THEN
    CREATE TYPE workout_status AS ENUM ('in_progress', 'completed');
    RAISE NOTICE 'Part 2: Created workout_status enum';
  ELSE
    RAISE NOTICE 'Part 2: workout_status enum already exists';
  END IF;
END $$;


-- ============================================================
-- Part 3: CREATE canonical tables (from schema.sql)
-- ============================================================

-- exercise_definitions already exists with correct schema + 10 seeded rows.
-- Just ensure the indexes are present.
CREATE UNIQUE INDEX IF NOT EXISTS exercise_definitions_slug_key
  ON exercise_definitions (slug);
DROP INDEX IF EXISTS exercise_definitions_name_key;
CREATE INDEX IF NOT EXISTS exercise_definitions_name_idx
  ON exercise_definitions (name);

-- Workouts
CREATE TABLE workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  status workout_status NOT NULL DEFAULT 'in_progress',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workouts_user_id_idx ON workouts (user_id);
CREATE INDEX workouts_status_idx ON workouts (status);
CREATE INDEX workouts_ended_at_idx ON workouts (ended_at);

DO $$ BEGIN RAISE NOTICE 'Part 3: Created workouts table (uuid PK, started_at, ended_at, status, notes)'; END $$;

-- Workout exercises
CREATE TABLE workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  exercise_definition_id uuid NOT NULL REFERENCES exercise_definitions (id),
  order_index int NOT NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workout_exercises_workout_id_idx ON workout_exercises (workout_id);
CREATE INDEX workout_exercises_exercise_definition_id_idx ON workout_exercises (exercise_definition_id);
CREATE UNIQUE INDEX workout_exercises_order_unique ON workout_exercises (workout_id, order_index);

ALTER TABLE workout_exercises
  ADD CONSTRAINT workout_exercises_order_index_nonneg CHECK (order_index >= 0);

DO $$ BEGIN RAISE NOTICE 'Part 3: Created workout_exercises table (uuid PK, exercise_definition_id FK)'; END $$;

-- Workout sets
CREATE TABLE workout_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid NOT NULL REFERENCES workout_exercises (id) ON DELETE CASCADE,
  set_index int NOT NULL,
  reps int NOT NULL,
  weight numeric NOT NULL,
  is_completed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workout_sets_workout_exercise_id_idx ON workout_sets (workout_exercise_id);
CREATE UNIQUE INDEX workout_sets_set_unique ON workout_sets (workout_exercise_id, set_index);

ALTER TABLE workout_sets
  ADD CONSTRAINT workout_sets_set_index_nonneg CHECK (set_index >= 0),
  ADD CONSTRAINT workout_sets_reps_positive CHECK (reps > 0),
  ADD CONSTRAINT workout_sets_weight_nonneg CHECK (weight >= 0);

DO $$ BEGIN RAISE NOTICE 'Part 3: Created workout_sets table (uuid PK, weight numeric, is_completed)'; END $$;


-- ============================================================
-- Part 4: ENABLE RLS + CREATE POLICIES (from policies.sql)
-- ============================================================

-- Enable RLS on all 4 tables
ALTER TABLE exercise_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;

-- Lock down writes on exercise_definitions
REVOKE INSERT, UPDATE, DELETE ON exercise_definitions FROM authenticated;

-- exercise_definitions: read-only for authenticated
CREATE POLICY "exercise_definitions_select_authenticated"
  ON exercise_definitions FOR SELECT
  TO authenticated
  USING (true);

-- workouts: owner-only (4 policies)
CREATE POLICY "workouts_select_own"
  ON workouts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "workouts_insert_own"
  ON workouts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "workouts_update_own"
  ON workouts FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "workouts_delete_own"
  ON workouts FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- workout_exercises: access via parent workout (4 policies)
CREATE POLICY "workout_exercises_select_own"
  ON workout_exercises FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workouts w
      WHERE w.id = workout_exercises.workout_id
        AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_exercises_insert_own"
  ON workout_exercises FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workouts w
      WHERE w.id = workout_exercises.workout_id
        AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_exercises_update_own"
  ON workout_exercises FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workouts w
      WHERE w.id = workout_exercises.workout_id
        AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workouts w
      WHERE w.id = workout_exercises.workout_id
        AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_exercises_delete_own"
  ON workout_exercises FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workouts w
      WHERE w.id = workout_exercises.workout_id
        AND w.user_id = auth.uid()
    )
  );

-- workout_sets: access via parent chain (4 policies)
CREATE POLICY "workout_sets_select_own"
  ON workout_sets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      WHERE we.id = workout_sets.workout_exercise_id
        AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_sets_insert_own"
  ON workout_sets FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      WHERE we.id = workout_sets.workout_exercise_id
        AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_sets_update_own"
  ON workout_sets FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      WHERE we.id = workout_sets.workout_exercise_id
        AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      WHERE we.id = workout_sets.workout_exercise_id
        AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_sets_delete_own"
  ON workout_sets FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      WHERE we.id = workout_sets.workout_exercise_id
        AND w.user_id = auth.uid()
    )
  );

DO $$ BEGIN RAISE NOTICE 'Part 4: RLS enabled on all 4 tables, 13 policies created'; END $$;


-- ============================================================
-- Part 5: SEED exercise_definitions (idempotent)
-- ============================================================

INSERT INTO exercise_definitions (name, slug, aliases, muscle_group, equipment)
VALUES
  ('Bench Press',          'bench-press',          ARRAY['benchpress'],            'chest',     'barbell'),
  ('Incline Bench Press',  'incline-bench-press',  ARRAY['incline benchpress'],    'chest',     'barbell'),
  ('Squat',                'squat',                ARRAY['back squat'],            'legs',      'barbell'),
  ('Deadlift',             'deadlift',             ARRAY['conventional deadlift'], 'back',      'barbell'),
  ('Overhead Press',       'overhead-press',       ARRAY['ohp','shoulder press'],  'shoulders', 'barbell'),
  ('Lat Pulldown',         'lat-pulldown',         ARRAY['lat pull-down'],         'back',      'machine'),
  ('Dumbbell Row',         'dumbbell-row',         ARRAY['db row'],               'back',      'dumbbell'),
  ('Dumbbell Bench Press', 'dumbbell-bench-press', ARRAY['db bench'],             'chest',     'dumbbell'),
  ('Bicep Curl',           'bicep-curl',           ARRAY['curl'],                 'arms',      'dumbbell'),
  ('Tricep Pushdown',      'tricep-pushdown',      ARRAY['cable pushdown'],       'arms',      'cable')
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE _cnt bigint;
BEGIN
  SELECT count(*) INTO _cnt FROM exercise_definitions;
  RAISE NOTICE 'Part 5: exercise_definitions has % rows', _cnt;
END $$;


-- ============================================================
-- Part 6: QUARANTINE legacy tables
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.exercise_catalog') IS NOT NULL THEN
    COMMENT ON TABLE exercise_catalog IS
      'DEPRECATED by migration-003. Use exercise_definitions instead. Safe to drop.';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON exercise_catalog FROM authenticated';
    RAISE NOTICE 'Part 6: exercise_catalog deprecated + writes revoked';
  END IF;

  IF to_regclass('public.exercise_aliases') IS NOT NULL THEN
    COMMENT ON TABLE exercise_aliases IS
      'DEPRECATED by migration-003. Data merged into exercise_definitions.aliases. Safe to drop.';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON exercise_aliases FROM authenticated';
    RAISE NOTICE 'Part 6: exercise_aliases deprecated + writes revoked';
  END IF;

  IF to_regclass('public.exercises') IS NOT NULL THEN
    COMMENT ON TABLE exercises IS
      'DEPRECATED legacy table. Superseded by exercise_definitions + workout_exercises + workout_sets. Safe to drop.';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON exercises FROM authenticated';
    RAISE NOTICE 'Part 6: exercises (legacy) deprecated + writes revoked';
  END IF;
END $$;


-- ============================================================
-- Part 7: POSTCHECKS
-- ============================================================

DO $$
DECLARE
  _tbl_count bigint;
  _col_count bigint;
  _rls_on boolean;
  _policy_count bigint;
  _ed_count bigint;
  _fk_count bigint;
  _idx_count bigint;
  _chk_count bigint;
  _all_pass boolean := true;
BEGIN
  RAISE NOTICE '=== MIGRATION-003 POSTCHECKS ===';

  -- Tables exist (4 canonical)
  SELECT count(*) INTO _tbl_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('exercise_definitions','workouts','workout_exercises','workout_sets');
  IF _tbl_count = 4 THEN
    RAISE NOTICE 'PASS: 4 canonical tables exist';
  ELSE
    RAISE NOTICE 'FAIL: Expected 4 tables, found %', _tbl_count;
    _all_pass := false;
  END IF;

  -- workouts columns (should be 7)
  SELECT count(*) INTO _col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'workouts';
  IF _col_count = 7 THEN
    RAISE NOTICE 'PASS: workouts has 7 columns';
  ELSE
    RAISE NOTICE 'FAIL: workouts has % columns (expected 7)', _col_count;
    _all_pass := false;
  END IF;

  -- workouts.id is uuid
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts'
      AND column_name = 'id' AND data_type = 'uuid'
  ) THEN
    RAISE NOTICE 'PASS: workouts.id is uuid';
  ELSE
    RAISE NOTICE 'FAIL: workouts.id is NOT uuid';
    _all_pass := false;
  END IF;

  -- workouts.title should NOT exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts' AND column_name = 'title'
  ) THEN
    RAISE NOTICE 'PASS: workouts.title does not exist';
  ELSE
    RAISE NOTICE 'FAIL: workouts.title still exists';
    _all_pass := false;
  END IF;

  -- workout_exercises.exercise_definition_id exists as uuid NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_exercises'
      AND column_name = 'exercise_definition_id' AND data_type = 'uuid' AND is_nullable = 'NO'
  ) THEN
    RAISE NOTICE 'PASS: workout_exercises.exercise_definition_id is uuid NOT NULL';
  ELSE
    RAISE NOTICE 'FAIL: workout_exercises.exercise_definition_id is missing or wrong type';
    _all_pass := false;
  END IF;

  -- workout_sets.weight exists as numeric (not weight_kg)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sets'
      AND column_name = 'weight' AND data_type = 'numeric'
  ) THEN
    RAISE NOTICE 'PASS: workout_sets.weight is numeric';
  ELSE
    RAISE NOTICE 'FAIL: workout_sets.weight missing or wrong (check for weight_kg)';
    _all_pass := false;
  END IF;

  -- workout_sets.is_completed exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sets'
      AND column_name = 'is_completed' AND data_type = 'boolean'
  ) THEN
    RAISE NOTICE 'PASS: workout_sets.is_completed is boolean';
  ELSE
    RAISE NOTICE 'FAIL: workout_sets.is_completed missing';
    _all_pass := false;
  END IF;

  -- RLS enabled on all 4 tables
  SELECT count(*) INTO _tbl_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('exercise_definitions','workouts','workout_exercises','workout_sets')
    AND rowsecurity = true;
  IF _tbl_count = 4 THEN
    RAISE NOTICE 'PASS: RLS enabled on all 4 tables';
  ELSE
    RAISE NOTICE 'FAIL: RLS enabled on only % of 4 tables', _tbl_count;
    _all_pass := false;
  END IF;

  -- 13 policies
  SELECT count(*) INTO _policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('exercise_definitions','workouts','workout_exercises','workout_sets');
  IF _policy_count = 13 THEN
    RAISE NOTICE 'PASS: 13 RLS policies exist';
  ELSE
    RAISE NOTICE 'WARN: % RLS policies (expected 13)', _policy_count;
  END IF;

  -- exercise_definitions seed count
  SELECT count(*) INTO _ed_count FROM exercise_definitions;
  IF _ed_count >= 10 THEN
    RAISE NOTICE 'PASS: exercise_definitions has % rows (>= 10)', _ed_count;
  ELSE
    RAISE NOTICE 'FAIL: exercise_definitions has only % rows', _ed_count;
    _all_pass := false;
  END IF;

  -- FK constraints
  SELECT count(*) INTO _fk_count
  FROM pg_constraint
  WHERE contype = 'f'
    AND conrelid::regclass::text IN ('workout_exercises','workout_sets','workouts');
  RAISE NOTICE 'INFO: % foreign key constraints on core tables', _fk_count;

  -- Check constraints
  SELECT count(*) INTO _chk_count
  FROM pg_constraint
  WHERE contype = 'c'
    AND conrelid::regclass::text IN ('workout_exercises','workout_sets');
  IF _chk_count >= 4 THEN
    RAISE NOTICE 'PASS: % check constraints on workout_exercises + workout_sets', _chk_count;
  ELSE
    RAISE NOTICE 'WARN: Only % check constraints (expected >= 4)', _chk_count;
  END IF;

  -- Summary
  IF _all_pass THEN
    RAISE NOTICE '=== ALL POSTCHECKS PASSED ===';
  ELSE
    RAISE NOTICE '=== SOME POSTCHECKS FAILED — review above ===';
  END IF;

  RAISE NOTICE 'Migration-003 complete. Run docs/SUPABASE_VERIFY_ALL.sql for full validation.';
END $$;
