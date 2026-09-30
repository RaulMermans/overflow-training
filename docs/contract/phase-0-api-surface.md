# Phase 0 — API Surface

> **Status:** Draft · 2026-03-03
> **Backend:** Supabase (PostgREST auto-API + custom RPCs)
> **Client abstraction:** `src/db/workouts.ts` (and a new `src/db/scheduling.ts`)
> All error shapes follow PostgREST/Supabase error envelope: `{ code, message, details, hint }`

---

## 0. Principles

1. **No direct Supabase calls from `app/` routes** — all calls go through `src/db/*.ts`.
2. **RPCs for multi-step mutations** — anything touching ≥2 tables atomically is a Postgres function.
3. **PostgREST direct table access for single-table reads/writes** — sets, routine items, etc.
4. **client_uuid first** — client generates UUID before the write; server uses `ON CONFLICT (client_uuid) DO UPDATE` for idempotent upserts.
5. **Errors are typed** — custom Postgres error codes are mapped to typed client errors in `src/db/*.ts`.

---

## 1. New Client Module: `src/db/scheduling.ts`

This module does not exist yet. It encapsulates all `scheduled_routines` operations.

---

## 2. RPCs (Postgres Functions)

### 2.1 `schedule_routine`

**Purpose:** Create a `scheduled_routines` row. Validates routine ownership. No snapshot.

**Signature:**

```sql
create or replace function schedule_routine(
  p_routine_id       uuid,
  p_client_uuid      uuid,
  p_scheduled_date   date
) returns jsonb
language plpgsql security definer
```

**Client call (`src/db/scheduling.ts`):**

```typescript
export async function scheduleRoutine(params: {
  routineId: string
  clientUuid: string // caller generates: crypto.randomUUID()
  scheduledDate: string // YYYY-MM-DD
}): Promise<ScheduledRoutine>
```

**Request body (PostgREST RPC):**

```json
{
  "p_routine_id": "uuid",
  "p_client_uuid": "uuid",
  "p_scheduled_date": "2026-03-10"
}
```

**Success response `200`:**

```json
{
  "id": "uuid",
  "client_uuid": "uuid",
  "user_id": "uuid",
  "routine_id": "uuid",
  "scheduled_date": "2026-03-10",
  "status": "scheduled",
  "workout_id": null,
  "created_at": "2026-03-03T12:00:00Z",
  "updated_at": "2026-03-03T12:00:00Z"
}
```

**Errors:**
| Code | HTTP | Condition |
|------|------|-----------|
| `ROUTINE_NOT_FOUND` | 404 | `routine_id` does not belong to `auth.uid()` |
| `INVALID_DATE` | 422 | `scheduled_date` is null or malformed |
| `23505` | 409 | Duplicate `client_uuid` (idempotent: return existing row) |

**Idempotency:** On `client_uuid` conflict, return existing row unchanged (treat as success).

---

### 2.2 `start_scheduled_workout`

**Purpose:** Atomic snapshot — creates `workouts` + `workout_exercises` from routine template; marks schedule as started.

**Signature:**

```sql
create or replace function start_scheduled_workout(
  p_scheduled_routine_id uuid,
  p_workout_client_uuid  uuid
) returns jsonb
language plpgsql security definer
```

**Client call (`src/db/scheduling.ts`):**

```typescript
export async function startScheduledWorkout(params: {
  scheduledRoutineId: string
  workoutClientUuid: string // caller generates: crypto.randomUUID()
}): Promise<StartWorkoutResult>

type StartWorkoutResult = {
  workoutId: string
  scheduledRoutineId: string
  exercises: SnapshotExercise[]
}

type SnapshotExercise = {
  id: string // workout_exercise.id
  clientUuid: string
  exerciseDefinitionId: string
  orderIndex: number
  plannedSets: number | null
  plannedReps: number | null
  plannedRestSeconds: number | null
  trackingMode: string // from exercise_definitions.tracking_mode
  notes: string | null
}
```

**Request body:**

```json
{
  "p_scheduled_routine_id": "uuid",
  "p_workout_client_uuid": "uuid"
}
```

**Success response `200`:**

```json
{
  "workout_id": "uuid",
  "scheduled_routine_id": "uuid",
  "started_at": "2026-03-10T09:00:00Z",
  "exercises": [
    {
      "id": "uuid",
      "client_uuid": "uuid",
      "exercise_definition_id": "uuid",
      "order_index": 1,
      "planned_sets": 3,
      "planned_reps": 10,
      "planned_rest_seconds": 90,
      "tracking_mode": "reps_weight",
      "notes": "Keep elbows tucked"
    }
  ]
}
```

**Errors:**
| Code | HTTP | Condition |
|------|------|-----------|
| `SCHEDULED_ROUTINE_NOT_FOUND` | 404 | `scheduled_routine_id` not owned by `auth.uid()` |
| `SCHEDULED_ROUTINE_SKIPPED` | 409 | `status = 'skipped'` — cannot start a skipped routine |
| `WORKOUT_ALREADY_IN_PROGRESS` | 409 | User already has a `status='in_progress'` workout |
| `ROUTINE_HAS_NO_EXERCISES` | 422 | The routine has 0 `routine_items` |
| `23505` | 200 | `p_workout_client_uuid` conflict — idempotent, return existing |

**Idempotency:**

- If `scheduled_routines.status = 'started'`, return existing workout data immediately.
- If `p_workout_client_uuid` conflicts, return existing workout data.
- Both paths return `200` with the existing workout — no duplicate rows created.

### 2.3 Legacy: `start_workout_from_routine`

**Purpose:** Current RPC used to start a workout from a routine by ID (no schedule). Preserved for backward compatibility until `start_scheduled_workout` and scheduling UI exist.

**Idempotency:** **Not idempotent.** Each call creates a new workout and N new workout_exercises rows. The future `start_scheduled_workout` RPC will be idempotent via `scheduled_routine_id` and status guard.

---

## 3. PostgREST Direct Table Access

### 3.1 List Scheduled Routines

**Client call (`src/db/scheduling.ts`):**

```typescript
export async function fetchScheduledRoutines(params: {
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string // YYYY-MM-DD
  status?: 'scheduled' | 'started' | 'skipped'
}): Promise<ScheduledRoutine[]>
```

**PostgREST query:**

```
GET /rest/v1/scheduled_routines
  ?user_id=eq.{auth.uid()}          -- enforced by RLS; included for index hint
  &scheduled_date=gte.{dateFrom}
  &scheduled_date=lte.{dateTo}
  &status=eq.scheduled              -- optional filter
  &select=*,routines(id,name,color)
  &order=scheduled_date.asc
```

**Response:** Array of `scheduled_routines` rows with embedded `routines` join.

**Pagination:** None required in phase 0. A user typically has O(days) scheduled routines. Defer cursor pagination.

---

### 3.2 Skip a Scheduled Routine

**Client call (`src/db/scheduling.ts`):**

```typescript
export async function skipScheduledRoutine(params: { scheduledRoutineId: string }): Promise<void>
```

**PostgREST call:**

```
PATCH /rest/v1/scheduled_routines?id=eq.{id}
Body: { "status": "skipped" }
```

**Precondition:** `status` must be `'scheduled'`. If `status = 'started'`, PostgREST returns 0 rows updated (client must detect and surface error). RLS ensures only the owner can update.

**Errors:**
| Condition | Outcome |
|-----------|---------|
| `status != 'scheduled'` | 0 rows affected; client raises `CANNOT_SKIP_STARTED_ROUTINE` |
| Not owner | 0 rows affected (RLS); client raises `NOT_FOUND` |

---

### 3.3 Fetch Active Workout

**Client call (`src/db/workouts.ts` — existing pattern):**

```typescript
export async function fetchInProgressWorkout(): Promise<WorkoutDetail | null>
```

**PostgREST query:**

```
GET /rest/v1/workouts
  ?user_id=eq.{auth.uid()}
  &status=eq.in_progress
  &select=*,
         scheduled_routines(id,routine_id,scheduled_date),
         workout_exercises(
           *,
           workout_sets(*),
           exercise_definitions(id,name,category,tracking_mode,primary_muscles)
         )
  &limit=1
```

**Response:** Single workout with nested exercises, sets, and exercise metadata. Null if no in-progress workout.

---

### 3.4 Add / Update a Set

**Client call (`src/db/workouts.ts`):**

```typescript
export async function upsertSet(params: {
  clientUuid: string
  workoutExerciseId: string
  setIndex: number
  reps?: number
  weight?: number
  weightKg?: number
  isWeightCanonical?: boolean
  durationSeconds?: number
  distanceM?: number
  setType?: string
  rir?: number
  isCompleted?: boolean
}): Promise<WorkoutSet>
```

**PostgREST call:**

```
POST /rest/v1/workout_sets
Headers: Prefer: resolution=merge-duplicates
Body: {
  "client_uuid": "uuid",
  "workout_exercise_id": "uuid",
  "set_index": 1,
  "reps": 10,
  "weight": 100,
  "weight_kg": 45.36,
  "is_weight_canonical": false,
  "is_completed": false
}
```

**Idempotency:** `ON CONFLICT (client_uuid) DO UPDATE` via `Prefer: resolution=merge-duplicates`. Safe to call multiple times with same `client_uuid`.

**Errors:**
| Code | Condition |
|------|-----------|
| `42501` / `0 rows` | RLS: `workout_exercise_id` not owned by `auth.uid()` |

---

### 3.5 Complete Workout

**Client call (`src/db/workouts.ts`):**

```typescript
export async function finishWorkout(params: {
  workoutId: string
  endedAt: string // ISO timestamp
}): Promise<Workout>
```

**PostgREST call:**

```
PATCH /rest/v1/workouts?id=eq.{workoutId}
Body: {
  "status": "completed",
  "ended_at": "2026-03-10T10:15:00Z"
}
```

**Errors:**
| Condition | Outcome |
|-----------|---------|
| Workout not owned by user | 0 rows affected (RLS) |
| Workout already completed | 0 rows affected (idempotent; client may re-fetch) |

---

## 4. Read Flows (Queries)

### 4.1 List Routines (for Schedule screen)

```typescript
// src/db/workouts.ts (existing) or src/db/scheduling.ts
export async function fetchRoutines(): Promise<RoutineWithItemCount[]>
```

```
GET /rest/v1/routines
  ?user_id=eq.{auth.uid()}
  &select=*,routine_items(count)
  &order=pinned.desc,updated_at.desc
```

### 4.2 Fetch Routine Detail (for preview before scheduling)

```typescript
export async function fetchRoutineDetail(routineId: string): Promise<RoutineDetail>
```

```
GET /rest/v1/routines
  ?id=eq.{routineId}
  &select=*,
         routine_items(
           *,
           exercise_definitions(id,name,category,tracking_mode,primary_muscles)
         )
  &limit=1
```

### 4.3 List System Exercise Definitions (for routine builder)

```typescript
export async function fetchExerciseDefinitions(params?: {
  category?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<ExerciseDefinition[]>
```

```
GET /rest/v1/exercise_definitions
  ?scope=eq.system
  &category=eq.{category}          -- optional
  &name=ilike.*{search}*           -- optional
  &select=id,name,category,tracking_mode,primary_muscles,secondary_muscles
  &order=name.asc
  &limit=50&offset=0
```

**Pagination:** Limit/offset. 50 records per page. Simple scroll-based pagination in UI.

---

## 5. Error Code Registry

| Client error code             | Postgres signal | HTTP | Description                                    |
| ----------------------------- | --------------- | ---- | ---------------------------------------------- |
| `ROUTINE_NOT_FOUND`           | `P0001`         | 404  | Routine not owned by auth.uid()                |
| `SCHEDULED_ROUTINE_NOT_FOUND` | `P0002`         | 404  | Scheduled routine not found or not owned       |
| `SCHEDULED_ROUTINE_SKIPPED`   | `P0003`         | 409  | Cannot start a skipped scheduled routine       |
| `WORKOUT_ALREADY_IN_PROGRESS` | `P0004`         | 409  | User has an existing in_progress workout       |
| `ROUTINE_HAS_NO_EXERCISES`    | `P0005`         | 422  | Cannot start a workout from an empty routine   |
| `CANNOT_SKIP_STARTED_ROUTINE` | client-only     | 409  | 0-row PATCH detected; schedule already started |
| `NOT_FOUND`                   | RLS / 0 rows    | 404  | Generic: row not found or not owned            |
| `NETWORK_ERROR`               | network         | —    | No Supabase response                           |

**Client-side error mapping (`src/db/scheduling.ts`):**

```typescript
function mapRpcError(error: PostgrestError): AppError {
  switch (error.code) {
    case 'P0001':
      return { type: 'ROUTINE_NOT_FOUND' }
    case 'P0002':
      return { type: 'SCHEDULED_ROUTINE_NOT_FOUND' }
    case 'P0003':
      return { type: 'SCHEDULED_ROUTINE_SKIPPED' }
    case 'P0004':
      return { type: 'WORKOUT_ALREADY_IN_PROGRESS' }
    case 'P0005':
      return { type: 'ROUTINE_HAS_NO_EXERCISES' }
    default:
      return { type: 'UNKNOWN', raw: error }
  }
}
```

---

## 6. Pagination Strategy

| Resource               | Strategy                  | Phase 0 limit |
| ---------------------- | ------------------------- | ------------- |
| `exercise_definitions` | limit/offset              | 50 per page   |
| `routines`             | none (small dataset)      | all           |
| `scheduled_routines`   | date range filter         | 14-day window |
| `workout_exercises`    | none (bounded by session) | all           |
| `workout_sets`         | none (bounded by session) | all           |

Cursor-based pagination deferred to a later phase.

---

## 7. Authorization Summary

| Endpoint                      | Auth required | Ownership enforced by           |
| ----------------------------- | ------------- | ------------------------------- |
| `schedule_routine` RPC        | yes           | RPC explicit check + RLS        |
| `start_scheduled_workout` RPC | yes           | RPC explicit check + RLS        |
| `GET scheduled_routines`      | yes           | RLS (`user_id = auth.uid()`)    |
| `PATCH scheduled_routines`    | yes           | RLS (`user_id = auth.uid()`)    |
| `GET workouts`                | yes           | RLS (`user_id = auth.uid()`)    |
| `PATCH workouts`              | yes           | RLS                             |
| `POST workout_sets`           | yes           | RLS chain                       |
| `PATCH workout_sets`          | yes           | RLS chain                       |
| `GET exercise_definitions`    | yes           | RLS (`scope='system'` OR owner) |
| `GET routines`                | yes           | RLS                             |
| `GET routine_items`           | yes           | RLS chain via routines          |
