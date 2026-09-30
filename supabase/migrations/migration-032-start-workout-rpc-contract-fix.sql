-- ============================================================
-- Migration 032: start_workout_from_routine contract fix
-- Removes superset_group_id/superset_order from INSERT and RETURN
-- so the function only uses columns that exist in workout_exercises
-- (robust to environments where migration-015 was not applied).
-- Run scripts/db/contract_audit.sql after applying.
-- ============================================================
-- ROLLBACK (if needed): Reapply contents of
-- supabase/migrations/migration-031-start-workout-rpc-auth-only.sql

create or replace function public.start_workout_from_routine(
  p_routine_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_routine   routines%rowtype;
  v_workout   workouts%rowtype;
  v_item      routine_items%rowtype;
  v_order_idx int := 0;
  v_exercises jsonb;
  v_has_items boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_routine
  from public.routines
  where user_id = v_uid
    and (id = p_routine_id or client_uuid = p_routine_id)
  limit 1;

  if v_routine.id is null then
    return jsonb_build_object('error', 'routine_not_found');
  end if;

  select exists(
    select 1
    from public.routine_items
    where routine_id = v_routine.id
  ) into v_has_items;

  if not v_has_items then
    return jsonb_build_object('error', 'routine_empty');
  end if;

  insert into public.workouts (user_id, client_uuid, started_at, status, created_at, updated_at)
  values (v_uid, gen_random_uuid(), now(), 'in_progress', now(), now())
  returning * into v_workout;

  for v_item in
    select *
    from public.routine_items
    where routine_id = v_routine.id
    order by "order"
  loop
    insert into public.workout_exercises (
      workout_id,
      client_uuid,
      exercise_definition_id,
      order_index,
      notes,
      created_at,
      updated_at
    )
    values (
      v_workout.id,
      gen_random_uuid(),
      v_item.exercise_id,
      v_order_idx,
      v_item.notes,
      now(),
      now()
    );

    v_order_idx := v_order_idx + 1;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', we.id,
        'workout_id', we.workout_id,
        'client_uuid', we.client_uuid,
        'exercise_definition_id', we.exercise_definition_id,
        'order_index', we.order_index,
        'notes', we.notes,
        'created_at', we.created_at,
        'updated_at', we.updated_at
      )
      order by we.order_index
    ),
    '[]'::jsonb
  )
  into v_exercises
  from public.workout_exercises we
  where we.workout_id = v_workout.id;

  return jsonb_build_object(
    'workout', to_jsonb(v_workout),
    'exercises', v_exercises
  );
end;
$$;

revoke all on function public.start_workout_from_routine(uuid) from public;
grant execute on function public.start_workout_from_routine(uuid) to authenticated;
grant execute on function public.start_workout_from_routine(uuid) to service_role;
