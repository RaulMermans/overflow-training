# Phase 0 — Schema Proposal

> **Status:** Draft · 2026-03-03
> **Source of truth files:** `supabase/schema.sql`, `supabase/policies.sql`
> **Applies to:** Supabase (Postgres 15) project
> **Migration convention:** Add SQL blocks to `supabase/schema.sql` + `supabase/policies.sql` then apply via Supabase CLI or MCP.

---

## 0. Change Summary

| Change type          | Table                     | Change                                                                                                          |
| -------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **New table**        | `scheduled_routines`      | Date-specific scheduling (replaces implicit weekday plans for this flow)                                        |
| **Add column**       | `workouts`                | `scheduled_routine_id uuid FK → scheduled_routines`                                                             |
| **Add column**       | `workout_exercises`       | `planned_sets integer`, `planned_reps integer`, `planned_rest_seconds integer`                                  |
| **New RLS policies** | `scheduled_routines`      | Owner-only CRUD                                                                                                 |
| **New RLS policies** | `workouts`                | Extend existing RLS to cover `scheduled_routine_id` (no structural change needed; covered by existing policies) |
| **New/modified RPC** | `start_scheduled_workout` | Replace/extend `start_workout_from_routine` to snapshot planned targets and set back-reference                  |
| **New RPC**          | `schedule_routine`        | Creates a `scheduled_routines` row                                                                              |

---

## 1. New Table: `scheduled_routines`

```sql
-- supabase/schema.sql (add after routine_items block)

create table scheduled_routines (
  id             uuid        primary key default gen_random_uuid(),
  client_uuid    uuid        not null,
  user_id        uuid        not null references auth.users (id) on delete cascade,
  routine_id     uuid        not null references routines (id) on delete restrict,
  scheduled_date date        not null,
  status         text        not null default 'scheduled'
                             check (status in ('scheduled', 'started', 'completed', 'skipped')),
  workout_id     uuid        references workouts (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Unique indexes (matches project-wide pattern: named index, not inline constraint)
create unique index scheduled_routines_user_client_uuid_key
  on scheduled_routines (user_id, client_uuid);

create unique index scheduled_routines_user_date_key
  on scheduled_routines (user_id, scheduled_date);

-- Lookup indexes
create index idx_scheduled_routines_user_date
  on scheduled_routines (user_id, scheduled_date);

create index idx_scheduled_routines_status
  on scheduled_routines (user_id, status)
  where status = 'scheduled';

-- Updated_at trigger (reuse existing function)
create trigger touch_scheduled_routines_updated_at
  before update on scheduled_routines
  for each row execute function touch_updated_at();

-- RLS
alter table scheduled_routines enable row level security;
```

**Design notes:**

- `scheduled_date` is a `date` type (not `timestamptz`). The client sends the user's local date as `YYYY-MM-DD`. No timezone conversion occurs at the DB layer.
- `routine_id` uses `ON DELETE RESTRICT` — you cannot delete a routine that has associated scheduled routines. This preserves scheduling history integrity.
- `workout_id` uses `ON DELETE SET NULL` — if a workout is deleted (hypothetically), the scheduled routine survives with `workout_id = null` and `status = 'started'`. This is an edge case; see OQ-02.
- `UNIQUE (user_id, scheduled_date)` enforces one routine per day for MVP (see OQ-01). Removing this constraint later is non-breaking.
- `status = 'skipped'` is a soft-cancel. No hard delete of scheduled routines.

---

## 2. Alter Table: `workouts`

```sql
-- supabase/schema.sql (modify workouts block)

alter table workouts
  add column scheduled_routine_id uuid references scheduled_routines (id) on delete set null;

-- Optional index for back-navigation (scheduled routine → workout)
create index idx_workouts_scheduled_routine_id
  on workouts (scheduled_routine_id)
  where scheduled_routine_id is not null;
```

**Design notes:**

- `scheduled_routine_id` is **nullable** — preserves compatibility with any ad-hoc workout rows created before phase 0 migration.
- `ON DELETE SET NULL` — if a scheduled_routine row is somehow removed, the workout is preserved (history is sacred).
- Existing RLS policies on `workouts` are unaffected (they gate on `user_id = auth.uid()`).
- The back-reference enables: "show me the schedule context for this workout" in the UI.

---

## 3. Alter Table: `workout_exercises`

```sql
-- supabase/schema.sql (modify workout_exercises block)

alter table workout_exercises
  add column planned_sets          integer,
  add column planned_reps          integer,
  add column planned_rest_seconds  integer;
```

**Design notes:**

- All three columns are **nullable** — `routine_items` targets are optional; nulls pass through to the snapshot.
- These columns are **immutable** once set at snapshot time. The application layer must not update them after creation (enforce via application convention; a Postgres trigger may be added in a later phase if needed).
- `planned_rest_seconds` maps from `routine_items.rest` (which is already in seconds per current schema).
- Existing `workout_exercises` rows (from old `start_workout_from_routine` RPC) will have `null` in all three columns. This is acceptable.
- Existing RLS policies on `workout_exercises` are unaffected.
- `tracking_mode` is intentionally NOT added as a column — it lives in `exercise_definitions` and is resolved at read-time via JOIN. The `start_scheduled_workout` RPC includes it in the returned JSON for client convenience, but never stores it here.

---

## 4. New RPC: `schedule_routine`

```sql
-- supabase/schema.sql (add to RPCs section)

create or replace function schedule_routine(
  p_routine_id       uuid,
  p_client_uuid      uuid,
  p_scheduled_date   date
) returns jsonb
language plpgsql security invoker
as $$
declare
  v_routine   routines%rowtype;
  v_result    scheduled_routines%rowtype;
begin
  -- Ownership check (RLS also enforces this; explicit check for clear error)
  select * into v_routine
  from routines
  where id = p_routine_id
    and user_id = (select auth.uid());

  if not found then
    raise exception 'ROUTINE_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Validate date
  if p_scheduled_date is null then
    raise exception 'INVALID_DATE' using errcode = 'P0006';
  end if;

  -- Idempotency on date: if an active scheduled_routine already exists for this date, return it.
  -- This handles the case where the date constraint would fire before the client_uuid constraint.
  select * into v_result
  from scheduled_routines
  where user_id = (select auth.uid())
    and scheduled_date = p_scheduled_date
    and status = 'scheduled';

  if found then
    return to_jsonb(v_result);
  end if;

  -- Insert (idempotent via (user_id, client_uuid))
  insert into scheduled_routines (
    client_uuid,
    user_id,
    routine_id,
    scheduled_date,
    status
  ) values (
    p_client_uuid,
    (select auth.uid()),
    p_routine_id,
    p_scheduled_date,
    'scheduled'
  )
  on conflict (user_id, client_uuid) do nothing
  returning * into v_result;

  -- If conflict (duplicate client_uuid for this user), fetch existing row
  if v_result.id is null then
    select * into v_result
    from scheduled_routines
    where user_id = (select auth.uid())
      and client_uuid = p_client_uuid;
  end if;

  return to_jsonb(v_result);
end;
$$;
```

---

## 5. New RPC: `start_scheduled_workout`

```sql
-- supabase/schema.sql (add to RPCs section)
-- Replaces/supersedes start_workout_from_routine for the new loop.
-- start_workout_from_routine is preserved for backward compatibility.

create or replace function start_scheduled_workout(
  p_scheduled_routine_id uuid,
  p_workout_client_uuid  uuid
) returns jsonb
language plpgsql security invoker
as $$
declare
  v_sr          scheduled_routines%rowtype;
  v_workout_id  uuid;
  v_exercise    record;
  v_exercises   jsonb := '[]'::jsonb;
  v_we_id       uuid;
  v_we_client   uuid;
begin
  -- Lock and validate scheduled routine ownership
  select * into v_sr
  from scheduled_routines
  where id = p_scheduled_routine_id
    and user_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'SCHEDULED_ROUTINE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Idempotency: already started
  if v_sr.status = 'started' then
    -- Return existing workout data
    return jsonb_build_object(
      'workout_id',            v_sr.workout_id,
      'scheduled_routine_id',  v_sr.id,
      'started_at',            (select started_at from workouts where id = v_sr.workout_id),
      'exercises',             (
        select jsonb_agg(jsonb_build_object(
          'id',                       we.id,
          'client_uuid',              we.client_uuid,
          'exercise_definition_id',   we.exercise_definition_id,
          'order_index',              we.order_index,
          'planned_sets',             we.planned_sets,
          'planned_reps',             we.planned_reps,
          'planned_rest_seconds',     we.planned_rest_seconds,
          'tracking_mode',            ed.tracking_mode,
          'notes',                    we.notes
        ) order by we.order_index)
        from workout_exercises we
        join exercise_definitions ed on ed.id = we.exercise_definition_id
        where we.workout_id = v_sr.workout_id
      )
    );
  end if;

  -- Guard: cannot start a skipped routine
  if v_sr.status = 'skipped' then
    raise exception 'SCHEDULED_ROUTINE_SKIPPED' using errcode = 'P0003';
  end if;

  -- Guard: no other in_progress workout
  if exists (
    select 1 from workouts
    where user_id = (select auth.uid())
      and status = 'in_progress'
  ) then
    raise exception 'WORKOUT_ALREADY_IN_PROGRESS' using errcode = 'P0004';
  end if;

  -- Guard: routine has at least one exercise
  if not exists (
    select 1 from routine_items
    where routine_id = v_sr.routine_id
  ) then
    raise exception 'ROUTINE_HAS_NO_EXERCISES' using errcode = 'P0005';
  end if;

  -- Create workout header (idempotent via (user_id, client_uuid))
  insert into workouts (
    client_uuid,
    user_id,
    scheduled_routine_id,
    started_at,
    status
  ) values (
    p_workout_client_uuid,
    (select auth.uid()),
    p_scheduled_routine_id,
    now(),
    'in_progress'
  )
  on conflict (user_id, client_uuid) do nothing
  returning id into v_workout_id;

  -- If workout already existed ((user_id, client_uuid) conflict), fetch its id
  if v_workout_id is null then
    select id into v_workout_id
    from workouts
    where user_id = (select auth.uid())
      and client_uuid = p_workout_client_uuid;
  end if;

  -- Snapshot: copy routine_items → workout_exercises
  -- NOTE: tracking_mode is NOT stored in workout_exercises. It lives in exercise_definitions
  -- and is resolved at read-time via JOIN. It is included here only in the returned JSON
  -- for client convenience, avoiding an extra round-trip after start.
  for v_exercise in (
    select
      ri.exercise_id,
      ri.order       as order_index,
      ri.sets        as planned_sets,
      ri.reps        as planned_reps,
      ri.rest        as planned_rest_seconds,
      ri.notes,
      ed.tracking_mode   -- read-time only; not stored
    from routine_items ri
    join exercise_definitions ed on ed.id = ri.exercise_id
    where ri.routine_id = v_sr.routine_id
    order by ri.order
  ) loop
    v_we_id     := gen_random_uuid();
    v_we_client := gen_random_uuid();

    -- tracking_mode intentionally omitted from INSERT (not a column on workout_exercises)
    insert into workout_exercises (
      id,
      client_uuid,
      workout_id,
      exercise_definition_id,
      order_index,
      planned_sets,
      planned_reps,
      planned_rest_seconds,
      notes
    ) values (
      v_we_id,
      v_we_client,
      v_workout_id,
      v_exercise.exercise_id,
      v_exercise.order_index,
      v_exercise.planned_sets,
      v_exercise.planned_reps,
      v_exercise.planned_rest_seconds,
      v_exercise.notes
    );

    v_exercises := v_exercises || jsonb_build_object(
      'id',                     v_we_id,
      'client_uuid',            v_we_client,
      'exercise_definition_id', v_exercise.exercise_id,
      'order_index',            v_exercise.order_index,
      'planned_sets',           v_exercise.planned_sets,
      'planned_reps',           v_exercise.planned_reps,
      'planned_rest_seconds',   v_exercise.planned_rest_seconds,
      'tracking_mode',          v_exercise.tracking_mode,   -- from JOIN, not from stored column
      'notes',                  v_exercise.notes
    );
  end loop;

  -- Mark scheduled routine as started
  update scheduled_routines
  set
    status     = 'started',
    workout_id = v_workout_id,
    updated_at = now()
  where id = p_scheduled_routine_id;

  return jsonb_build_object(
    'workout_id',           v_workout_id,
    'scheduled_routine_id', p_scheduled_routine_id,
    'started_at',           now(),
    'exercises',            v_exercises
  );
end;
$$;
```

---

## 6. New RLS Policies: `scheduled_routines`

```sql
-- supabase/policies.sql (add after routine_items policies)

grant select, insert, update on scheduled_routines to authenticated;
-- No DELETE grant — use status='skipped' instead

create policy "scheduled_routines_select_own"
on scheduled_routines for select
to authenticated
using (user_id = (select auth.uid()));

create policy "scheduled_routines_insert_own"
on scheduled_routines for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "scheduled_routines_update_own"
on scheduled_routines for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- No delete policy: scheduled_routines are never hard-deleted in phase 0
```

---

## 7. Soft Delete Stance

| Entity               | Approach                        | Rationale                                                            |
| -------------------- | ------------------------------- | -------------------------------------------------------------------- |
| `scheduled_routines` | `status='skipped'`              | Preserves history; no hard delete                                    |
| "Unschedule" action  | `UPDATE status='skipped'`       | No hard DELETE in phase 0; skipped rows remain visible for audit     |
| `workouts`           | No delete in phase 0            | Workout history is immutable                                         |
| `workout_exercises`  | No delete                       | Snapshot is immutable                                                |
| `workout_sets`       | Soft: possible future flag      | In phase 0, sets may be deleted while workout is in_progress         |
| `routines`           | Existing behavior (hard delete) | `ON DELETE RESTRICT` on `scheduled_routines.routine_id` adds a guard |
| `routine_items`      | Existing behavior               | Routine edits do not affect past workouts (snapshot decouples them)  |

---

## 8. Migration Notes

### 8.1 Order of Operations

Apply changes in this order to respect FK constraints:

```
1. Add `scheduled_routines` table (no FKs to workouts yet — workout_id is nullable)
2. Add `workouts.scheduled_routine_id` column
3. Add `workout_exercises.planned_*` columns
4. Create `schedule_routine` RPC
5. Create `start_scheduled_workout` RPC
6. Apply `scheduled_routines` RLS policies
7. Grant permissions
```

### 8.2 Backward Compatibility

- Existing `workouts` rows: `scheduled_routine_id = null`. No migration needed.
- Existing `workout_exercises` rows: `planned_* = null`. No migration needed.
- Existing `start_workout_from_routine` RPC: preserved unchanged for backward compatibility. New code uses `start_scheduled_workout` instead.
- Existing `plans`/`plan_days` tables: untouched. They are not part of this flow.

### 8.3 Type Sync Required

After applying schema changes, update `src/types/db.ts`:

```typescript
// Add to Tables type:
scheduled_routines: {
  Row: {
    id: string
    client_uuid: string
    user_id: string
    routine_id: string
    scheduled_date: string // date as string
    status: 'scheduled' | 'started' | 'completed' | 'skipped'
    workout_id: string | null
    created_at: string
    updated_at: string
  }
  Insert: Omit<Tables['scheduled_routines']['Row'], 'id' | 'created_at' | 'updated_at'>
  Update: Partial<Tables['scheduled_routines']['Insert']>
}

// Extend workouts.Row:
scheduled_routine_id: string | null // NEW

// Extend workout_exercises.Row:
planned_sets: number | null // NEW
planned_reps: number | null // NEW
planned_rest_seconds: number | null // NEW
```

### 8.4 Verification Steps

After migration, run queries from `docs/SUPABASE_VERIFY.md` and additionally:

```sql
-- Verify new table exists with correct columns
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'scheduled_routines'
order by ordinal_position;

-- Verify workout_exercises has planned columns
select column_name from information_schema.columns
where table_name = 'workout_exercises'
  and column_name like 'planned_%';

-- Verify RLS is enabled
select tablename, rowsecurity
from pg_tables
where tablename = 'scheduled_routines';

-- Verify RPCs exist
select proname from pg_proc
where proname in ('schedule_routine', 'start_scheduled_workout');
```
