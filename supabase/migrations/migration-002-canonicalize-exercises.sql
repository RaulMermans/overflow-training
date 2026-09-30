-- Migration 002: Canonicalize exercises & fix schema drift
-- Safe to run multiple times (all operations are idempotent)
-- Run this in the Supabase Dashboard SQL Editor AFTER migration-001
--
-- What this migration does:
--   1. Maps legacy exercise_catalog (text IDs) → exercise_definitions (UUID)
--   2. Backfills workout_exercises.exercise_definition_id from the mapping
--   3. Fixes workouts.title NOT NULL (app never sends title)
--   4. Verifies timestamp columns are canonical
--   5. Quarantines legacy tables (no drops)
--
-- Prerequisites:
--   - migrations/migration-001-sync-schema.sql has been run
--   - exercise_definitions table exists with seeded data

-- ============================================================
-- Part 0: PRECHECKS — read-only diagnostics
-- ============================================================

DO $$
DECLARE
  _count bigint;
  _col_exists boolean;
BEGIN
  RAISE NOTICE '=== MIGRATION-002 PRECHECKS ===';

  -- exercise_catalog
  IF to_regclass('public.exercise_catalog') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM exercise_catalog' INTO _count;
    RAISE NOTICE 'exercise_catalog rows: %', _count;
  ELSE
    RAISE NOTICE 'exercise_catalog: does not exist (already migrated or never created)';
  END IF;

  -- exercise_definitions
  IF to_regclass('public.exercise_definitions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM exercise_definitions' INTO _count;
    RAISE NOTICE 'exercise_definitions rows: %', _count;
  ELSE
    RAISE NOTICE 'exercise_definitions: does not exist — run migration-001 first!';
  END IF;

  -- exercises (legacy)
  IF to_regclass('public.exercises') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM exercises' INTO _count;
    RAISE NOTICE 'exercises (legacy) rows: %', _count;
  ELSE
    RAISE NOTICE 'exercises (legacy): does not exist';
  END IF;

  -- exercise_aliases
  IF to_regclass('public.exercise_aliases') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM exercise_aliases' INTO _count;
    RAISE NOTICE 'exercise_aliases rows: %', _count;
  ELSE
    RAISE NOTICE 'exercise_aliases: does not exist';
  END IF;

  -- workout_exercises.exercise_id (TEXT column)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workout_exercises'
      AND column_name = 'exercise_id'
  ) INTO _col_exists;
  IF _col_exists THEN
    EXECUTE 'SELECT count(DISTINCT exercise_id) FROM workout_exercises WHERE exercise_id IS NOT NULL' INTO _count;
    RAISE NOTICE 'workout_exercises: % distinct exercise_id (TEXT) values', _count;
  ELSE
    RAISE NOTICE 'workout_exercises.exercise_id (TEXT): does not exist (clean)';
  END IF;

  -- workout_exercises.exercise_definition_id (UUID column)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workout_exercises'
      AND column_name = 'exercise_definition_id'
  ) INTO _col_exists;
  IF _col_exists THEN
    EXECUTE 'SELECT count(*) FROM workout_exercises WHERE exercise_definition_id IS NULL' INTO _count;
    RAISE NOTICE 'workout_exercises: % rows with NULL exercise_definition_id', _count;
    EXECUTE 'SELECT count(*) FROM workout_exercises WHERE exercise_definition_id IS NOT NULL' INTO _count;
    RAISE NOTICE 'workout_exercises: % rows with populated exercise_definition_id', _count;
  ELSE
    RAISE NOTICE 'workout_exercises.exercise_definition_id (UUID): does not exist yet';
  END IF;

  -- workout_sets.exercise_id (TEXT column — legacy)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workout_sets'
      AND column_name = 'exercise_id'
  ) INTO _col_exists;
  IF _col_exists THEN
    EXECUTE 'SELECT count(DISTINCT exercise_id) FROM workout_sets WHERE exercise_id IS NOT NULL' INTO _count;
    RAISE NOTICE 'workout_sets: % distinct exercise_id (TEXT) values (legacy — not needed)', _count;
  ELSE
    RAISE NOTICE 'workout_sets.exercise_id (TEXT): does not exist (clean)';
  END IF;

  -- workouts.title
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'title'
  ) INTO _col_exists;
  IF _col_exists THEN
    RAISE NOTICE 'workouts.title: EXISTS — will be relaxed to nullable';
  ELSE
    RAISE NOTICE 'workouts.title: does not exist (clean)';
  END IF;

  RAISE NOTICE '=== END PRECHECKS ===';
END $$;


-- ============================================================
-- Part 1: BUILD EXERCISE ID MAP
-- ============================================================

-- Create temp mapping table (safe to re-run: drop + recreate)
DROP TABLE IF EXISTS _exercise_id_map;
CREATE TEMP TABLE _exercise_id_map (
  old_text_id text NOT NULL,
  new_uuid_id uuid NOT NULL
);

DO $$
DECLARE
  _matched bigint := 0;
  _inserted bigint := 0;
  _total bigint := 0;
  _unmatched bigint := 0;
BEGIN
  -- Guard: skip if exercise_catalog does not exist
  IF to_regclass('public.exercise_catalog') IS NULL THEN
    RAISE NOTICE 'Part 1: exercise_catalog does not exist — skipping mapping step';
    RETURN;
  END IF;

  RAISE NOTICE 'Part 1: Building exercise_catalog → exercise_definitions mapping...';

  -- Step 1.3: Match by normalized name
  INSERT INTO _exercise_id_map (old_text_id, new_uuid_id)
  SELECT ec.id, ed.id
  FROM exercise_catalog ec
  JOIN exercise_definitions ed
    ON lower(trim(ec.name)) = lower(trim(ed.name));

  GET DIAGNOSTICS _matched = ROW_COUNT;
  RAISE NOTICE '  Matched by name: %', _matched;

  -- Step 1.4: Insert unmatched exercise_catalog entries into exercise_definitions
  -- Then add them to the mapping
  INSERT INTO exercise_definitions (name, slug, aliases, muscle_group, equipment)
  SELECT
    ec.name,
    lower(replace(trim(ec.name), ' ', '-')),
    '{}'::text[],
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'exercise_catalog'
        AND column_name = 'muscle_group'
    ) THEN (SELECT ec2.muscle_group FROM exercise_catalog ec2 WHERE ec2.id = ec.id)
    ELSE NULL END,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'exercise_catalog'
        AND column_name = 'equipment'
    ) THEN (SELECT ec2.equipment FROM exercise_catalog ec2 WHERE ec2.id = ec.id)
    ELSE NULL END
  FROM exercise_catalog ec
  WHERE NOT EXISTS (
    SELECT 1 FROM _exercise_id_map m WHERE m.old_text_id = ec.id
  )
  -- Avoid duplicating names that already exist in exercise_definitions
  AND NOT EXISTS (
    SELECT 1 FROM exercise_definitions ed
    WHERE lower(trim(ed.name)) = lower(trim(ec.name))
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RAISE NOTICE '  Inserted new exercise_definitions: %', _inserted;

  -- Now map the newly inserted rows
  INSERT INTO _exercise_id_map (old_text_id, new_uuid_id)
  SELECT ec.id, ed.id
  FROM exercise_catalog ec
  JOIN exercise_definitions ed
    ON lower(trim(ec.name)) = lower(trim(ed.name))
  WHERE NOT EXISTS (
    SELECT 1 FROM _exercise_id_map m WHERE m.old_text_id = ec.id
  );

  -- Also try slug-based matching for any still-unmatched
  INSERT INTO _exercise_id_map (old_text_id, new_uuid_id)
  SELECT ec.id, ed.id
  FROM exercise_catalog ec
  JOIN exercise_definitions ed
    ON lower(replace(trim(ec.name), ' ', '-')) = ed.slug
  WHERE NOT EXISTS (
    SELECT 1 FROM _exercise_id_map m WHERE m.old_text_id = ec.id
  );

  -- Also try matching where exercise_catalog.id IS the slug
  INSERT INTO _exercise_id_map (old_text_id, new_uuid_id)
  SELECT ec.id, ed.id
  FROM exercise_catalog ec
  JOIN exercise_definitions ed
    ON ec.id = ed.slug
  WHERE NOT EXISTS (
    SELECT 1 FROM _exercise_id_map m WHERE m.old_text_id = ec.id
  );

  -- Report totals
  SELECT count(*) INTO _total FROM exercise_catalog;
  SELECT count(*) INTO _unmatched
  FROM exercise_catalog ec
  WHERE NOT EXISTS (
    SELECT 1 FROM _exercise_id_map m WHERE m.old_text_id = ec.id
  );

  RAISE NOTICE '  Total exercise_catalog rows: %', _total;
  RAISE NOTICE '  Total mapped: %', _total - _unmatched;
  RAISE NOTICE '  Unmatched (orphans): %', _unmatched;

  IF _unmatched > 0 THEN
    RAISE NOTICE '  WARNING: % exercise_catalog entries could not be mapped. Manual review needed.', _unmatched;
  END IF;
END $$;

-- Step 1.6: Merge exercise_aliases into exercise_definitions.aliases
DO $$
DECLARE
  _merged bigint := 0;
BEGIN
  IF to_regclass('public.exercise_aliases') IS NULL THEN
    RAISE NOTICE 'Part 1.6: exercise_aliases does not exist — skipping alias merge';
    RETURN;
  END IF;

  -- Check that exercise_aliases has the expected columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exercise_aliases'
      AND column_name = 'alias'
  ) THEN
    RAISE NOTICE 'Part 1.6: exercise_aliases.alias column not found — skipping';
    RETURN;
  END IF;

  -- Merge aliases via the mapping table
  UPDATE exercise_definitions ed
  SET aliases = (
    SELECT array_agg(DISTINCT a)
    FROM (
      SELECT unnest(ed.aliases) AS a
      UNION
      SELECT ea.alias
      FROM exercise_aliases ea
      JOIN _exercise_id_map m ON ea.exercise_id = m.old_text_id
      WHERE m.new_uuid_id = ed.id
    ) sub
  )
  WHERE EXISTS (
    SELECT 1
    FROM exercise_aliases ea
    JOIN _exercise_id_map m ON ea.exercise_id = m.old_text_id
    WHERE m.new_uuid_id = ed.id
  );

  GET DIAGNOSTICS _merged = ROW_COUNT;
  RAISE NOTICE 'Part 1.6: Merged aliases for % exercise_definitions rows', _merged;
END $$;


-- ============================================================
-- Part 2: ENSURE CANONICAL COLUMNS EXIST
-- ============================================================

-- workout_exercises.exercise_definition_id (UUID, nullable initially for backfill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workout_exercises'
      AND column_name = 'exercise_definition_id'
  ) THEN
    ALTER TABLE workout_exercises
      ADD COLUMN exercise_definition_id uuid NULL;
    RAISE NOTICE 'Part 2: Added workout_exercises.exercise_definition_id (UUID, nullable)';
  ELSE
    RAISE NOTICE 'Part 2: workout_exercises.exercise_definition_id already exists';
  END IF;
END $$;

-- Note: workout_sets does NOT need exercise_definition_id.
-- The exercise reference chain is:
--   workout_sets.workout_exercise_id → workout_exercises.exercise_definition_id → exercise_definitions.id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workout_sets'
      AND column_name = 'exercise_id'
  ) THEN
    RAISE NOTICE 'Part 2: workout_sets.exercise_id (TEXT) exists — will be deprecated (not needed; exercise ref via workout_exercise_id)';
  END IF;
END $$;


-- ============================================================
-- Part 3: BACKFILL UUID COLUMN
-- ============================================================

DO $$
DECLARE
  _backfilled bigint := 0;
  _slug_matched bigint := 0;
  _remaining_nulls bigint := 0;
  _has_text_col boolean;
  _has_map_rows boolean;
BEGIN
  -- Check if exercise_id TEXT column exists on workout_exercises
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workout_exercises'
      AND column_name = 'exercise_id'
  ) INTO _has_text_col;

  SELECT EXISTS (SELECT 1 FROM _exercise_id_map LIMIT 1) INTO _has_map_rows;

  IF _has_text_col AND _has_map_rows THEN
    RAISE NOTICE 'Part 3: Backfilling exercise_definition_id from mapping table...';

    -- Primary backfill via mapping
    UPDATE workout_exercises we
    SET exercise_definition_id = m.new_uuid_id
    FROM _exercise_id_map m
    WHERE we.exercise_id = m.old_text_id
      AND we.exercise_definition_id IS NULL;

    GET DIAGNOSTICS _backfilled = ROW_COUNT;
    RAISE NOTICE '  Backfilled via mapping: %', _backfilled;

    -- Fallback: try matching exercise_id directly as a slug
    UPDATE workout_exercises we
    SET exercise_definition_id = ed.id
    FROM exercise_definitions ed
    WHERE we.exercise_id = ed.slug
      AND we.exercise_definition_id IS NULL;

    GET DIAGNOSTICS _slug_matched = ROW_COUNT;
    IF _slug_matched > 0 THEN
      RAISE NOTICE '  Backfilled via slug fallback: %', _slug_matched;
    END IF;

    -- Fallback: try matching exercise_id as name (case-insensitive)
    UPDATE workout_exercises we
    SET exercise_definition_id = ed.id
    FROM exercise_definitions ed
    WHERE lower(trim(we.exercise_id)) = lower(trim(ed.name))
      AND we.exercise_definition_id IS NULL;

    GET DIAGNOSTICS _slug_matched = ROW_COUNT;
    IF _slug_matched > 0 THEN
      RAISE NOTICE '  Backfilled via name fallback: %', _slug_matched;
    END IF;

  ELSIF NOT _has_text_col THEN
    RAISE NOTICE 'Part 3: No exercise_id (TEXT) column on workout_exercises — skipping backfill';
  ELSIF NOT _has_map_rows THEN
    RAISE NOTICE 'Part 3: No mapping rows — skipping backfill (exercise_catalog may not have existed)';
  END IF;

  -- Report remaining NULLs
  SELECT count(*) INTO _remaining_nulls
  FROM workout_exercises
  WHERE exercise_definition_id IS NULL;

  IF _remaining_nulls > 0 THEN
    RAISE NOTICE 'Part 3: WARNING — % workout_exercises rows still have NULL exercise_definition_id', _remaining_nulls;
  ELSE
    RAISE NOTICE 'Part 3: All workout_exercises rows have exercise_definition_id populated';
  END IF;
END $$;


-- ============================================================
-- Part 4: ENFORCE CONSTRAINTS
-- ============================================================

-- 4.1: Enforce NOT NULL on exercise_definition_id (only if no NULLs remain)
DO $$
DECLARE
  _null_count bigint;
  _is_nullable text;
BEGIN
  SELECT count(*) INTO _null_count
  FROM workout_exercises
  WHERE exercise_definition_id IS NULL;

  IF _null_count > 0 THEN
    RAISE NOTICE 'Part 4: Cannot enforce NOT NULL — % rows still have NULL exercise_definition_id. Manual fix required.', _null_count;
  ELSE
    -- Check if already NOT NULL
    SELECT is_nullable INTO _is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workout_exercises'
      AND column_name = 'exercise_definition_id';

    IF _is_nullable = 'YES' THEN
      ALTER TABLE workout_exercises
        ALTER COLUMN exercise_definition_id SET NOT NULL;
      RAISE NOTICE 'Part 4: Enforced NOT NULL on workout_exercises.exercise_definition_id';
    ELSE
      RAISE NOTICE 'Part 4: exercise_definition_id is already NOT NULL';
    END IF;
  END IF;
END $$;

-- 4.2: Add FK constraint if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'workout_exercises'::regclass
      AND conname = 'workout_exercises_exercise_definition_id_fkey'
  ) THEN
    -- Only add FK if the column has no NULLs (FK requires non-null or nullable)
    IF NOT EXISTS (
      SELECT 1 FROM workout_exercises WHERE exercise_definition_id IS NULL
    ) THEN
      ALTER TABLE workout_exercises
        ADD CONSTRAINT workout_exercises_exercise_definition_id_fkey
        FOREIGN KEY (exercise_definition_id) REFERENCES exercise_definitions (id);
      RAISE NOTICE 'Part 4: Added FK workout_exercises.exercise_definition_id → exercise_definitions(id)';
    ELSE
      RAISE NOTICE 'Part 4: Skipping FK — NULLs exist in exercise_definition_id';
    END IF;
  ELSE
    RAISE NOTICE 'Part 4: FK workout_exercises_exercise_definition_id_fkey already exists';
  END IF;
END $$;

-- 4.3: Add index if not present
CREATE INDEX IF NOT EXISTS workout_exercises_exercise_definition_id_idx
  ON workout_exercises (exercise_definition_id);


-- ============================================================
-- Part 5: FIX workouts.title
-- ============================================================

DO $$
DECLARE
  _is_nullable text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'title'
  ) THEN
    RAISE NOTICE 'Part 5: workouts.title does not exist (clean)';
    RETURN;
  END IF;

  -- Check if title is NOT NULL
  SELECT is_nullable INTO _is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'workouts'
    AND column_name = 'title';

  IF _is_nullable = 'NO' THEN
    -- Set a default so existing inserts don't fail
    ALTER TABLE workouts ALTER COLUMN title SET DEFAULT '';
    -- Drop NOT NULL
    ALTER TABLE workouts ALTER COLUMN title DROP NOT NULL;
    RAISE NOTICE 'Part 5: workouts.title relaxed to NULLABLE with default empty string';
  ELSE
    RAISE NOTICE 'Part 5: workouts.title is already nullable';
  END IF;

  -- Mark as deprecated
  COMMENT ON COLUMN workouts.title IS
    'DEPRECATED by migration-002. App does not use this column. Safe to drop after verification.';
  RAISE NOTICE 'Part 5: workouts.title marked as deprecated';
END $$;


-- ============================================================
-- Part 6: VERIFY TIMESTAMP COLUMNS (safety net)
-- ============================================================

-- 6.1: Ensure started_at exists and is NOT NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'started_at'
  ) THEN
    ALTER TABLE workouts ADD COLUMN started_at timestamptz NULL DEFAULT now();
    -- Backfill from created_at
    UPDATE workouts SET started_at = COALESCE(created_at, now()) WHERE started_at IS NULL;
    ALTER TABLE workouts ALTER COLUMN started_at SET NOT NULL;
    RAISE NOTICE 'Part 6: Added and backfilled workouts.started_at';
  ELSE
    RAISE NOTICE 'Part 6: workouts.started_at already exists';
  END IF;
END $$;

-- 6.2: Ensure ended_at exists and is NULLABLE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'ended_at'
  ) THEN
    ALTER TABLE workouts ADD COLUMN ended_at timestamptz NULL;
    RAISE NOTICE 'Part 6: Added workouts.ended_at';
  ELSE
    RAISE NOTICE 'Part 6: workouts.ended_at already exists';
  END IF;
END $$;

-- 6.3: Report lingering camelCase columns
DO $$
DECLARE
  _col text;
  _found boolean := false;
BEGIN
  FOR _col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name IN ('startedAt', 'endedAt', 'updatedAt', 'createdAt', 'userId')
  LOOP
    RAISE NOTICE 'Part 6: Legacy camelCase column still present: workouts.%', _col;
    _found := true;
  END LOOP;

  IF NOT _found THEN
    RAISE NOTICE 'Part 6: No legacy camelCase columns on workouts (clean)';
  END IF;
END $$;


-- ============================================================
-- Part 7: QUARANTINE LEGACY TABLES
-- ============================================================

-- 7.1: exercise_catalog
DO $$
BEGIN
  IF to_regclass('public.exercise_catalog') IS NOT NULL THEN
    COMMENT ON TABLE exercise_catalog IS
      'DEPRECATED by migration-002. Data migrated to exercise_definitions. Safe to drop after verification.';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON exercise_catalog FROM authenticated';
    RAISE NOTICE 'Part 7: exercise_catalog marked deprecated, writes revoked';
  END IF;
END $$;

-- 7.2: exercise_aliases
DO $$
BEGIN
  IF to_regclass('public.exercise_aliases') IS NOT NULL THEN
    COMMENT ON TABLE exercise_aliases IS
      'DEPRECATED by migration-002. Data merged into exercise_definitions.aliases. Safe to drop after verification.';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON exercise_aliases FROM authenticated';
    RAISE NOTICE 'Part 7: exercise_aliases marked deprecated, writes revoked';
  END IF;
END $$;

-- 7.3: exercises (legacy)
DO $$
BEGIN
  IF to_regclass('public.exercises') IS NOT NULL THEN
    COMMENT ON TABLE exercises IS
      'DEPRECATED legacy table. Superseded by exercise_definitions + workout_exercises + workout_sets. Safe to drop after verification.';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON exercises FROM authenticated';
    RAISE NOTICE 'Part 7: exercises (legacy) marked deprecated, writes revoked';
  END IF;
END $$;

-- 7.5: Deprecation comments on legacy columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workout_exercises'
      AND column_name = 'exercise_id'
  ) THEN
    COMMENT ON COLUMN workout_exercises.exercise_id IS
      'DEPRECATED by migration-002. Use exercise_definition_id (UUID) instead.';
    RAISE NOTICE 'Part 7: workout_exercises.exercise_id marked deprecated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workout_sets'
      AND column_name = 'exercise_id'
  ) THEN
    COMMENT ON COLUMN workout_sets.exercise_id IS
      'DEPRECATED by migration-002. Exercise reference is via workout_exercise_id → workout_exercises.exercise_definition_id.';
    RAISE NOTICE 'Part 7: workout_sets.exercise_id marked deprecated';
  END IF;
END $$;


-- ============================================================
-- Part 8: POSTCHECKS
-- ============================================================

DO $$
DECLARE
  _count bigint;
  _null_count bigint;
  _fk_exists boolean;
  _idx_exists boolean;
BEGIN
  RAISE NOTICE '=== MIGRATION-002 POSTCHECKS ===';

  -- 8.1: exercise_definitions count
  SELECT count(*) INTO _count FROM exercise_definitions;
  IF _count >= 10 THEN
    RAISE NOTICE 'PASS: exercise_definitions has % rows (>= 10)', _count;
  ELSE
    RAISE NOTICE 'WARN: exercise_definitions has only % rows (expected >= 10)', _count;
  END IF;

  -- 8.2: exercise_definition_id populated
  SELECT count(*) INTO _null_count
  FROM workout_exercises
  WHERE exercise_definition_id IS NULL;

  IF _null_count = 0 THEN
    RAISE NOTICE 'PASS: All workout_exercises rows have exercise_definition_id populated';
  ELSE
    RAISE NOTICE 'WARN: % workout_exercises rows still have NULL exercise_definition_id', _null_count;
  END IF;

  -- 8.3: FK exists
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'workout_exercises'::regclass
      AND conname = 'workout_exercises_exercise_definition_id_fkey'
  ) INTO _fk_exists;

  IF _fk_exists THEN
    RAISE NOTICE 'PASS: FK workout_exercises_exercise_definition_id_fkey exists';
  ELSE
    RAISE NOTICE 'WARN: FK workout_exercises_exercise_definition_id_fkey does NOT exist';
  END IF;

  -- 8.4: Index exists
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'workout_exercises'
      AND indexname = 'workout_exercises_exercise_definition_id_idx'
  ) INTO _idx_exists;

  IF _idx_exists THEN
    RAISE NOTICE 'PASS: Index workout_exercises_exercise_definition_id_idx exists';
  ELSE
    RAISE NOTICE 'WARN: Index workout_exercises_exercise_definition_id_idx does NOT exist';
  END IF;

  -- 8.5: workouts.title status
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'title'
      AND is_nullable = 'NO'
  ) THEN
    RAISE NOTICE 'FAIL: workouts.title is still NOT NULL — app inserts will fail!';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'title'
  ) THEN
    RAISE NOTICE 'PASS: workouts.title exists but is nullable (deprecated, safe)';
  ELSE
    RAISE NOTICE 'PASS: workouts.title does not exist (clean)';
  END IF;

  -- 8.6: workouts timestamps
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'started_at'
      AND is_nullable = 'NO'
  ) THEN
    RAISE NOTICE 'PASS: workouts.started_at exists and is NOT NULL';
  ELSE
    RAISE NOTICE 'WARN: workouts.started_at may be missing or nullable';
  END IF;

  -- 8.7: Total row counts for audit
  SELECT count(*) INTO _count FROM workout_exercises;
  RAISE NOTICE 'Audit: workout_exercises total rows: %', _count;

  SELECT count(*) INTO _count FROM workout_sets;
  RAISE NOTICE 'Audit: workout_sets total rows: %', _count;

  SELECT count(*) INTO _count FROM workouts;
  RAISE NOTICE 'Audit: workouts total rows: %', _count;

  RAISE NOTICE '=== END POSTCHECKS ===';
  RAISE NOTICE 'Migration-002 complete. Run docs/SUPABASE_VERIFY_ALL.sql for full schema validation.';
END $$;
