-- Migration 021: Drop exercise tables deprecated by migration-002 (quarantined in migration-020)
--
-- Apply only after migration-020 quarantine has been live for at least one beta
-- cycle with no blocked-access log events (no PostgREST/Postgres errors for exercises).
--
-- Background:
--   migration-002 canonicalized all exercise references onto
--   exercise_definitions.id (uuid).  exercise_catalog, exercise_aliases, and
--   exercises were deprecated at that point: writes from authenticated users
--   were revoked and no source code (src/ or app/) references them.
--   migration-020 revoked all client privileges and enabled FORCE RLS.
--
-- Safe to drop because:
--   1. No FK references from current app tables; any FKs from legacy goals/workout_template_exercises are dropped by this migration.
--   2. No TypeScript types defined for them in src/types/db.ts.
--   3. Zero references in src/ or app/ source code (grep confirmed).
--   4. Quarantine (migration-020) has been live with no access attempts.
--
-- Pre-flight — run these queries before applying and confirm expected results:
--
--   -- 1. List FK references to deprecated tables (0 rows, or only goals/workout_template_exercises — migration drops those constraints):
--   SELECT
--     tc.table_name  AS referencing_table,
--     kcu.column_name,
--     ccu.table_name AS referenced_table
--   FROM information_schema.table_constraints AS tc
--   JOIN information_schema.key_column_usage AS kcu
--     ON tc.constraint_name = kcu.constraint_name
--   JOIN information_schema.constraint_column_usage AS ccu
--     ON ccu.constraint_name = tc.constraint_name
--   WHERE tc.constraint_type = 'FOREIGN KEY'
--     AND ccu.table_name IN ('exercise_catalog', 'exercise_aliases', 'exercises');
--
--   -- 2. Audit row counts (expect low / zero counts):
--   SELECT 'exercise_catalog' AS tbl, count(*) FROM exercise_catalog
--   UNION ALL
--   SELECT 'exercise_aliases',        count(*) FROM exercise_aliases
--   UNION ALL
--   SELECT 'exercises',               count(*) FROM exercises;
--
-- Post-migration verification:
--   SELECT table_name
--   FROM information_schema.tables
--   WHERE table_name IN ('exercise_catalog', 'exercise_aliases', 'exercises');
--   -- Expect: 0 rows (all three tables gone)

-- Belt-and-suspenders: revoke any remaining grants before drop.
-- These revokes are idempotent — they succeed even if grants no longer exist.
REVOKE ALL ON TABLE exercise_aliases FROM authenticated, anon;
REVOKE ALL ON TABLE exercise_catalog FROM authenticated, anon;
REVOKE ALL ON TABLE exercises         FROM authenticated, anon;

-- Drop FK constraints from optional legacy tables that reference exercise_catalog.
-- (goals and workout_template_exercises are not in current schema; they may exist in some DBs.)
-- IF EXISTS makes this idempotent when those tables or constraints are absent.
ALTER TABLE IF EXISTS goals DROP CONSTRAINT IF EXISTS goals_exercise_id_fkey;
ALTER TABLE IF EXISTS workout_template_exercises DROP CONSTRAINT IF EXISTS workout_template_exercises_exercise_id_fkey;

-- Drop in FK-safe order: aliases first (references catalog), then catalog, then exercises.
DROP TABLE IF EXISTS exercise_aliases;
DROP TABLE IF EXISTS exercise_catalog;
DROP TABLE IF EXISTS exercises;
