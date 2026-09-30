-- ============================================================
-- Migration 037: schedule change in-progress block
-- Blocks schedule_routine_for_date when workout is in progress;
-- allows change after completion with schedule reset.
-- start_scheduled_workout uses workouts.status for idempotency and
-- creates new workout when previous was completed.
-- ============================================================
-- ROLLBACK (if needed): Reapply the function definitions from
-- supabase/migrations/migration-034-scheduled-routines.sql
-- (start_scheduled_workout and schedule_routine_for_date).

-- schedule_routine_for_date: lock row, check workouts.status; block if in_progress, reset if completed
create or replace function public.schedule_routine_for_date(
  p_date date,
  p_routine_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_routine_id uuid;
  v_sched      public.scheduled_routines%rowtype;
  v_wstatus    text;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select id into v_routine_id from public.routines
  where user_id = v_uid and (id = p_routine_id or client_uuid = p_routine_id) limit 1;
  if v_routine_id is null then
    return jsonb_build_object('error', 'routine_not_found');
  end if;

  select * into v_sched
  from public.scheduled_routines
  where user_id = v_uid and "date" = p_date
  for update;

  if v_sched.id is not null then
    if v_sched.workout_id is not null then
      select w.status::text into v_wstatus
      from public.workouts w
      where w.id = v_sched.workout_id and w.user_id = v_uid;
      if v_wstatus = 'in_progress' then
        return jsonb_build_object('error', 'workout_in_progress');
      end if;
      update public.scheduled_routines
      set routine_id = v_routine_id, workout_id = null, status = 'scheduled', updated_at = now()
      where id = v_sched.id;
    else
      update public.scheduled_routines
      set routine_id = v_routine_id, updated_at = now()
      where id = v_sched.id;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  insert into public.scheduled_routines (user_id, "date", routine_id, status)
  values (v_uid, p_date, v_routine_id, 'scheduled')
  on conflict (user_id, "date") do update set
    routine_id = excluded.routine_id,
    workout_id = case
      when (select w.status from public.workouts w where w.id = scheduled_routines.workout_id and w.user_id = auth.uid()) = 'in_progress' then scheduled_routines.workout_id
      else null
    end,
    status = case
      when (select w.status from public.workouts w where w.id = scheduled_routines.workout_id and w.user_id = auth.uid()) = 'in_progress' then scheduled_routines.status
      else 'scheduled'
    end,
    updated_at = now()
  returning * into v_sched;

  if v_sched.workout_id is not null then
    select w.status::text into v_wstatus
    from public.workouts w
    where w.id = v_sched.workout_id and w.user_id = v_uid;
    if v_wstatus = 'in_progress' then
      return jsonb_build_object('error', 'workout_in_progress');
    end if;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.schedule_routine_for_date(date, uuid) to authenticated;
grant execute on function public.schedule_routine_for_date(date, uuid) to service_role;

-- start_scheduled_workout: use workouts.status; idempotent when in_progress, reset and new workout when completed
create or replace function public.start_scheduled_workout(p_date date)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_sched     public.scheduled_routines%rowtype;
  v_wstatus   text;
  v_result    jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_sched
  from public.scheduled_routines
  where user_id = v_uid and "date" = p_date
  for update;

  if v_sched.id is null then
    return jsonb_build_object('error', 'no_schedule_for_date', 'date', p_date);
  end if;

  if v_sched.workout_id is not null then
    select w.status::text into v_wstatus
    from public.workouts w
    where w.id = v_sched.workout_id and w.user_id = v_uid;

    if v_wstatus = 'in_progress' then
      select jsonb_build_object(
        'workout', to_jsonb(w),
        'exercises', coalesce(
          (
            select jsonb_agg(
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
            )
            from public.workout_exercises we
            where we.workout_id = w.id
          ),
          '[]'::jsonb
        )
      )
      into v_result
      from public.workouts w
      where w.id = v_sched.workout_id and w.user_id = v_uid;
      return coalesce(v_result, jsonb_build_object('error', 'workout_not_found'));
    end if;

    update public.scheduled_routines
    set workout_id = null, status = 'scheduled', updated_at = now()
    where id = v_sched.id;
  end if;

  v_result := public.start_workout_from_routine(v_sched.routine_id);
  if v_result ? 'error' then
    return v_result;
  end if;

  update public.scheduled_routines
  set status = 'started', workout_id = (v_result->'workout'->>'id')::uuid, updated_at = now()
  where id = v_sched.id;

  return v_result;
end;
$$;

grant execute on function public.start_scheduled_workout(date) to authenticated;
grant execute on function public.start_scheduled_workout(date) to service_role;
