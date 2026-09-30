# Contract Alignment Report

**Date:** 2026-03-04  
**Scope:** Align client with live DB schema (no phantom columns)  
**Constraint:** Do NOT add DB columns; client must not send columns that don't exist in DB.

---

## 1. Mismatches Found

| Location                                                                | Issue                                                                             | Impact                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| `src/types/db.ts`                                                       | `workout_exercises` Insert/Update included `superset_group_id`, `superset_order`  | Type mismatch; code could pass these to Supabase    |
| `src/types/db.ts`                                                       | `workout_sets` Insert/Update included `set_type`, `rir`                           | Type mismatch; code could pass these to Supabase    |
| `src/db/workouts.ts`                                                    | `UpsertWorkoutExerciseFromClientInput` accepted superset fields                   | Callers could pass them; DB would reject            |
| `src/db/workouts.ts`                                                    | `UpsertWorkoutSetFromClientInput` / `WorkoutSetWriteInput` included set_type, rir | Same                                                |
| `src/db/workouts.ts`                                                    | `fetchWorkoutDetail` select string requested superset\_\*, set_type, rir          | PostgREST "column does not exist" on live DB        |
| `src/features/sync/outbox/workoutMutations.ts`                          | `addExerciseOptimistic`, `updateExerciseSupersetOptimistic` passed superset to DB | Remote upsert could fail                            |
| `src/features/sync/outbox/workoutMutations.ts`                          | `addSetOptimistic`, `updateSetOptimistic` passed set_type, rir to DB              | Same                                                |
| `src/features/sync/outbox/worker.ts`                                    | `update_set` handler passed set_type, rir to `updateWorkoutSet`                   | Same                                                |
| `src/features/sync/outbox/mergeWorkout.ts`                              | Merged exercises included superset fields in structure                            | Could propagate to DB if merged result ever written |
| `src/features/routines/startRoutine.ts`                                 | Exercise payloads included superset fields                                        | RPC or downstream could fail                        |
| `src/features/workoutSession/controller/useWorkoutSessionController.ts` | `handleSaveSetAdvanced` wrote set_type, rir to DB                                 | Schema error on save                                |

---

## 2. Changes Made

### A) TypeScript DB types (`src/types/db.ts`)

- **workout_exercises** Insert/Update: Removed `superset_group_id`, `superset_order`
- **workout_sets** Insert/Update: Removed `set_type`, `rir`
- **Row types**: Kept optional `superset_group_id?`, `superset_order?`, `set_type?`, `rir?` for reads (projection/local UI)

### B) DB layer (`src/db/workouts.ts`)

- `UpsertWorkoutExerciseFromClientInput`: No superset fields
- `UpsertWorkoutSetFromClientInput`: No set_type, rir
- `WorkoutSetWriteInput`: No set_type, rir
- `mapSetWriteInput()`: Does not add set_type, rir
- `addExerciseToWorkout()`: Insert omits superset fields
- `addSet()`: Insert omits set_type, rir
- `upsertWorkoutExerciseFromClient()`: Payload built from allowed keys only
- `upsertWorkoutSetFromClient()`: Payload built from allowed keys only
- `updateWorkoutSet()`: Update omits set_type, rir
- `fetchWorkoutDetail()`: Select omits superset\_\*, set_type, rir

### C) Outbox and mutations (`src/features/sync/outbox/`)

- `workoutMutations.ts`: `addExerciseOptimistic`, `updateExerciseSupersetOptimistic` pass only allowed fields to `upsertWorkoutExerciseFromClient`
- `workoutMutations.ts`: `addSetOptimistic`, `updateSetOptimistic` use `upsertWorkoutSetFromClient` / `updateWorkoutSet` with allowed fields only; optimistic return includes set_type, rir for local UI
- `worker.ts`: `update_set` handler passes only allowed fields to `updateWorkoutSet`
- `mergeWorkout.ts`: Removed superset fields from merged exercises structure
- `startRoutine.ts`: Exercise payloads omit superset fields

### D) UI controller (`src/features/workoutSession/controller/useWorkoutSessionController.ts`)

- `handleSaveSetBasic` / `handleSaveSetAdvanced`: No longer persist set_type, rir to DB; values kept locally during edit, discarded on save

### E) Regression test

- `__tests__/contract-db-payloads.test.ts`: Asserts workout*exercises and workout_sets insert payload keys are subsets of allowed keys; explicitly checks superset*\*, set_type, rir are excluded

---

## 3. Why This Fixes Runtime Failures

- **PostgREST "column does not exist"**: Live DB lacks these columns. Any select or insert/upsert referencing them fails.
- **Strict contract**: Client now only sends columns that exist in DB. Outbox replay, optimistic mutations, and direct writes all use the same whitelisted columns.
- **Projection remains local**: set*type, rir, superset*\* are kept in projection and UI state for display but never sent to Supabase.

---

## 4. Files Modified

| File                                                                    | Changes                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/types/db.ts`                                                       | Removed phantom fields from Insert/Update for workout_exercises, workout_sets        |
| `src/db/workouts.ts`                                                    | Input types and write paths use allowed keys only; fetchWorkoutDetail select trimmed |
| `src/features/sync/outbox/workoutMutations.ts`                          | DB calls use allowed fields; optimistic returns include set_type/rir for UI          |
| `src/features/sync/outbox/worker.ts`                                    | update_set handler strips set_type, rir                                              |
| `src/features/sync/outbox/mergeWorkout.ts`                              | Dropped superset fields from merged structure                                        |
| `src/features/routines/startRoutine.ts`                                 | Exercise payloads omit superset                                                      |
| `src/features/workoutSession/controller/useWorkoutSessionController.ts` | Set save paths do not persist set_type, rir                                          |
| `__tests__/contract-db-payloads.test.ts`                                | New regression test                                                                  |

---

## 5. Production/Staging Verification Checklist

- [ ] `npx tsc --noEmit` passes
- [ ] `npm test` passes (including `contract-db-payloads.test.ts`)
- [ ] Grep for removed fields in DB write paths returns zero:
  - `superset_group_id`, `superset_order` in workout_exercises inserts/upserts
  - `set_type`, `rir` in workout_sets inserts/updates
- [ ] Manual smoke test:
  1. Create routine with ≥1 item (saves to Supabase via `upsert_routine_with_items_atomic`)
  2. Schedule a day (via `schedule_routine_for_date` or existing UI)
  3. Start scheduled workout (`start_scheduled_workout`)
  4. Add ≥1 set to first exercise
  5. Confirm sync completes (no PostgREST errors, no outbox stuck)
- [ ] No "column does not exist" errors in logs for workout_exercises or workout_sets

---

## 6. Optional: RLS Patch

Recommended migration to add `WITH CHECK (user_id = auth.uid())` to `scheduled_routines_update_own` policy. Not required for contract alignment; improves security.
