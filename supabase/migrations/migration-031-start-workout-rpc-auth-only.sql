-- ============================================================
-- Migration 031: start_workout_from_routine auth-only contract
-- Simplifies routine start to a single auth-derived user contract.
-- Removes the legacy 2-arg signature.
-- ============================================================

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

  -- Resolve routine by id or client_uuid, ensure ownership.
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

  -- Insert workout.
  insert into public.workouts (user_id, client_uuid, started_at, status, created_at, updated_at)
  values (v_uid, gen_random_uuid(), now(), 'in_progress', now(), now())
  returning * into v_workout;

  -- Insert workout_exercises from routine_items in deterministic order.
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
  from public.workout_exercises we
  where we.workout_id = v_workout.id;

  return jsonb_build_object(
    'workout', to_jsonb(v_workout),
    'exercises', v_exercises
  );
end;
$$;

drop function if exists public.start_workout_from_routine(uuid, uuid);

revoke all on function public.start_workout_from_routine(uuid) from public;
grant execute on function public.start_workout_from_routine(uuid) to authenticated;
grant execute on function public.start_workout_from_routine(uuid) to service_role;
