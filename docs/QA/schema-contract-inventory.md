# Supabase Write Inventory (Improvement #2)

## Tables written by this app

| Table                | Write ops                              | File(s)                       | Sanitized |
| -------------------- | -------------------------------------- | ----------------------------- | --------- |
| `workouts`           | insert, upsert, update                 | `src/db/workouts.ts`          | Yes       |
| `workout_exercises`  | insert, upsert                         | `src/db/workouts.ts`          | Yes       |
| `workout_sets`       | insert, upsert, update                 | `src/db/workouts.ts`          | Yes       |
| `routines`           | upsert                                 | `src/db/routinesPlans.ts`     | Yes       |
| `routine_items`      | insert                                 | `src/db/routinesPlans.ts`     | Yes       |
| `scheduled_routines` | via RPC only (no direct insert/upsert) | `src/db/scheduledRoutines.ts` | N/A       |

## Write call sites (grouped by table)

### workouts

- `createWorkout` — `.insert(row)` — `workouts.ts` ~192 — sanitizeRow before insert
- `insertWorkoutIfMissingFromClient` — `.upsert(row, { ignoreDuplicates: true })` — ~328 — sanitizeRow
- `upsertWorkoutFromClient` — `.upsert(row)` — ~387 — sanitizeRow
- `finishWorkoutAt` — `.update(row)` — ~507 — sanitizeRow
- `finishWorkoutWithMetaAt` — `.update(row)` — ~543 — sanitizeRow
- `updateWorkoutSessionDate` — `.update(row)` — ~812 — sanitizeRow

### workout_exercises

- `addExerciseToWorkout` — `.insert(row)` — ~279 — sanitizeRow
- `upsertWorkoutExerciseFromClient` — `.upsert(row)` — ~411 — sanitizeRow
- `updateWorkoutExerciseNotes` — `.update(row)` — ~775 — sanitizeRow
- `copyWorkoutExerciseDefinitions` — `.insert(rows)` — ~858 — sanitizeRows
- `insertWorkoutExerciseDefinitions` — `.insert(rows)` — ~892 — sanitizeRows

### workout_sets

- `addSet` — `.insert(row)` — ~305 — sanitizeRow
- `upsertWorkoutSetFromClient` — `.upsert(row)` — ~456 — sanitizeRow
- `updateWorkoutSet` — `.update(row)` — ~487 — sanitizeRow

### routines

- `upsertRoutineWithItems` — `.upsert(routineRow)` — `routinesPlans.ts` ~181 — sanitizeRow

### routine_items

- `upsertRoutineWithItems` — `.insert(rows)` — `routinesPlans.ts` ~223 — sanitizeRows

### scheduled_routines

- No direct `.insert`/`.upsert`/`.update` — writes via RPCs `schedule_routine_for_date`, `start_scheduled_workout`

## Noise keys (excluded from live DB per ground truth)

| Table               | Excluded columns                      |
| ------------------- | ------------------------------------- |
| `workout_sets`      | `set_type`, `rir`                     |
| `workout_exercises` | `superset_group_id`, `superset_order` |

## Outbox worker write path

Worker sanitizes before every DB call:

- `create_workout` → sanitizeRow('workouts', payload) → insertWorkoutIfMissingFromClient
- `upsert_exercise` → sanitizeRow('workout_exercises', payload) → upsertWorkoutExerciseFromClient
- `upsert_set` → sanitizeRow('workout_sets', payload) → upsertWorkoutSetFromClient
- `update_set` → updateWorkoutSet (fields built without set_type/rir)
- `finish_workout` / `finish_workout_with_meta` / `cancel_workout` → no row payload

All Supabase writes occur inside `src/db/workouts.ts` and `src/db/routinesPlans.ts`.
