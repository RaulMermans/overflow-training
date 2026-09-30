# Phase 0 — Target Contract

> **Status:** Draft · 2026-03-03
> **Author:** Principal Backend Architect review pass
> **Scope:** Single backend loop — routine templates → date scheduling → workout snapshot → set tracking

---

## 0. Repo Grounding Summary

Evidence gathered from reading `supabase/schema.sql`, `supabase/policies.sql`, `src/db/workouts.ts`, `docs/architecture/DATA_AUTH_CONTRACT.md`, and the architecture docs.

**Current vs target:** Target `scheduled_routines` and `start_scheduled_workout` are applied (migration-034). Legacy `plans`/`plan_days` dropped (migration-035).

### Stack

- **Runtime:** Expo Router + React Native (iOS only), TypeScript strict
- **Backend:** Supabase — Postgres 15, PostgREST, Supabase Auth (JWT), Row Level Security
- **Sync identity:** `client_uuid` (UUID v4, generated client-side before network write)
- **Triggers:** `touch_updated_at()` on all sync-surface tables; `sync_exercise_type_from_category()` on `exercise_definitions`

### Existing Schema Gaps vs. Target Contract

| Gap                                       | Current state                                                                         | Required change                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| No date-specific scheduling               | `plans`/`plan_days` use weekday (0–6)                                                 | New `scheduled_routines` table (date + routine_id)             |
| Workout has no back-reference to schedule | `workouts` has no FK to scheduling                                                    | Add `scheduled_routine_id` column to `workouts`                |
| Snapshot omits planned targets            | `start_workout_from_routine` copies exercise_id + notes; omits `sets`, `reps`, `rest` | Add `planned_*` columns to `workout_exercises`; update RPC     |
| Custom exercises allowed                  | `exercise_definitions.scope='user'` path exists                                       | Out of scope for phase 0; no new UI path; enforce at RPC level |
| Idempotency gap on start                  | No guard against double-starting a scheduled routine                                  | `scheduled_routines.workout_id` + status='started' as guard    |

---

## 1. Glossary

| Term                    | Definition                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exercise Definition** | A canonical exercise record in `exercise_definitions` with `scope='system'`. The global, read-only library users pick from. Custom exercises (`scope='user'`) are out of scope for this phase. |
| **Routine**             | A user-owned, named template (`routines`) that contains an ordered list of exercises with target parameters. Mutable at any time; changes do NOT retroactively affect past workouts.           |
| **Routine Item**        | A single exercise slot in a routine (`routine_items`) with optional target `sets`, `reps`, `rest_seconds`, and `notes`.                                                                        |
| **Scheduled Routine**   | A user's intent to perform a specific routine on a specific calendar date (`scheduled_routines`). Contains only a reference (routine_id + date). No data is copied at schedule time.           |
| **Workout**             | A live or completed session header (`workouts`). Created atomically when the user _starts_ a scheduled routine. Carries a back-reference to the originating scheduled routine.                 |
| **Workout Exercise**    | A snapshotted exercise slot in an active workout (`workout_exercises`). Copied from the routine_item at start time, including planned targets. Immutable after creation.                       |
| **Workout Set**         | A single logged set (`workout_sets`) within a workout exercise. Mutable until the workout is completed.                                                                                        |
| **Snapshot**            | The atomic operation at workout-start time that copies routine_items → workout_exercises (with planned targets). Decouples workout history from future routine edits.                          |
| **client_uuid**         | A UUID v4 generated on the client before the network write. Used as the durable offline sync identity. Always present on rows that sync.                                                       |
| **scope='system'**      | Exercise definition visible to all authenticated users. Cannot be created by end users in this phase.                                                                                          |
| **RLS**                 | Row Level Security — all data access gated to `auth.uid()` at the Postgres layer.                                                                                                              |

---

## 2. Entities and Relationships

```
exercise_definitions (scope='system')
        │
        │ references (many-to-one)
        ▼
   routine_items ◄──── routines (user-owned template)
                              │
                              │ referenced by (many-to-one)
                              ▼
                    scheduled_routines (date + routine_id, no snapshot)
                              │
                              │ starts (one-to-one, at most)
                              ▼
                          workouts ◄──── workout_exercises (snapshot of routine_items)
                                                │
                                                │ contains (one-to-many)
                                                ▼
                                           workout_sets (user-tracked actual sets)
```

### Entity Definitions

#### `exercise_definitions` (read-only in this phase)

| Column            | Type    | Notes                              |
| ----------------- | ------- | ---------------------------------- |
| id                | uuid PK |                                    |
| scope             | text    | `'system'` only in this phase      |
| name              | text    |                                    |
| category          | text    | e.g. `'strength'`, `'cardio'`      |
| tracking_mode     | text    | e.g. `'reps_weight'`, `'duration'` |
| primary_muscles   | text[]  |                                    |
| secondary_muscles | text[]  |                                    |

#### `routines`

| Column      | Type                 | Notes                 |
| ----------- | -------------------- | --------------------- |
| id          | uuid PK              |                       |
| client_uuid | uuid UNIQUE          | Offline sync identity |
| user_id     | uuid FK → auth.users | Owner                 |
| name        | text                 |                       |
| description | text \| null         |                       |
| pinned      | boolean              |                       |
| updated_at  | timestamptz          | Auto-touched          |

#### `routine_items`

| Column      | Type                           | Notes                        |
| ----------- | ------------------------------ | ---------------------------- |
| id          | uuid PK                        |                              |
| client_uuid | uuid UNIQUE                    |                              |
| routine_id  | uuid FK → routines             |                              |
| exercise_id | uuid FK → exercise_definitions | Must be scope='system'       |
| order       | integer                        | Display order within routine |
| sets        | integer \| null                | Target sets                  |
| reps        | integer \| null                | Target reps                  |
| rest        | integer \| null                | Target rest in seconds       |
| notes       | text \| null                   | Coaching cue                 |

#### `scheduled_routines` _(new table)_

| Column         | Type                                          | Notes                                          |
| -------------- | --------------------------------------------- | ---------------------------------------------- |
| id             | uuid PK                                       |                                                |
| client_uuid    | uuid UNIQUE                                   | Offline sync identity                          |
| user_id        | uuid FK → auth.users                          | Owner                                          |
| routine_id     | uuid FK → routines ON DELETE RESTRICT         |                                                |
| scheduled_date | date                                          | User-local date (client sends ISO date string) |
| status         | text                                          | `'scheduled'` \| `'started'` \| `'skipped'`    |
| workout_id     | uuid FK → workouts ON DELETE SET NULL \| null | Populated at start time                        |
| created_at     | timestamptz                                   |                                                |
| updated_at     | timestamptz                                   | Auto-touched                                   |

#### `workouts` _(add column)_

| Column                   | Type                                                        | Notes                                            |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------ |
| id                       | uuid PK                                                     |                                                  |
| client_uuid              | uuid UNIQUE                                                 |                                                  |
| user_id                  | uuid FK → auth.users                                        |                                                  |
| **scheduled_routine_id** | **uuid FK → scheduled_routines ON DELETE SET NULL \| null** | **NEW — back-reference to originating schedule** |
| started_at               | timestamptz                                                 |                                                  |
| ended_at                 | timestamptz \| null                                         | Null until completed                             |
| status                   | text                                                        | `'in_progress'` \| `'completed'`                 |
| notes                    | text \| null                                                |                                                  |
| effort_rating            | integer \| null                                             |                                                  |
| session_note             | text \| null                                                |                                                  |

#### `workout_exercises` \_(add planned\_\_ columns)\*

| Column                   | Type                           | Notes                                           |
| ------------------------ | ------------------------------ | ----------------------------------------------- |
| id                       | uuid PK                        |                                                 |
| client_uuid              | uuid UNIQUE                    |                                                 |
| workout_id               | uuid FK → workouts             |                                                 |
| exercise_definition_id   | uuid FK → exercise_definitions |                                                 |
| order_index              | integer                        | Copied from routine_item.order at snapshot time |
| **planned_sets**         | **integer \| null**            | **NEW — copied from routine_item.sets**         |
| **planned_reps**         | **integer \| null**            | **NEW — copied from routine_item.reps**         |
| **planned_rest_seconds** | **integer \| null**            | **NEW — copied from routine_item.rest**         |
| notes                    | text \| null                   | Copied from routine_item.notes                  |
| superset_group_id        | uuid \| null                   | Existing; out of scope                          |

#### `workout_sets`

| Column              | Type                        | Notes                                        |
| ------------------- | --------------------------- | -------------------------------------------- |
| id                  | uuid PK                     |                                              |
| client_uuid         | uuid UNIQUE                 |                                              |
| workout_exercise_id | uuid FK → workout_exercises |                                              |
| set_index           | integer                     | 1-based within exercise                      |
| reps                | integer \| null             |                                              |
| weight              | numeric \| null             | Display unit (user pref)                     |
| weight_kg           | numeric \| null             | Canonical SI weight                          |
| is_weight_canonical | boolean                     | True when weight_kg is authoritative         |
| duration_seconds    | integer \| null             | For time-based exercises                     |
| distance_m          | numeric \| null             | For distance-based exercises                 |
| set_type            | text                        | `'normal'` \| `'warmup'` \| `'dropset'` etc. |
| rir                 | integer \| null             | Reps in reserve                              |
| is_completed        | boolean                     | User ticked the set                          |

---

## 3. Invariants

### Scheduling Invariants

- **I-SCHED-01:** `scheduled_routines.routine_id` must reference a routine owned by the same `user_id`.
- **I-SCHED-02:** `scheduled_routines.scheduled_date` is a calendar date in the user's local timezone. The API accepts ISO-8601 date strings (`YYYY-MM-DD`).
- **I-SCHED-03:** A scheduled routine may be rescheduled (date changed) only while `status = 'scheduled'`.
- **I-SCHED-04:** A scheduled routine may transition: `scheduled → started` (via start), `scheduled → skipped` (via skip). No other transitions.
- **I-SCHED-05:** Multiple scheduled routines for the same user on the same date are allowed (e.g., morning + evening). See Open Questions OQ-01.

### Start / Snapshot Invariants

- **I-START-01:** `start_scheduled_workout` is idempotent on `scheduled_routine_id`. If `scheduled_routines.status = 'started'`, return the existing `workout_id` without creating a new row.
- **I-START-02:** A workout may only be created from a `scheduled_routine` with `status = 'scheduled'`.
- **I-START-03:** `workout_exercises` rows created at snapshot time are immutable. The exercise list cannot change after the workout is started.
- **I-START-04:** `workout_exercises.planned_*` columns are populated from `routine_items` at snapshot time. If `routine_item.sets/reps/rest` is null, the corresponding `planned_*` column is also null.
- **I-START-05:** A user may have at most one `in_progress` workout at a time. Starting a second workout while one is in progress is an error (see error codes).
- **I-START-06:** `workouts.scheduled_routine_id` is set at creation time and is immutable.
- **I-START-07:** `workouts.user_id` must match `scheduled_routines.user_id`.

### Exercise Definition Invariants

- **I-EX-01:** `routine_items.exercise_id` must reference an `exercise_definitions` row with `scope = 'system'`. Creating routine items referencing `scope='user'` exercises is rejected at the RPC layer.
- **I-EX-02:** Exercise definitions are read-only in this phase. No insert/update/delete paths are exposed via the target API surface.

### RLS / Ownership Invariants

- **I-RLS-01:** Every table is scoped to `auth.uid()` directly (for owner tables) or via ownership chain (for child tables). No cross-user data access is possible.
- **I-RLS-02:** `scheduled_routines` access: owner-only via `user_id = auth.uid()`.
- **I-RLS-03:** `workout_exercises` and `workout_sets` RLS access chains remain unchanged: `workout_sets → workout_exercises → workouts → user_id`.

### Completion Invariants

- **I-COMP-01:** A workout transitions from `in_progress` to `completed` exactly once. `ended_at` is set at completion time.
- **I-COMP-02:** Workout sets may only be added/updated while `workouts.status = 'in_progress'`. Writes to sets of a completed workout are rejected.

---

## 4. State Transitions

### `scheduled_routines.status`

```
              [schedule_routine RPC]
                       │
                       ▼
                  ┌──────────┐
                  │scheduled │
                  └──────────┘
                   │        │
  [start_scheduled │        │ [skip_scheduled_routine]
        _workout]  │        │
                   ▼        ▼
               ┌───────┐ ┌────────┐
               │started│ │skipped │
               └───────┘ └────────┘
               (terminal) (terminal)
```

### `workouts.status`

```
  [start_scheduled_workout creates workout]
                   │
                   ▼
              ┌───────────┐
              │ in_progress│
              └───────────┘
                    │
      [finish_workout / complete_workout]
                    │
                    ▼
              ┌───────────┐
              │ completed  │
              └───────────┘
              (terminal)
```

### `workout_sets.is_completed`

```
  [add_set creates row]  →  is_completed = false
  [user taps complete]   →  is_completed = true
  (reversible while workout is in_progress)
```

---

## 5. Non-Goals (Phase 0)

The following are explicitly out of scope and must not be designed-in:

| Non-goal                                  | Rationale                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| Custom exercise creation (`scope='user'`) | Reduces surface area; global library is sufficient for MVP               |
| Ad-hoc workouts (no schedule)             | Every workout in phase 0 originates from a scheduled routine             |
| Recurring schedule / repeat patterns      | Date-specific only; no weekday recurrence UI in phase 0                  |
| Plan / plan_days system changes           | Existing plan model is preserved but not extended                        |
| Superset / superset_group_id logic        | Existing columns preserved; no new superset UI                           |
| Social / sharing                          | Owner-only data throughout                                               |
| Offline-first conflict resolution         | client_uuid prevents duplicate inserts; full merge logic is out of scope |
| Push notifications for scheduled routines | No notification infrastructure in phase 0                                |
| REST pagination on workout_sets           | Volume is bounded per session; cursor pagination deferred                |
| Effort rating / session notes write path  | Columns exist; write path deferred to a later phase                      |

---

## 6. Ownership Model

| Table                  | Owner column                               | RLS anchor                                                          |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `exercise_definitions` | `owner_user_id` (null for system)          | `scope='system'` readable by all authenticated                      |
| `routines`             | `user_id`                                  | Direct: `user_id = auth.uid()`                                      |
| `routine_items`        | via `routines.user_id`                     | Chain: `routine_id → routines.user_id`                              |
| `scheduled_routines`   | `user_id`                                  | Direct: `user_id = auth.uid()`                                      |
| `workouts`             | `user_id`                                  | Direct: `user_id = auth.uid()`                                      |
| `workout_exercises`    | via `workouts.user_id`                     | Chain: `workout_id → workouts.user_id`                              |
| `workout_sets`         | via `workout_exercises → workouts.user_id` | Chain: `workout_exercise_id → workout_exercises → workouts.user_id` |

---

## 7. Authorization Rules

All rules are enforced at the Supabase RLS layer. Application code must not rely on client-side filtering as the sole security control.

1. Authenticated session required for all operations (`to authenticated`).
2. `scheduled_routines`: owner-only select/insert/update. No delete (use status='skipped').
3. `workouts`: owner-only select/insert/update. No delete.
4. `workout_exercises`: insert/select via parent workout ownership. No update after creation (immutable snapshot).
5. `workout_sets`: CRUD via `workout_exercises → workouts` ownership chain.
6. `exercise_definitions` select: `scope='system'` rows visible to all authenticated users.
7. RPCs (`schedule_routine`, `start_scheduled_workout`) validate `auth.uid()` ownership before any mutation. They do NOT inherit RLS implicitly — ownership checks are explicit within the function body (SECURITY DEFINER if necessary, with explicit checks).

---

## 8. Phase 0 Exit Criteria Checklist

The following must be enforceable by schema + API + DB logic before Phase 1 merges:

| Criterion                                                            | Enforced by                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **No custom exercises**                                              | RPC/API: routine_items.exercise_id must reference exercise_definitions with scope='system'; no insert path for scope='user' in target loop |
| **Schedule = routine reference (no snapshot at schedule-time)**      | Schema: scheduled_routines stores only routine_id + scheduled_date; no copy of routine_items at insert                                     |
| **Start = snapshot into workout_exercises (snapshot at start-time)** | RPC: start_workout_from_routine / start_scheduled_workout copies routine_items → workout_exercises in one transaction                      |
| **Single supported loop**                                            | Docs + API: 1) Build routine from exercise_definitions 2) Schedule on date 3) Start → workout instance 4) Track sets                       |
| **Ownership**                                                        | RLS + explicit auth.uid() checks in RPCs; all tables scoped to user_id or ownership chain                                                  |
