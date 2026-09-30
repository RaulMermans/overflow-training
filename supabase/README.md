# Supabase Setup (Workout Sessions)

Run these scripts in the Supabase SQL editor to create the schema and RLS policies for the
mobile workout logging flow.

## Steps

### Fresh install

1. Open Supabase Dashboard → SQL Editor → New query.
2. Paste and run `schema.sql` to create tables, constraints, and seed exercises.
3. Paste and run `policies.sql` to enable RLS and restrict access to user-owned data.

### Existing database (migrations)

Run these in order after the fresh install scripts above. The source of truth for migration order is `migrations/manifest.json`:

1. `migrations/migration-001-sync-schema.sql` — Normalizes legacy camelCase columns/tables to snake_case, adds missing columns, seeds exercises. Idempotent.
2. `migrations/migration-002-canonicalize-exercises.sql` — Maps legacy `exercise_catalog` (text IDs) to `exercise_definitions` (UUID), backfills `exercise_definition_id`, fixes `workouts.title` NOT NULL, quarantines legacy tables. Idempotent.

### Empty database with legacy schema (clean rebuild)

If the core user tables (workouts, workout_exercises, workout_sets) have **0 rows** but the wrong schema (text PKs, wrong columns, wrong FKs), use:

3. `migrations/migration-003-clean-rebuild.sql` — Drops and recreates the 3 empty core tables to match `schema.sql` exactly, applies all RLS policies, quarantines legacy tables. **Optional fallback only; not the default path.** Use only when all 3 core tables are empty. Has a safety check that aborts if any table has data.

### Data expansion

4. `migrations/migration-004-expand-exercise-library.sql` — Expands the exercise library from 10 to 210+ exercises across strength, conditioning, cardio, and mobility categories. Idempotent (UPSERT on slug, merges aliases). No schema changes.

### Query performance and RPC

5. `migrations/migration-005-last-exercise-performance-rpc.sql` — Adds `get_last_exercise_performance(...)` for last-completed exercise sets in a single query path. Idempotent (`CREATE OR REPLACE FUNCTION`).
6. `migrations/migration-006-exercise-aliases-gin-index.sql` — Adds a GIN index on `exercise_definitions.aliases` for the `aliases.cs.{...}` search path used by exercise search. Idempotent.
7. `migrations/migration-007-exercise-targets-and-types.sql` — Adds `exercise_type`, `primary_targets`, `secondary_targets`, and corresponding indexes/backfills for routine picker targeting. Idempotent.
8. `migrations/migration-007-canonical-weight-started-at-progress-meta.sql` — Adds canonical set weight storage (`weight_kg`, `is_weight_canonical`), structured workout metadata (`effort_rating`, `session_note`), started_at backfill, a completed-workout started_at index, and progress RPCs for all-time PRs and recent exercise occurrences. Idempotent.
9. `migrations/migration-008-hybrid-exercises-and-tracking-modes.sql` — Adds hybrid exercise fields (`scope`, `owner_user_id`, `category`, `tracking_mode`), target arrays, and workout-set metric flexibility constraints/RLS alignment. Idempotent.
10. `migrations/migration-008-routines-plans-sync-offline-outbox.sql` — Adds cloud sync tables (`routines`, `routine_items`, `plans`, `plan_days`), `client_uuid` idempotency columns/indexes for workout entities, and RLS policies for the new tables. Idempotent.
11. `migrations/migration-009-favorites.sql` — Adds `exercise_favorites` and `routine_favorites` tables with owner-scoped RLS policies. Idempotent.
12. `migrations/migration-010-data-hygiene-contract-hardening.sql` — Adds category→exercise_type legacy derivation trigger, enforces exercise scope/owner consistency, and hardens workout set metric presence invariants. Idempotent.
13. `migrations/migration-011-user-settings.sql` — Adds `user_settings` with owner-scoped RLS policies for weekly workouts goal persistence. Idempotent.
14. `migrations/migration-012-delete-my-account-rpc.sql` — Adds `delete_my_account()` secure RPC for full self-service account deletion (auth user + owned app data). Idempotent (`CREATE OR REPLACE FUNCTION`).
15. `migrations/migration-013-exercise-library-v1.sql` — Reconciles warmup/stretch/mobility/cardio system library entries with idempotent slug upserts and applies conservative cleanup for clearly placeholder-like system records only. No schema changes.
16. `migrations/migration-014-workout-set-modifiers.sql` — Adds optional set modifiers on `workout_sets` (`set_type`, `rir`) with range/type constraints for structured gym-slang annotations. Idempotent.
17. `migrations/migration-015-workout-exercise-supersets.sql` — Adds strict-pair superset metadata on `workout_exercises` (`superset_group_id`, `superset_order`) with pairing/order constraints and unique per-group position. Idempotent.
18. `migrations/migration-016-checkins-cloud-sync.sql` — Adds private Storage bucket + user-scoped `storage.objects` RLS policies for check-in photos, and `checkin_photos` metadata table with owner-scoped RLS policies. Idempotent.
19. `migrations/migration-017-delete-my-account-rpc-hardening.sql` — Hardens `delete_my_account()` with explicit FK-safe delete order (workout_sets → workout_exercises → workouts, routine_items/favorites → routines, plan_days → plans), Storage ownership guard, `pg_temp` in search_path, and `to_regclass` resilience for future tables. Idempotent (`CREATE OR REPLACE FUNCTION`).
20. `migrations/migration-018-plan-days-deprecate-template-json.sql` — Deprecates `plan_days.template_json`: makes nullable, sets default NULL, adds no-drift constraint. Idempotent.
21. `migrations/migration-019-plan-days-enforce-routine-id.sql` — Enforces `plan_days.routine_id` as sole canonical truth: validates no-drift constraint, nulls residual template_json, adds routine_id NOT NULL. Requires migration-018 and backfill. Idempotent.
22. `migrations/migration-020-quarantine-exercises.sql` — Hard-quarantines legacy tables (exercises, exercise_catalog, exercise_aliases): revokes client grants, enables FORCE RLS, adds deprecation comments. Does not drop. Idempotent.
23. `migrations/migration-021-drop-deprecated-exercise-tables.sql` — Drops quarantined legacy exercise tables. Apply only after migration-020 has been live for one beta cycle with no access attempts. Destructive.
24. `migrations/migration-022-settings-canonicalization.sql` — Ensures `user_settings` is the sole settings authority. If `profiles` exists and has `weekly_workouts_goal`, backfills into `user_settings` (new rows only) and drops the column from `profiles`. No-op if `profiles` absent or has no overlap. Idempotent.
25. `migrations/migration-023-updated-at-triggers.sql` — Adds `touch_updated_at()` function and BEFORE UPDATE triggers on sync-surface tables (`routines`, `routine_items`, `plans`, `plan_days`, `user_settings`, `checkin_photos`, `exercise_definitions`). Auto-touches `updated_at` on real updates; no-op updates do not churn; client-provided `updated_at` preserved. Idempotent.
26. `migrations/migration-024-plans-execution-weight-contracts.sql` — Phase 3 integrity: partial unique index `plans_one_active_per_user`, `activate_plan(plan_id)` RPC, dedupe for `workout_exercises.order_index` / `workout_sets.set_index`, `workout_sets_weight_consistency` check. Fails if weight violations exist. Idempotent.
27. `migrations/migration-025-performance-indexes-rls.sql` — Phase 4 performance hardening: adds `workouts_user_started_at_desc`, `routines_user_updated_at_desc`, `plans_user_active_updated_at_desc` indexes; optimizes RLS policies with `(select auth.uid())` for single evaluation per statement. Idempotent.
28. `migrations/migration-026-db-hygiene.sql` — Captures manual DB hygiene into git: drops legacy tables (`goals`, `workout_templates`, `workout_template_exercises`), fixes `plan_days.routine_id` FK to `ON DELETE RESTRICT` (compatible with NOT NULL), adds `updated_at` + `touch_updated_at` triggers to execution tables (`workouts`, `workout_exercises`, `workout_sets`), removes duplicate indexes, removes redundant/conflicting RLS policies, drops legacy `profiles` columns. Idempotent.
29. `migrations/migration-027-analytics-foundation.sql` — Phase 5 analytics foundation: creates `analytics` schema with seven `SECURITY INVOKER` views (`weekly_workouts`, `weekly_strength_volume`, `weekly_training_time`, `exercise_best_set_daily`, `exercise_e1rm_weekly`, `weekly_muscle_balance`, `weekly_summary`) and three RPCs (`rpc_progress_overview`, `rpc_strength_lift_trend`, `rpc_muscle_balance`). All volume in kg. Epley e1RM formula. 70/30 primary/secondary muscle attribution (ADR-AN-003). Performance indexes on join columns. Idempotent.
30. `migrations/migration-027-sync-diagnostics-rpcs.sql` — Adds diagnostic RPCs (`rpc_whoami`, `rpc_sync_health`, `rpc_user_last_changed`, `rpc_policy_audit`) used to debug mobile auth/sync issues and enable cheap cache invalidation. Idempotent.
31. `migrations/migration-028-push-plan-atomic.sql` — Atomic plan push: single RPC `push_plan_atomic(p_plan, p_days)` replaces multiple client calls with one Postgres transaction; optimistic skip when remote is newer. Idempotent (`CREATE OR REPLACE FUNCTION`).
32. `migrations/migration-029-push-plan-atomic-null-guard.sql` — Null guard in `push_plan_atomic`: explicit check before inserting each plan_day so null `routine_id` raises named exception `plan_day_routine_id_null` instead of raw 23502. Idempotent (`CREATE OR REPLACE FUNCTION`).
33. `migrations/migration-030-start-workout-from-routine.sql` — Adds `start_workout_from_routine(p_user_id, p_routine_id)` RPC that atomically creates workout + workout_exercises from routine_items. Idempotent (`CREATE OR REPLACE FUNCTION`).
34. `migrations/migration-031-start-workout-rpc-auth-only.sql` — Simplifies routine start to `start_workout_from_routine(p_routine_id)` with `auth.uid()` ownership checks and explicit `routine_empty` result; removes the old 2-arg signature. Idempotent (`CREATE OR REPLACE FUNCTION` + `DROP FUNCTION IF EXISTS`).
35. `migrations/migration-032-start-workout-rpc-contract-fix.sql` — Removes superset_group_id/superset_order from `start_workout_from_routine` INSERT and RETURN so the function only uses columns that exist in `workout_exercises`. Idempotent (`CREATE OR REPLACE FUNCTION`).
36. `migrations/migration-033-upsert-routine-with-items-atomic.sql` — Adds `upsert_routine_with_items_atomic(p_routine, p_items)` RPC; rejects empty items, upserts routine by (user_id, client_uuid), replaces routine_items atomically; validates exercise_definitions scope. Phase 2. Idempotent.
37. `migrations/migration-034-scheduled-routines.sql` — Adds `scheduled_routines` table (user_id, date, routine_id, status, workout_id), RLS, and RPCs `start_scheduled_workout(p_date)` (idempotent) and `schedule_routine_for_date(p_date, p_routine_id)`. Phase 3; parallel to plans/plan_days.
38. `migrations/migration-035-drop-plans-legacy.sql` — Drops legacy `plans`/`plan_days` and RPCs `push_plan_atomic`/`activate_plan`; patches `delete_my_account`, `rpc_user_last_changed`, `rpc_policy_audit`. Apply after stable window with plan sync disabled.
39. `migrations/migration-036-sync-health-expansion.sql` — Expands `rpc_sync_health()` with `routines_max_updated_at`, `routine_items_max_updated_at`, `scheduled_routines_max_updated_at`. Backward-compatible.
40. `migrations/migration-037-schedule-change-in-progress-block.sql` — Blocks `schedule_routine_for_date` when workout is in progress; allows change after completion with schedule reset. Idempotent.
41. `migrations/migration-038-scheduled-routines-update-with-check.sql` — Recreates `scheduled_routines_update_own` with `WITH CHECK (user_id = auth.uid())` to enforce update-time ownership immutability. Idempotent.
42. `migrations/migration-039-onboarding-completed-at.sql` — Adds `onboarding_completed_at timestamptz` to `user_settings` for durable, account-backed onboarding completion. Idempotent.
43. `migrations/migration-040-routines-soft-delete.sql` — Adds `deleted_at timestamptz` to `routines` with partial index for soft-delete pattern, preserving referential integrity with `scheduled_routines`. Idempotent.
44. `migrations/migration-041-google-calendar-sync.sql` — Adds `google_calendar_connections` and `scheduled_workout_calendar_links` tables with RLS for one-way Google Calendar sync (flag-gated). Idempotent.

After running migrations, verify with `docs/SUPABASE_VERIFY_ALL.sql` and `docs/SUPABASE_VERIFY_EXERCISES.sql`.

**Dev sanity checks:** Run `npm run db:sanity-checks` (or `supabase db execute --file scripts/db/sanity_checks.sql`) to fail on invalid states: routines with 0 items, or scheduled_routines with missing routine_id. Use after `supabase link` for local/dev/staging.

## Notes

- `exercise_definitions` is read-only for authenticated users by policy.
- Workouts must always be inserted with an explicit `user_id`.
- Indices and constraints are included to prevent negative indices and invalid set values.
- `exercise_definitions_aliases_gin_idx` exists to keep alias containment lookups (`aliases.cs`) responsive as the library grows.
- `exercise_type` is a legacy-compatible field derived from `category`; app filtering logic should use `category`.
- Numeric migration prefixes may repeat in historical files (`007`, `008`, `027`); `migrations/manifest.json` defines deterministic execution order and is enforced by `scripts/verify-supabase-contract.mjs`.

## Migration numbering convention

- Each migration file uses a 3-digit sequence number: `migration-NNN-description.sql`.
- Always use the next available number (currently: **041+**).
- Never reuse a sequence number that appears in `migrations/manifest.json`.
- The verify script (`npm run db:verify:contract`) blocks new duplicates at CI time.
- Historical note: sequences 007, 008, and 027 each have two files due to concurrent development in early phases. These are frozen and must NOT be renumbered, as they have been applied to production databases.
