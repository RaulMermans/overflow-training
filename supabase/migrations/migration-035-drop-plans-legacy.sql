-- Phase 5: Drop legacy plans/plan_days after stable cutover.
-- PREREQUISITE: ENABLE_ROUTINE_PLAN_SYNC has been false for at least N release cycles.
-- VERIFY: Zero calls to push_plan_atomic, activate_plan before applying.
-- Apply only after a stable window with plan sync disabled.

-- 1) Patch delete_my_account: remove plan_days/plans deletes (to_regclass so safe if tables already gone)
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
  if to_regclass('storage.objects') is not null then
    begin
      if exists (select 1 from storage.objects where owner = uid limit 1) then
        raise exception
          'Account deletion blocked: you still own Storage objects (e.g. check-in photos). '
          'Delete them via the app before deleting your account.';
      end if;
    exception when others then
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

  -- (Plan data: plan_days/plans removed in Phase 5; tables dropped in this migration.)

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
    execute format('delete from public.goals where %I = $1', 'userId') using uid;
  end if;

  if to_regclass('public.workout_templates') is not null then
    execute 'delete from public.workout_templates where owner_user_id = $1' using uid;
  end if;

  -- scheduled_routines (Phase 3): delete if table exists
  if to_regclass('public.scheduled_routines') is not null then
    execute 'delete from public.scheduled_routines where user_id = $1' using uid;
  end if;

  -- Custom exercises owned by this user
  delete from public.exercise_definitions where owner_user_id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- 2) Update rpc_user_last_changed: planning_last_changed no longer uses plans/plan_days
create or replace function public.rpc_user_last_changed()
returns jsonb
language sql
stable
security invoker
as $$
  with u as (select auth.uid() as uid)
  select jsonb_build_object(
    'uid', u.uid,
    'execution_last_changed', greatest(
      coalesce((select max(w.updated_at) from public.workouts w where w.user_id = u.uid), 'epoch'::timestamptz),
      coalesce((
        select max(we.updated_at)
        from public.workout_exercises we
        join public.workouts w on w.id = we.workout_id
        where w.user_id = u.uid
      ), 'epoch'::timestamptz),
      coalesce((
        select max(ws.updated_at)
        from public.workout_sets ws
        join public.workout_exercises we on we.id = ws.workout_exercise_id
        join public.workouts w on w.id = we.workout_id
        where w.user_id = u.uid
      ), 'epoch'::timestamptz)
    ),
    'planning_last_changed', greatest(
      coalesce((select max(r.updated_at) from public.routines r where r.user_id = u.uid), 'epoch'::timestamptz),
      coalesce((
        select max(ri.updated_at)
        from public.routine_items ri
        join public.routines r on r.id = ri.routine_id
        where r.user_id = u.uid
      ), 'epoch'::timestamptz)
    )
  )
  from u;
$$;
grant execute on function public.rpc_user_last_changed() to anon, authenticated;

-- 3) Update rpc_policy_audit: drop plans/plan_days from table list
create or replace function public.rpc_policy_audit()
returns table(tablename text, cmd text, policyname text)
language sql
stable
security invoker
as $$
  select tablename::text, cmd::text, policyname::text
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'workouts','workout_exercises','workout_sets',
      'routines','routine_items','scheduled_routines'
    )
  order by tablename, cmd, policyname;
$$;
grant execute on function public.rpc_policy_audit() to anon, authenticated;

-- 4) Drop plan RPCs
drop function if exists public.push_plan_atomic(jsonb, jsonb);
drop function if exists public.activate_plan(uuid);

-- 5) Drop tables (days before plans due to FK)
drop table if exists public.plan_days;
drop table if exists public.plans;
