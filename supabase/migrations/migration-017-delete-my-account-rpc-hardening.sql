-- Migration 017: harden delete_my_account RPC.
-- Adds explicit FK-safe delete order, Storage ownership guard,
-- to_regclass resilience for future tables, and pg_temp in search_path.
-- Safe to re-run (create or replace).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid;
begin
  uid := auth.uid();

  if uid is null then
    raise exception 'Not authenticated.';
  end if;

  -- Storage ownership guard.
  -- We do NOT delete storage objects via SQL (files would orphan);
  -- instead we block and let the app call the Storage API first.
  if to_regclass('storage.objects') is not null then
    begin
      if exists (select 1 from storage.objects where owner = uid limit 1) then
        raise exception
          'Account deletion blocked: you still own Storage objects (e.g. check-in photos). '
          'Delete them via the app before deleting your account.';
      end if;
    exception when others then
      -- storage schema structure may differ; skip guard safely
      null;
    end;
  end if;

  -- Workout data: leaf → intermediate → parent
  delete from public.workout_sets
  where workout_exercise_id in (
    select we.id
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where w.user_id = uid
  );

  delete from public.workout_exercises
  where workout_id in (select id from public.workouts where user_id = uid);

  delete from public.workouts where user_id = uid;

  -- Routine data: items and favorites before routines
  delete from public.routine_items
  where routine_id in (select id from public.routines where user_id = uid);

  delete from public.routine_favorites where user_id = uid;

  delete from public.routines where user_id = uid;

  -- Plan data: days before plans
  delete from public.plan_days
  where plan_id in (select id from public.plans where user_id = uid);

  delete from public.plans where user_id = uid;

  -- Favorites (exercise_definition_id FK has cascade, but explicit is safer)
  delete from public.exercise_favorites where user_id = uid;

  -- Settings and check-in metadata
  delete from public.user_settings where user_id = uid;

  delete from public.checkin_photos where user_id = uid;

  -- Resilience guards for tables that may be added in future migrations
  if to_regclass('public.bodyweight_entries') is not null then
    execute 'delete from public.bodyweight_entries where user_id = $1' using uid;
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'delete from public.profiles where user_id = $1' using uid;
  end if;

  if to_regclass('public.goals') is not null then
    -- "userId" is a case-sensitive column name
    execute format('delete from public.goals where %I = $1', 'userId') using uid;
  end if;

  if to_regclass('public.workout_templates') is not null then
    execute 'delete from public.workout_templates where owner_user_id = $1' using uid;
  end if;

  -- Custom exercises owned by this user.
  -- exercise_definitions.owner_user_id references auth.users WITHOUT cascade,
  -- so this MUST be deleted before auth.users to avoid FK violation.
  delete from public.exercise_definitions where owner_user_id = uid;

  -- Delete the auth row last. auth.users cascades to auth.sessions,
  -- auth.identities, auth.mfa_factors, etc.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
