-- Migration 001: Sync live DB with schema.sql
-- Safe to run multiple times (all operations are idempotent)
-- Run this in the Supabase Dashboard SQL Editor

-- ============================================================
-- Part -1: ensure required base objects and tables exist
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workout_status') THEN
    CREATE TYPE workout_status AS ENUM ('in_progress', 'completed');
  END IF;
END $$;

DO $$
BEGIN
  -- Normalize legacy camelCase table names if present
  IF to_regclass('public."exerciseDefinitions"') IS NOT NULL
     AND to_regclass('public.exercise_definitions') IS NULL THEN
    ALTER TABLE "exerciseDefinitions" RENAME TO exercise_definitions;
  END IF;

  IF to_regclass('public."workoutExercises"') IS NOT NULL
     AND to_regclass('public.workout_exercises') IS NULL THEN
    ALTER TABLE "workoutExercises" RENAME TO workout_exercises;
  END IF;

  IF to_regclass('public."workoutSets"') IS NOT NULL
     AND to_regclass('public.workout_sets') IS NULL THEN
    ALTER TABLE "workoutSets" RENAME TO workout_sets;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS exercise_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL DEFAULT '',
  aliases text[] NOT NULL DEFAULT '{}',
  muscle_group text NULL,
  equipment text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  status workout_status NOT NULL DEFAULT 'in_progress',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  exercise_definition_id uuid NOT NULL REFERENCES exercise_definitions (id),
  order_index int NOT NULL DEFAULT 0,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid NOT NULL REFERENCES workout_exercises (id) ON DELETE CASCADE,
  set_index int NOT NULL DEFAULT 0,
  reps int NOT NULL DEFAULT 1,
  weight numeric NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Part 0: normalize legacy camelCase columns to snake_case
-- ============================================================

DO $$
BEGIN
  -- workouts
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts' AND column_name = 'userId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE workouts RENAME COLUMN "userId" TO user_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts' AND column_name = 'startedAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE workouts RENAME COLUMN "startedAt" TO started_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts' AND column_name = 'endedAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts' AND column_name = 'ended_at'
  ) THEN
    ALTER TABLE workouts RENAME COLUMN "endedAt" TO ended_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts' AND column_name = 'createdAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE workouts RENAME COLUMN "createdAt" TO created_at;
  END IF;

  -- workout_exercises
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_exercises' AND column_name = 'workoutId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_exercises' AND column_name = 'workout_id'
  ) THEN
    ALTER TABLE workout_exercises RENAME COLUMN "workoutId" TO workout_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_exercises' AND column_name = 'exerciseDefinitionId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_exercises' AND column_name = 'exercise_definition_id'
  ) THEN
    ALTER TABLE workout_exercises RENAME COLUMN "exerciseDefinitionId" TO exercise_definition_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_exercises' AND column_name = 'orderIndex'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_exercises' AND column_name = 'order_index'
  ) THEN
    ALTER TABLE workout_exercises RENAME COLUMN "orderIndex" TO order_index;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_exercises' AND column_name = 'createdAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_exercises' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE workout_exercises RENAME COLUMN "createdAt" TO created_at;
  END IF;

  -- workout_sets
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sets' AND column_name = 'workoutExerciseId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sets' AND column_name = 'workout_exercise_id'
  ) THEN
    ALTER TABLE workout_sets RENAME COLUMN "workoutExerciseId" TO workout_exercise_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sets' AND column_name = 'setIndex'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sets' AND column_name = 'set_index'
  ) THEN
    ALTER TABLE workout_sets RENAME COLUMN "setIndex" TO set_index;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sets' AND column_name = 'isCompleted'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sets' AND column_name = 'is_completed'
  ) THEN
    ALTER TABLE workout_sets RENAME COLUMN "isCompleted" TO is_completed;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sets' AND column_name = 'createdAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sets' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE workout_sets RENAME COLUMN "createdAt" TO created_at;
  END IF;

  -- exercise_definitions
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercise_definitions' AND column_name = 'muscleGroup'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercise_definitions' AND column_name = 'muscle_group'
  ) THEN
    ALTER TABLE exercise_definitions RENAME COLUMN "muscleGroup" TO muscle_group;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercise_definitions' AND column_name = 'createdAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercise_definitions' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE exercise_definitions RENAME COLUMN "createdAt" TO created_at;
  END IF;
END $$;

-- ============================================================
-- Part A: workouts table — add started_at and ended_at columns
-- ============================================================

-- A1. Add started_at as NULLABLE first (backfill before NOT NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'started_at'
  ) THEN
    ALTER TABLE workouts ADD COLUMN started_at timestamptz NULL DEFAULT now();
  END IF;
END $$;

-- A2. Add ended_at as NULLABLE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'ended_at'
  ) THEN
    ALTER TABLE workouts ADD COLUMN ended_at timestamptz NULL;
  END IF;
END $$;

-- A3. Add notes column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'notes'
  ) THEN
    ALTER TABLE workouts ADD COLUMN notes text NULL;
  END IF;
END $$;

-- A4. Backfill started_at from created_at / "createdAt" where NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'created_at'
  ) THEN
    EXECUTE 'UPDATE workouts SET started_at = created_at WHERE started_at IS NULL';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'createdAt'
  ) THEN
    EXECUTE 'UPDATE workouts SET started_at = "createdAt" WHERE started_at IS NULL';
  ELSE
    EXECUTE 'UPDATE workouts SET started_at = now() WHERE started_at IS NULL';
  END IF;
END $$;

-- A5. Now enforce NOT NULL on started_at (safe after backfill)
ALTER TABLE workouts ALTER COLUMN started_at SET NOT NULL;
ALTER TABLE workouts ALTER COLUMN started_at SET DEFAULT now();

-- ============================================================
-- Part B: indexes on workouts (all use IF NOT EXISTS)
-- ============================================================

CREATE INDEX IF NOT EXISTS workouts_user_id_idx ON workouts (user_id);
CREATE INDEX IF NOT EXISTS workouts_status_idx ON workouts (status);
CREATE INDEX IF NOT EXISTS workouts_ended_at_idx ON workouts (ended_at);

-- ============================================================
-- Part C: exercise_definitions — ensure slug column + unique index
-- ============================================================

-- C1. Add slug column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exercise_definitions'
      AND column_name = 'slug'
  ) THEN
    ALTER TABLE exercise_definitions ADD COLUMN slug text NOT NULL DEFAULT '';
  END IF;
END $$;

-- C1b. Add aliases column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exercise_definitions'
      AND column_name = 'aliases'
  ) THEN
    ALTER TABLE exercise_definitions ADD COLUMN aliases text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- C2. Backfill slug from name where empty/null
UPDATE exercise_definitions
SET slug = lower(replace(name, ' ', '-'))
WHERE slug IS NULL OR slug = '';

-- C3. Create unique index on slug only when existing data allows it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'exercise_definitions'
      AND indexname = 'exercise_definitions_slug_key'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM exercise_definitions
      WHERE slug IS NOT NULL
      GROUP BY slug
      HAVING COUNT(*) > 1
    ) THEN
      CREATE UNIQUE INDEX exercise_definitions_slug_key
        ON exercise_definitions (slug);
    ELSE
      RAISE NOTICE 'Skipping unique slug index: duplicate slugs already exist in exercise_definitions.';
    END IF;
  END IF;
END $$;

-- C4. Create name index for search performance
CREATE INDEX IF NOT EXISTS exercise_definitions_name_idx
  ON exercise_definitions (name);

-- ============================================================
-- Part D: seed canonical exercises (safe without requiring unique index)
-- ============================================================

INSERT INTO exercise_definitions (name, slug, aliases, muscle_group, equipment)
SELECT v.name, v.slug, v.aliases, v.muscle_group, v.equipment
FROM (
  VALUES
    ('Bench Press',          'bench-press',          ARRAY['benchpress']::text[],            'chest',     'barbell'),
    ('Incline Bench Press',  'incline-bench-press',  ARRAY['incline benchpress']::text[],    'chest',     'barbell'),
    ('Squat',                'squat',                ARRAY['back squat']::text[],            'legs',      'barbell'),
    ('Deadlift',             'deadlift',             ARRAY['conventional deadlift']::text[], 'back',      'barbell'),
    ('Overhead Press',       'overhead-press',       ARRAY['ohp','shoulder press']::text[],  'shoulders', 'barbell'),
    ('Lat Pulldown',         'lat-pulldown',         ARRAY['lat pull-down']::text[],         'back',      'machine'),
    ('Dumbbell Row',         'dumbbell-row',         ARRAY['db row']::text[],                'back',      'dumbbell'),
    ('Dumbbell Bench Press', 'dumbbell-bench-press', ARRAY['db bench']::text[],              'chest',     'dumbbell'),
    ('Bicep Curl',           'bicep-curl',           ARRAY['curl']::text[],                  'arms',      'dumbbell'),
    ('Tricep Pushdown',      'tricep-pushdown',      ARRAY['cable pushdown']::text[],        'arms',      'cable')
) AS v(name, slug, aliases, muscle_group, equipment)
WHERE NOT EXISTS (
  SELECT 1
  FROM exercise_definitions e
  WHERE e.slug = v.slug
);
