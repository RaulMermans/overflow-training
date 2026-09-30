# Schema Contract Sanitization

## Purpose

Whitelist sanitization prevents "column does not exist" sync failures by ensuring **no payload includes keys not present in the live DB schema**. Legacy/noise fields and future regressions are stripped before any Supabase write.

## Protected Tables

| Table                | Sanitizer allowlist                                                                                                                                               | Excluded (per live DB ground truth)   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `workouts`           | id, user_id, client_uuid, started_at, ended_at, status, notes, effort_rating, session_note, created_at, updated_at                                                | —                                     |
| `workout_exercises`  | id, workout_id, client_uuid, exercise_definition_id, order_index, notes, created_at, updated_at                                                                   | `superset_group_id`, `superset_order` |
| `workout_sets`       | id, workout_exercise_id, client_uuid, set_index, reps, weight, weight_kg, duration_seconds, distance_m, is_weight_canonical, is_completed, created_at, updated_at | `set_type`, `rir`                     |
| `routines`           | id, user_id, client_uuid, name, description, color, pinned, created_at, updated_at                                                                                | —                                     |
| `routine_items`      | id, routine_id, client_uuid, order, exercise_id, sets, reps, rest, notes, created_at, updated_at                                                                  | —                                     |
| `scheduled_routines` | id, user_id, date, routine_id, status, workout_id, created_at, updated_at                                                                                         | —                                     |

## Where Sanitization Runs

1. **Outbox worker** (`src/features/sync/outbox/worker.ts`): Sanitizes payloads before passing to DB helpers for `create_workout`, `upsert_exercise`, `upsert_set`.
2. **DB helpers** (`src/db/workouts.ts`, `src/db/routinesPlans.ts`): All direct `.insert`/`.upsert`/`.update` calls use `sanitizeRow` or `sanitizeRows` before the Supabase call.

## How to Verify

1. **Grep gate**: Ensure no Supabase write payloads depend on removed fields:

   ```bash
   rg "set_type|rir|superset_group_id|superset_order" src/db src/features/sync/outbox
   ```

   **Acceptable hits**: `sanitize.ts` (comments), `sanitize.test.ts` (assertions), `worker.test.ts` (mock payloads), `workoutMutations.ts` (types, payload for projection/outbox — DB layer strips via sanitizer), `workoutProjection.ts` (local-only), `types.ts` (type defs).
   **Not acceptable**: fields in the object actually passed to `supabase.from(...).insert/upsert/update` — all DB helpers sanitize before writing.

2. **Sanitizer test**:

   ```bash
   npm test -- src/db/__tests__/sanitize.test.ts
   ```

3. **Manual happy-path**:
   - Start scheduled workout → exercises appear
   - Add set → sync succeeds (no PostgREST schema errors)
   - Inspect outbox: no quarantined items due to column-missing errors

## Extending Allowlists Safely

1. Add the new column to the live DB schema (migration).
2. Update `src/db/sanitize.ts` `ALLOWLIST` for the affected table.
3. Run `npm test -- src/db/__tests__/sanitize.test.ts`.
4. Update this doc if a previously excluded column is now allowed.

## References

- Allowlist source: `src/db/sanitize.ts`
- Write inventory: `docs/QA/schema-contract-inventory.md`
- Contract alignment: `docs/contract/CONTRACT_ALIGNMENT_REPORT.md`
