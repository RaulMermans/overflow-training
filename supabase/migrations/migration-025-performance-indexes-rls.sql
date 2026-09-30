-- Migration 025: Phase 4 performance hardening under RLS
-- 4A) Add indexes for UI hot paths (workouts timeline, routines sync, active plan)
-- 4B) Optimize RLS policies: auth.uid() -> (select auth.uid()) for single evaluation per statement
-- Safe to run multiple times (CREATE INDEX IF NOT EXISTS; policies are idempotent drop+create).

-- ============================================================
-- 4A: Performance indexes for hot queries
-- ============================================================

-- Workouts timeline: list workouts by user, order started_at desc
-- Covers: fetchWorkouts, fetchInProgressWorkout, listWorkoutsForUser, progress range
create index if not exists workouts_user_started_at_desc
  on public.workouts (user_id, started_at desc);

-- Routines sync: list routines by user, order updated_at desc
-- Covers: fetchCloudRoutinesWithItems
create index if not exists routines_user_updated_at_desc
  on public.routines (user_id, updated_at desc);

-- Active plan fetch: plans by user where active=true, order updated_at desc
-- Covers: fetchCloudActivePlan (eq user_id, eq active, order updated_at, limit 1)
create index if not exists plans_user_active_updated_at_desc
  on public.plans (user_id, updated_at desc)
  where active = true;

-- ============================================================
-- 4B: RLS policy optimization — (select auth.uid()) for single eval per statement
-- ============================================================

-- exercise_definitions
drop policy if exists "exercise_definitions_select_authenticated" on exercise_definitions;
create policy "exercise_definitions_select_authenticated"
on exercise_definitions for select to authenticated
using (
  scope = 'system'
  or owner_user_id = (select auth.uid())
);

drop policy if exists "exercise_definitions_insert_own" on exercise_definitions;
create policy "exercise_definitions_insert_own"
on exercise_definitions for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and scope = 'user'
);

drop policy if exists "exercise_definitions_update_own" on exercise_definitions;
create policy "exercise_definitions_update_own"
on exercise_definitions for update to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

drop policy if exists "exercise_definitions_delete_own" on exercise_definitions;
create policy "exercise_definitions_delete_own"
on exercise_definitions for delete to authenticated
using (owner_user_id = (select auth.uid()));

-- workouts
drop policy if exists "workouts_select_own" on workouts;
create policy "workouts_select_own"
on workouts for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "workouts_insert_own" on workouts;
create policy "workouts_insert_own"
on workouts for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "workouts_update_own" on workouts;
create policy "workouts_update_own"
on workouts for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "workouts_delete_own" on workouts;
create policy "workouts_delete_own"
on workouts for delete to authenticated
using (user_id = (select auth.uid()));

-- workout_exercises
drop policy if exists "workout_exercises_select_own" on workout_exercises;
create policy "workout_exercises_select_own"
on workout_exercises for select to authenticated
using (
  exists (
    select 1 from workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = (select auth.uid())
  )
);

drop policy if exists "workout_exercises_insert_own" on workout_exercises;
create policy "workout_exercises_insert_own"
on workout_exercises for insert to authenticated
with check (
  exists (
    select 1 from workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = (select auth.uid())
  )
);

drop policy if exists "workout_exercises_update_own" on workout_exercises;
create policy "workout_exercises_update_own"
on workout_exercises for update to authenticated
using (
  exists (
    select 1 from workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = (select auth.uid())
  )
);

drop policy if exists "workout_exercises_delete_own" on workout_exercises;
create policy "workout_exercises_delete_own"
on workout_exercises for delete to authenticated
using (
  exists (
    select 1 from workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = (select auth.uid())
  )
);

-- workout_sets
drop policy if exists "workout_sets_select_own" on workout_sets;
create policy "workout_sets_select_own"
on workout_sets for select to authenticated
using (
  exists (
    select 1
    from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_sets.workout_exercise_id
      and w.user_id = (select auth.uid())
  )
);

drop policy if exists "workout_sets_insert_own" on workout_sets;
create policy "workout_sets_insert_own"
on workout_sets for insert to authenticated
with check (
  exists (
    select 1
    from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_sets.workout_exercise_id
      and w.user_id = (select auth.uid())
  )
);

drop policy if exists "workout_sets_update_own" on workout_sets;
create policy "workout_sets_update_own"
on workout_sets for update to authenticated
using (
  exists (
    select 1
    from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_sets.workout_exercise_id
      and w.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_sets.workout_exercise_id
      and w.user_id = (select auth.uid())
  )
);

drop policy if exists "workout_sets_delete_own" on workout_sets;
create policy "workout_sets_delete_own"
on workout_sets for delete to authenticated
using (
  exists (
    select 1
    from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_sets.workout_exercise_id
      and w.user_id = (select auth.uid())
  )
);

-- routines
drop policy if exists "routines_select_own" on routines;
create policy "routines_select_own"
on routines for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "routines_insert_own" on routines;
create policy "routines_insert_own"
on routines for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "routines_update_own" on routines;
create policy "routines_update_own"
on routines for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "routines_delete_own" on routines;
create policy "routines_delete_own"
on routines for delete to authenticated
using (user_id = (select auth.uid()));

-- routine_items
drop policy if exists "routine_items_select_own" on routine_items;
create policy "routine_items_select_own"
on routine_items for select to authenticated
using (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "routine_items_insert_own" on routine_items;
create policy "routine_items_insert_own"
on routine_items for insert to authenticated
with check (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "routine_items_update_own" on routine_items;
create policy "routine_items_update_own"
on routine_items for update to authenticated
using (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "routine_items_delete_own" on routine_items;
create policy "routine_items_delete_own"
on routine_items for delete to authenticated
using (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = (select auth.uid())
  )
);

-- plans
drop policy if exists "plans_select_own" on plans;
create policy "plans_select_own"
on plans for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "plans_insert_own" on plans;
create policy "plans_insert_own"
on plans for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "plans_update_own" on plans;
create policy "plans_update_own"
on plans for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "plans_delete_own" on plans;
create policy "plans_delete_own"
on plans for delete to authenticated
using (user_id = (select auth.uid()));

-- plan_days
drop policy if exists "plan_days_select_own" on plan_days;
create policy "plan_days_select_own"
on plan_days for select to authenticated
using (
  exists (
    select 1
    from plans p
    where p.id = plan_days.plan_id
      and p.user_id = (select auth.uid())
  )
);

drop policy if exists "plan_days_insert_own" on plan_days;
create policy "plan_days_insert_own"
on plan_days for insert to authenticated
with check (
  exists (
    select 1
    from plans p
    where p.id = plan_days.plan_id
      and p.user_id = (select auth.uid())
  )
);

drop policy if exists "plan_days_update_own" on plan_days;
create policy "plan_days_update_own"
on plan_days for update to authenticated
using (
  exists (
    select 1
    from plans p
    where p.id = plan_days.plan_id
      and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from plans p
    where p.id = plan_days.plan_id
      and p.user_id = (select auth.uid())
  )
);

drop policy if exists "plan_days_delete_own" on plan_days;
create policy "plan_days_delete_own"
on plan_days for delete to authenticated
using (
  exists (
    select 1
    from plans p
    where p.id = plan_days.plan_id
      and p.user_id = (select auth.uid())
  )
);

-- user_settings
drop policy if exists "user_settings_select_own" on user_settings;
create policy "user_settings_select_own"
on user_settings for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "user_settings_insert_own" on user_settings;
create policy "user_settings_insert_own"
on user_settings for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "user_settings_update_own" on user_settings;
create policy "user_settings_update_own"
on user_settings for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "user_settings_delete_own" on user_settings;
create policy "user_settings_delete_own"
on user_settings for delete to authenticated
using (user_id = (select auth.uid()));

-- checkin_photos
drop policy if exists "checkin_photos_select_own" on checkin_photos;
create policy "checkin_photos_select_own"
on checkin_photos for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "checkin_photos_insert_own" on checkin_photos;
create policy "checkin_photos_insert_own"
on checkin_photos for insert to authenticated
with check (
  user_id = (select auth.uid())
  and split_part(photo_path, '/', 1) = (select auth.uid())::text
);

drop policy if exists "checkin_photos_update_own" on checkin_photos;
create policy "checkin_photos_update_own"
on checkin_photos for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and split_part(photo_path, '/', 1) = (select auth.uid())::text
);

drop policy if exists "checkin_photos_delete_own" on checkin_photos;
create policy "checkin_photos_delete_own"
on checkin_photos for delete to authenticated
using (user_id = (select auth.uid()));

-- storage.objects (checkins bucket)
drop policy if exists "checkins_storage_select_own" on storage.objects;
create policy "checkins_storage_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "checkins_storage_insert_own" on storage.objects;
create policy "checkins_storage_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "checkins_storage_update_own" on storage.objects;
create policy "checkins_storage_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "checkins_storage_delete_own" on storage.objects;
create policy "checkins_storage_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
