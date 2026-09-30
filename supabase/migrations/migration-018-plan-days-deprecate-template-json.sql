-- Migration 018: Deprecate plan_days.template_json
--
-- phase 1 (expand) — safe for rolling deploy
--
-- template_json is written on every sync push as {date, routineId, note} metadata
-- but is NEVER read back for any business logic (reads go through plans.schedule_json).
-- This migration begins the staged removal:
--   1. Make template_json nullable (no table lock, backward compatible).
--   2. Change the default to NULL so new rows that omit the field get NULL, not '{}'.
--   3. Add a NOT VALID no-drift constraint: if template_json has real data,
--      routine_id must already be set. NOT VALID means the constraint is added
--      instantly without a full table scan — it only guards future writes.
--
-- Phase 2 (app changes): stop writing template_json — write null instead.
-- Phase 3 (backfill):    migrate rows where routine_id IS NULL.
-- Phase 4 (migration-019): VALIDATE constraint + enforce routine_id NOT NULL.

-- Step 1: allow NULLs
ALTER TABLE plan_days
  ALTER COLUMN template_json DROP NOT NULL;

-- Step 2: new rows that omit template_json should be NULL, not '{}'
ALTER TABLE plan_days
  ALTER COLUMN template_json SET DEFAULT NULL;

-- Step 3: no-drift guard (NOT VALID — instant, no full scan)
--   Invariant: if template_json contains real data, routine_id must be set.
--   Allows: NULL, empty '{}', or any value when routine_id IS NOT NULL.
ALTER TABLE plan_days
  ADD CONSTRAINT plan_days_no_drift
  CHECK (
    template_json IS NULL
    OR template_json = '{}'::jsonb
    OR routine_id IS NOT NULL
  )
  NOT VALID;
