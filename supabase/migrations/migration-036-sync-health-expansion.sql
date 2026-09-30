-- ============================================================
-- Migration 036: Expand rpc_sync_health() with planning-surface timestamps
-- Phase 6: Add routines_max_updated_at, routine_items_max_updated_at,
-- scheduled_routines_max_updated_at for sync health / cache invalidation.
-- Backward-compatible: new keys only; existing keys unchanged.
-- ============================================================

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
    ),
    'routines_max_updated_at', (
      select max(r.updated_at) from public.routines r where r.user_id = u.uid
    ),
    'routine_items_max_updated_at', (
      select max(ri.updated_at)
      from public.routine_items ri
      join public.routines r on r.id = ri.routine_id
      where r.user_id = u.uid
    ),
    'scheduled_routines_max_updated_at', (
      select max(sr.updated_at) from public.scheduled_routines sr where sr.user_id = u.uid
    )
  )
  from u;
$$;
grant execute on function public.rpc_sync_health() to anon, authenticated;
