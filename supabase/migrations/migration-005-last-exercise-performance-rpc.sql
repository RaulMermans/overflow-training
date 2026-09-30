-- Migration 005: Add RPC for last exercise performance lookup
-- Safe to run multiple times (CREATE OR REPLACE FUNCTION)
-- Run this in the Supabase Dashboard SQL Editor

create or replace function get_last_exercise_performance(
  target_exercise_definition_id uuid,
  exclude_workout_id uuid default null
)
returns table (
  workout_id uuid,
  performed_at timestamptz,
  set_index integer,
  reps integer,
  weight numeric
)
language sql
stable
as $$
  with latest_workout as (
    select
      w.id,
      coalesce(w.ended_at, w.started_at, w.created_at) as performed_at
    from workouts w
    join workout_exercises we on we.workout_id = w.id
    where w.status = 'completed'
      and w.user_id = auth.uid()
      and we.exercise_definition_id = target_exercise_definition_id
      and (exclude_workout_id is null or w.id <> exclude_workout_id)
    order by w.ended_at desc nulls last, w.created_at desc
    limit 1
  ),
  latest_exercise as (
    select
      we.id as workout_exercise_id,
      lw.id as workout_id,
      lw.performed_at
    from latest_workout lw
    join workout_exercises we on we.workout_id = lw.id
    where we.exercise_definition_id = target_exercise_definition_id
    order by we.order_index asc
    limit 1
  )
  select
    le.workout_id,
    le.performed_at,
    ws.set_index,
    ws.reps,
    ws.weight
  from latest_exercise le
  join workout_sets ws on ws.workout_exercise_id = le.workout_exercise_id
  where ws.is_completed is distinct from false
  order by ws.set_index asc;
$$;
