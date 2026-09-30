-- ============================================================
-- Migration 030: start_workout_from_routine RPC
-- Atomically creates workout + workout_exercises from a routine.
-- Eliminates FK ordering issues when starting routines.
-- ============================================================

create or replace function public.start_workout_from_routine(
  p_user_id uuid,
  p_routine_id uuid  -- matches routines.id or routines.client_uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_routine    routines%rowtype;
  v_workout    workouts%rowtype;
  v_item       routine_items%rowtype;
  v_order_idx  int := 0;
  v_exercises  jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if p_user_id is distinct from v_uid then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Resolve routine by id or client_uuid, ensure ownership
  select * into v_routine
  from routines
  where user_id = p_user_id
    and (id = p_routine_id or client_uuid = p_routine_id)
  limit 1;

  if v_routine.id is null then
    return jsonb_build_object('error', 'routine_not_found');
  end if;

  -- Insert workout
  insert into workouts (user_id, client_uuid, started_at, status, created_at, updated_at)
  values (p_user_id, gen_random_uuid(), now(), 'in_progress', now(), now())
  returning * into v_workout;

  -- Insert workout_exercises from routine_items (ordered)
  for v_item in
    select *
    from routine_items
    where routine_id = v_routine.id
    order by "order"
  loop
    insert into workout_exercises (
      workout_id,
      client_uuid,
      exercise_definition_id,
      order_index,
      notes,
      superset_group_id,
      superset_order,
      created_at,
      updated_at
    )
    values (
      v_workout.id,
      gen_random_uuid(),
      v_item.exercise_id,
      v_order_idx,
      v_item.notes,
      null,
      null,
      now(),
      now()
    );
    v_order_idx := v_order_idx + 1;
  end loop;

  -- Build exercises result
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', we.id,
        'workout_id', we.workout_id,
        'client_uuid', we.client_uuid,
        'exercise_definition_id', we.exercise_definition_id,
        'order_index', we.order_index,
        'notes', we.notes,
        'superset_group_id', we.superset_group_id,
        'superset_order', we.superset_order,
        'created_at', we.created_at,
        'updated_at', we.updated_at
      )
      order by we.order_index
    ),
    '[]'::jsonb
  )
  into v_exercises
  from workout_exercises we
  where we.workout_id = v_workout.id;

  return jsonb_build_object(
    'workout', to_jsonb(v_workout),
    'exercises', v_exercises
  );
end;
$$;

grant execute on function public.start_workout_from_routine(uuid, uuid) to authenticated;
grant execute on function public.start_workout_from_routine(uuid, uuid) to service_role;
