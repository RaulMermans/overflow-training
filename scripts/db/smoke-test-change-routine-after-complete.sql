-- ============================================================
-- Smoke test: change routine after complete / block when in progress
-- 1) Completed workout → schedule_routine_for_date resets schedule; start creates new workout.
-- 2) In-progress workout → schedule_routine_for_date returns workout_in_progress; schedule unchanged.
-- Simulates auth context so auth.uid() is non-null.
-- Run: supabase db execute --file scripts/db/smoke-test-change-routine-after-complete.sql
-- ============================================================

do $$ begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text, true);
  set role authenticated;
exception when others then
  raise notice 'SMOKE: Could not set auth context';
end $$;

do $$
declare
  v_uid         uuid := auth.uid();
  v_ex_id       uuid;
  v_routine_a   uuid;
  v_routine_b   uuid;
  v_routine_c   uuid;
  v_routine_d   uuid;
  v_result      jsonb;
  v_workout_1   uuid;
  v_workout_2   uuid;
  v_workout_3   uuid;
  v_today       date := current_date;
  v_sched       public.scheduled_routines%rowtype;
begin
  if v_uid is null then
    raise notice 'SMOKE: Skipping — no auth.uid()';
    return;
  end if;

  select id into v_ex_id
  from public.exercise_definitions
  where scope = 'system' and deleted_at is null
  limit 1;

  if v_ex_id is null then
    raise exception 'SMOKE: No exercise_definition found — seed data required';
  end if;

  -- ---------- Scenario A: Completed → change routine → new workout ----------
  insert into public.routines (user_id, client_uuid, name, created_at, updated_at)
  values (v_uid, gen_random_uuid(), 'smoke-routine-a', now(), now())
  returning id into v_routine_a;
  insert into public.routine_items (routine_id, client_uuid, "order", exercise_id, created_at, updated_at)
  values (v_routine_a, gen_random_uuid(), 0, v_ex_id, now(), now());

  insert into public.routines (user_id, client_uuid, name, created_at, updated_at)
  values (v_uid, gen_random_uuid(), 'smoke-routine-b', now(), now())
  returning id into v_routine_b;
  insert into public.routine_items (routine_id, client_uuid, "order", exercise_id, created_at, updated_at)
  values (v_routine_b, gen_random_uuid(), 0, v_ex_id, now(), now());

  insert into public.scheduled_routines (user_id, "date", routine_id, status)
  values (v_uid, v_today, v_routine_a, 'scheduled')
  on conflict (user_id, "date") do update set routine_id = excluded.routine_id, status = 'scheduled';

  v_result := public.start_scheduled_workout(v_today);
  if v_result ? 'error' then
    raise exception 'SMOKE A: start_scheduled_workout failed: %', v_result->>'error';
  end if;
  v_workout_1 := (v_result->'workout'->>'id')::uuid;

  update public.workouts set status = 'completed' where id = v_workout_1 and user_id = v_uid;

  v_result := public.schedule_routine_for_date(v_today, v_routine_b);
  if v_result ? 'error' then
    raise exception 'SMOKE A: schedule_routine_for_date failed: %', v_result->>'error';
  end if;
  if not (v_result ? 'ok' and (v_result->>'ok')::boolean) then
    raise exception 'SMOKE A: expected ok true, got %', v_result;
  end if;

  select * into v_sched from public.scheduled_routines where user_id = v_uid and "date" = v_today;
  if v_sched.workout_id is not null then
    raise exception 'SMOKE A: schedule should have workout_id NULL after change, got %', v_sched.workout_id;
  end if;
  if v_sched.status <> 'scheduled' then
    raise exception 'SMOKE A: schedule status should be scheduled, got %', v_sched.status;
  end if;
  if v_sched.routine_id <> v_routine_b then
    raise exception 'SMOKE A: schedule routine_id should be routine B %, got %', v_routine_b, v_sched.routine_id;
  end if;

  v_result := public.start_scheduled_workout(v_today);
  if v_result ? 'error' then
    raise exception 'SMOKE A: second start_scheduled_workout failed: %', v_result->>'error';
  end if;
  v_workout_2 := (v_result->'workout'->>'id')::uuid;

  if v_workout_2 = v_workout_1 then
    raise exception 'SMOKE A: expected new workout id, got same %', v_workout_1;
  end if;

  -- Cleanup scenario A
  delete from public.workout_sets
  where workout_exercise_id in (select id from public.workout_exercises where workout_id in (v_workout_1, v_workout_2));
  delete from public.workout_exercises where workout_id in (v_workout_1, v_workout_2);
  delete from public.workouts where id in (v_workout_1, v_workout_2) and user_id = v_uid;
  delete from public.scheduled_routines where user_id = v_uid and "date" = v_today;
  delete from public.routine_items where routine_id in (v_routine_a, v_routine_b);
  delete from public.routines where id in (v_routine_a, v_routine_b);

  -- ---------- Scenario B: In-progress → block schedule change ----------
  insert into public.routines (user_id, client_uuid, name, created_at, updated_at)
  values (v_uid, gen_random_uuid(), 'smoke-routine-c', now(), now())
  returning id into v_routine_c;
  insert into public.routine_items (routine_id, client_uuid, "order", exercise_id, created_at, updated_at)
  values (v_routine_c, gen_random_uuid(), 0, v_ex_id, now(), now());

  insert into public.routines (user_id, client_uuid, name, created_at, updated_at)
  values (v_uid, gen_random_uuid(), 'smoke-routine-d', now(), now())
  returning id into v_routine_d;
  insert into public.routine_items (routine_id, client_uuid, "order", exercise_id, created_at, updated_at)
  values (v_routine_d, gen_random_uuid(), 0, v_ex_id, now(), now());

  insert into public.scheduled_routines (user_id, "date", routine_id, status)
  values (v_uid, v_today, v_routine_c, 'scheduled')
  on conflict (user_id, "date") do update set routine_id = excluded.routine_id, status = 'scheduled';

  v_result := public.start_scheduled_workout(v_today);
  if v_result ? 'error' then
    raise exception 'SMOKE B: start_scheduled_workout failed: %', v_result->>'error';
  end if;
  v_workout_3 := (v_result->'workout'->>'id')::uuid;

  v_result := public.schedule_routine_for_date(v_today, v_routine_d);
  if not (v_result ? 'error' and v_result->>'error' = 'workout_in_progress') then
    raise exception 'SMOKE B: expected error workout_in_progress, got %', v_result;
  end if;

  select * into v_sched from public.scheduled_routines where user_id = v_uid and "date" = v_today;
  if v_sched.routine_id <> v_routine_c then
    raise exception 'SMOKE B: schedule routine_id should be unchanged (C), got %', v_sched.routine_id;
  end if;
  if v_sched.workout_id <> v_workout_3 then
    raise exception 'SMOKE B: schedule workout_id should be unchanged %, got %', v_workout_3, v_sched.workout_id;
  end if;

  -- Cleanup scenario B
  delete from public.workout_sets
  where workout_exercise_id in (select id from public.workout_exercises where workout_id = v_workout_3);
  delete from public.workout_exercises where workout_id = v_workout_3;
  delete from public.workouts where id = v_workout_3 and user_id = v_uid;
  delete from public.scheduled_routines where user_id = v_uid and "date" = v_today;
  delete from public.routine_items where routine_id in (v_routine_c, v_routine_d);
  delete from public.routines where id in (v_routine_c, v_routine_d);

  raise notice 'SMOKE: OK — change routine after complete + in-progress block passed';
end;
$$;
