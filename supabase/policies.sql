alter table exercise_definitions enable row level security;
alter table workouts enable row level security;
alter table workout_exercises enable row level security;
alter table workout_sets enable row level security;
alter table routines enable row level security;
alter table routine_items enable row level security;
alter table scheduled_routines enable row level security;
alter table user_settings enable row level security;
alter table checkin_photos enable row level security;

grant select, insert, update, delete on exercise_definitions to authenticated;

-- exercise_definitions: system read + owner CRUD
create policy "exercise_definitions_select_authenticated"
on exercise_definitions for select
to authenticated
using (
  scope = 'system'
  or owner_user_id = (select auth.uid())
);

create policy "exercise_definitions_insert_own"
on exercise_definitions for insert
to authenticated
with check (
  owner_user_id = (select auth.uid())
  and scope = 'user'
);

create policy "exercise_definitions_update_own"
on exercise_definitions for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

create policy "exercise_definitions_delete_own"
on exercise_definitions for delete
to authenticated
using (owner_user_id = (select auth.uid()));

-- workouts: owner-only access
create policy "workouts_select_own"
on workouts for select
to authenticated
using (user_id = (select auth.uid()));

create policy "workouts_insert_own"
on workouts for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "workouts_update_own"
on workouts for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "workouts_delete_own"
on workouts for delete
to authenticated
using (user_id = (select auth.uid()));

-- workout_exercises: access via parent workout
create policy "workout_exercises_select_own"
on workout_exercises for select
to authenticated
using (
  exists (
    select 1 from workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = (select auth.uid())
  )
);

create policy "workout_exercises_insert_own"
on workout_exercises for insert
to authenticated
with check (
  exists (
    select 1 from workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = (select auth.uid())
  )
);

create policy "workout_exercises_update_own"
on workout_exercises for update
to authenticated
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

create policy "workout_exercises_delete_own"
on workout_exercises for delete
to authenticated
using (
  exists (
    select 1 from workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = (select auth.uid())
  )
);

-- workout_sets: access via parent workout_exercises -> workouts
create policy "workout_sets_select_own"
on workout_sets for select
to authenticated
using (
  exists (
    select 1
    from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_sets.workout_exercise_id
      and w.user_id = (select auth.uid())
  )
);

create policy "workout_sets_insert_own"
on workout_sets for insert
to authenticated
with check (
  exists (
    select 1
    from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_sets.workout_exercise_id
      and w.user_id = (select auth.uid())
  )
);

create policy "workout_sets_update_own"
on workout_sets for update
to authenticated
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

create policy "workout_sets_delete_own"
on workout_sets for delete
to authenticated
using (
  exists (
    select 1
    from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_sets.workout_exercise_id
      and w.user_id = (select auth.uid())
  )
);

-- routines: owner-only access
create policy "routines_select_own"
on routines for select
to authenticated
using (user_id = (select auth.uid()));

create policy "routines_insert_own"
on routines for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "routines_update_own"
on routines for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "routines_delete_own"
on routines for delete
to authenticated
using (user_id = (select auth.uid()));

-- routine_items: access via parent routine
create policy "routine_items_select_own"
on routine_items for select
to authenticated
using (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = (select auth.uid())
  )
);

create policy "routine_items_insert_own"
on routine_items for insert
to authenticated
with check (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = (select auth.uid())
  )
);

create policy "routine_items_update_own"
on routine_items for update
to authenticated
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

create policy "routine_items_delete_own"
on routine_items for delete
to authenticated
using (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = (select auth.uid())
  )
);

-- scheduled_routines: owner-only access
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

create policy "scheduled_routines_delete_own"
on scheduled_routines for delete
to authenticated
using (user_id = (select auth.uid()));

-- user_settings: owner-only access
create policy "user_settings_select_own"
on user_settings for select
to authenticated
using (user_id = (select auth.uid()));

create policy "user_settings_insert_own"
on user_settings for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "user_settings_update_own"
on user_settings for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "user_settings_delete_own"
on user_settings for delete
to authenticated
using (user_id = (select auth.uid()));

-- checkin_photos: owner-only access
create policy "checkin_photos_select_own"
on checkin_photos for select
to authenticated
using (user_id = (select auth.uid()));

create policy "checkin_photos_insert_own"
on checkin_photos for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and split_part(photo_path, '/', 1) = (select auth.uid())::text
);

create policy "checkin_photos_update_own"
on checkin_photos for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and split_part(photo_path, '/', 1) = (select auth.uid())::text
);

create policy "checkin_photos_delete_own"
on checkin_photos for delete
to authenticated
using (user_id = (select auth.uid()));

-- storage.objects: private check-ins bucket, user-folder scoped access
create policy "checkins_storage_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "checkins_storage_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "checkins_storage_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "checkins_storage_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ── google_calendar_connections ──────────────────────────────────────────────
alter table public.google_calendar_connections enable row level security;

create policy "google_calendar_connections_all_own"
on public.google_calendar_connections
for all
to authenticated
using  ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- ── scheduled_workout_calendar_links ─────────────────────────────────────────
alter table public.scheduled_workout_calendar_links enable row level security;

create policy "scheduled_workout_calendar_links_all_own"
on public.scheduled_workout_calendar_links
for all
to authenticated
using  ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
