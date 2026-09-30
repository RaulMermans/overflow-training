# Beta Backend Readiness Checklist

Scope: `scheduled_routines` RLS ownership invariant + scheduling RPC behavior.

## 1) Policy Checks

Run:

```sql
select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'scheduled_routines'
  and policyname = 'scheduled_routines_update_own';
```

Expected:

- one row
- `cmd = UPDATE`
- `qual = (user_id = auth.uid())`
- `with_check = (user_id = auth.uid())`

## 2) Index Checks

Run:

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'scheduled_routines'
order by indexname;
```

Expected includes:

- `scheduled_routines_pkey`
- `scheduled_routines_user_date_idx`
- unique index/constraint for `(user_id, date)` (`scheduled_routines_user_date_unique`)

## 3) RPC Definition Checks

Run:

```sql
select pg_get_functiondef('public.schedule_routine_for_date(date, uuid)'::regprocedure) as definition;
select pg_get_functiondef('public.start_scheduled_workout(date)'::regprocedure) as definition;
```

Expected for `schedule_routine_for_date`:

- `for update` row lock on `scheduled_routines`
- `workout_in_progress` error branch
- completed-workout reset behavior (`workout_id = null`, `status = 'scheduled'`) before routine switch

Expected for `start_scheduled_workout`:

- `for update` row lock on `scheduled_routines`
- `no_schedule_for_date` error branch
- idempotent return for `in_progress`
- completed-workout reset behavior (`workout_id = null`, `status = 'scheduled'`) and new workout creation

## 4) Auth-Aware Smoke Tests

These scripts set `request.jwt.claims` to simulate authenticated context and assert `auth.uid()` is non-null.

Run:

```bash
supabase db execute --file scripts/db/smoke-test-scheduled-routines-rls.sql
supabase db execute --file scripts/db/smoke-test-scheduling-rpcs.sql
```

Expected:

- `SMOKE RLS: OK — scheduled_routines.user_id ownership is immutable by UPDATE`
- `SMOKE RPC: OK — scheduling RPC hardening behavior verified`

## 5) Manual QA Flow

1. Create two routines with at least one item each.
2. Schedule routine A for a date.
3. Start scheduled workout (workout created).
4. Complete workout.
5. Change scheduled routine to B for same date.
6. Start scheduled workout again.
7. Verify new workout id is different from step 3 workout id.
8. While workout is `in_progress`, attempt to change routine again.
9. Verify RPC returns `{ "error": "workout_in_progress" }` and schedule remains unchanged.

## 6) Known Limitations

- Smoke scripts require:
  - at least one user in `auth.users`
  - at least one non-deleted system exercise in `public.exercise_definitions`
- Scripts operate on future test dates (`current_date + 30/31`) to avoid colliding with active-day schedules.

## 7) Rollback Plan

### Rollback policy migration (`migration-038-scheduled-routines-update-with-check.sql`)

```sql
drop policy if exists scheduled_routines_update_own on public.scheduled_routines;

create policy "scheduled_routines_update_own"
  on public.scheduled_routines for update to authenticated
  using (user_id = auth.uid())
  with check (null);
```

### Rollback RPC hardening (if a future RPC migration is applied)

Reapply the prior known-good SQL definitions from:

- `supabase/migrations/migration-037-schedule-change-in-progress-block.sql`

Apply both function definitions again:

- `public.schedule_routine_for_date(date, uuid)`
- `public.start_scheduled_workout(date)`
