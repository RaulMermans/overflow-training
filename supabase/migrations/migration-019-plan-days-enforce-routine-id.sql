-- Migration 019: Enforce plan_days.routine_id as the sole canonical truth
--
-- prerequisites (must be in place before running this migration):
--   1. migration-018 has been applied (template_json is nullable).
--   2. App code is deployed with template_json: null writes (Phase 2).
--   3. Backfill script has run and 0 rows have routine_id IS NULL.
--      Verify: SELECT count(*) FROM plan_days WHERE routine_id IS NULL;  -- expect 0
--
-- phase 4 (contract) — validates existing constraint, enforces routine_id NOT NULL,
-- clears any residual template_json, and prepares for eventual column drop.

-- Step 1: Validate the no-drift constraint added in migration-018.
--   This is now safe because all orphaned rows were resolved by the backfill script
--   and all new rows have template_json = NULL (routine_id may still be null in rare
--   edge cases — validate will surface any violations before we enforce below).
ALTER TABLE plan_days VALIDATE CONSTRAINT plan_days_no_drift;

-- Step 2: Belt-and-suspenders cleanup — null out any residual template_json.
--   After backfill + app changes, this should touch 0 rows, but run for safety.
UPDATE plan_days
  SET template_json = NULL
  WHERE template_json IS NOT NULL;

-- Step 3: Add routine_id NOT NULL constraint (NOT VALID first — instant, no table lock).
--   After validating pre-conditions (0 rows with NULL routine_id), this is safe.
ALTER TABLE plan_days
  ADD CONSTRAINT plan_days_routine_id_nn
  CHECK (routine_id IS NOT NULL)
  NOT VALID;

-- Step 4: Validate the routine_id NOT NULL constraint (full table scan).
--   Run this as a separate statement / migration step so you can abort if there
--   are any violations. Once validated, the constraint is enforced for all future writes.
ALTER TABLE plan_days VALIDATE CONSTRAINT plan_days_routine_id_nn;

-- Step 5 (can be deferred to a future migration once team is confident):
-- ALTER TABLE plan_days DROP COLUMN template_json;
