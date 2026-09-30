-- ============================================================
-- Migration 034: scheduled_routines + start_scheduled_workout + schedule_routine_for_date
-- Phase 3: date-specific schedule table and RPCs (parallel to plans/plan_days).
-- ============================================================

-- scheduled_routines: date-specific schedule (parallel to plans/plan_days)
create table if not exists public.scheduled_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  "date" date not null,
  routine_id uuid not null references public.routines (id) on delete restrict,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'started', 'completed', 'skipped')),
  workout_id uuid null references public.workouts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_routines_user_date_unique unique (user_id, "date")
);

create index if not exists scheduled_routines_user_date_idx on public.scheduled_routines (user_id, "date");

alter table public.scheduled_routines enable row level security;

create policy "scheduled_routines_select_own"
  on public.scheduled_routines for select to authenticated
  using (user_id = auth.uid());

create policy "scheduled_routines_insert_own"
  on public.scheduled_routines for insert to authenticated
  with check (user_id = auth.uid());

create policy "scheduled_routines_update_own"
  on public.scheduled_routines for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "scheduled_routines_delete_own"
  on public.scheduled_routines for delete to authenticated
  using (user_id = auth.uid());

drop trigger if exists scheduled_routines_touch_updated_at on public.scheduled_routines;
create trigger scheduled_routines_touch_updated_at
  before update on public.scheduled_routines
  for each row execute function public.touch_updated_at();

-- start_scheduled_workout(p_date): idempotent start for (auth.uid(), p_date)
create or replace function public.start_scheduled_workout(p_date date)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_sched     public.scheduled_routines%rowtype;
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

  if v_sched.status = 'started' and v_sched.workout_id is not null then
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

-- schedule_routine_for_date(p_date, p_routine_id): upsert scheduled_routines row for adoption
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
  v_uid uuid := auth.uid();
  v_routine_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select id into v_routine_id from public.routines
  where user_id = v_uid and (id = p_routine_id or client_uuid = p_routine_id) limit 1;
  if v_routine_id is null then
    return jsonb_build_object('error', 'routine_not_found');
  end if;

  insert into public.scheduled_routines (user_id, "date", routine_id, status)
  values (v_uid, p_date, v_routine_id, 'scheduled')
  on conflict (user_id, "date") do update set
    routine_id = excluded.routine_id,
    status = case
      when scheduled_routines.workout_id is not null then scheduled_routines.status
      else 'scheduled'
    end,
    updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.schedule_routine_for_date(date, uuid) to authenticated;
grant execute on function public.schedule_routine_for_date(date, uuid) to service_role;
