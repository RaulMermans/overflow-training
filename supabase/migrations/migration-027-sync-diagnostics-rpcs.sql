-- Migration 027: Sync diagnostics RPCs (whoami + sync health + last changed + policy audit)
-- Captures manual SQL Editor additions used to debug/verify mobile sync + auth behavior.
-- Safe to re-run: CREATE OR REPLACE FUNCTION; GRANT is additive.

-- 1) Who am I? (diagnose JWT/session context seen by Postgres)
create or replace function public.rpc_whoami()
returns jsonb
language sql
stable
security invoker
as $$
  with u as (select auth.uid() as uid)
  select jsonb_build_object(
    'now', now(),
    'uid', u.uid,
    'role', current_role,
    'jwt_claims', current_setting('request.jwt.claims', true)
  )
  from u;
$$;
grant execute on function public.rpc_whoami() to anon, authenticated;

-- 2) Sync health: max updated_at across execution chain (server-side truth)
create or replace function public.rpc_sync_health()
returns jsonb
language sql
stable
security invoker
as $$
  with u as (select auth.uid() as uid)
  select jsonb_build_object(
    'uid', u.uid,
    'workouts_max_updated_at', (
      select max(w.updated_at) from public.workouts w where w.user_id = u.uid
    ),
    'workout_exercises_max_updated_at', (
      select max(we.updated_at)
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where w.user_id = u.uid
    ),
    'workout_sets_max_updated_at', (
      select max(ws.updated_at)
      from public.workout_sets ws
      join public.workout_exercises we on we.id = ws.workout_exercise_id
      join public.workouts w on w.id = we.workout_id
      where w.user_id = u.uid
    )
  )
  from u;
$$;
grant execute on function public.rpc_sync_health() to anon, authenticated;

-- 3) Last changed: cheap cache invalidation marker for execution + planning surfaces
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
      coalesce((select max(p.updated_at) from public.plans p where p.user_id = u.uid), 'epoch'::timestamptz),
      coalesce((
        select max(pd.updated_at)
        from public.plan_days pd
        join public.plans p on p.id = pd.plan_id
        where p.user_id = u.uid
      ), 'epoch'::timestamptz),
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

-- 4) Policy audit: quickly list RLS policies for critical sync tables (debug-only)
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
      'plans','plan_days','routines','routine_items'
    )
  order by tablename, cmd, policyname;
$$;
grant execute on function public.rpc_policy_audit() to anon, authenticated;
