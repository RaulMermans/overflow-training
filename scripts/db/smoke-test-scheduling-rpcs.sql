-- ============================================================
-- Smoke test: schedule_routine_for_date + start_scheduled_workout
-- Validates:
--   1) no_schedule_for_date error when no schedule exists
--   2) start_scheduled_workout idempotency only for in_progress workouts
--   3) completed workout reset + new workout on next start
--   4) schedule_routine_for_date blocks routine changes when in_progress
--   5) schedule_routine_for_date resets schedule when prior workout completed
-- Simulates auth context so auth.uid() is non-null.
-- Run: supabase db execute --file scripts/db/smoke-test-scheduling-rpcs.sql
-- ============================================================

do $$
declare
  v_uid         uuid;
  v_actor_uid   uuid;
  v_ex_id       uuid;
  v_routine_a   uuid;
  v_routine_b   uuid;
  v_test_date   date := current_date + 31;
  v_result      jsonb;
  v_sched       public.scheduled_routines%rowtype;
  v_workout_1   uuid;
  v_workout_1b  uuid;
  v_workout_2   uuid;
  v_workout_3   uuid;
begin
  select u.id into v_uid
  from auth.users u
  order by u.created_at
  limit 1;

  if v_uid is null then
    raise exception 'SMOKE RPC: auth.users is empty; cannot simulate authenticated context';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_uid::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  v_actor_uid := auth.uid();
  if v_actor_uid is null then
    raise exception 'SMOKE RPC: auth.uid() is null after setting request.jwt.claims';
  end if;

  select id into v_ex_id
  from public.exercise_definitions
  where scope = 'system' and deleted_at is null
  limit 1;

  if v_ex_id is null then
    raise exception 'SMOKE RPC: No exercise_definition found — seed data required';
  end if;

  -- start_scheduled_workout with no schedule
  v_result := public.start_scheduled_workout(v_test_date + 1);
  if not (v_result ? 'error' and v_result->>'error' = 'no_schedule_for_date') then
    raise exception 'SMOKE RPC: expected no_schedule_for_date, got %', v_result;
  end if;

  insert into public.routines (user_id, client_uuid, name, created_at, updated_at)
  values (
    v_actor_uid,
    gen_random_uuid(),
    'smoke-rpc-routine-a-' || substr(gen_random_uuid()::text, 1, 8),
    now(),
    now()
  )
  returning id into v_routine_a;

  insert into public.routine_items (routine_id, client_uuid, "order", exercise_id, created_at, updated_at)
  values (v_routine_a, gen_random_uuid(), 0, v_ex_id, now(), now());

  insert into public.routines (user_id, client_uuid, name, created_at, updated_at)
  values (
    v_actor_uid,
    gen_random_uuid(),
    'smoke-rpc-routine-b-' || substr(gen_random_uuid()::text, 1, 8),
    now(),
    now()
  )
  returning id into v_routine_b;

  insert into public.routine_items (routine_id, client_uuid, "order", exercise_id, created_at, updated_at)
  values (v_routine_b, gen_random_uuid(), 0, v_ex_id, now(), now());

  insert into public.scheduled_routines (user_id, "date", routine_id, status)
  values (v_actor_uid, v_test_date, v_routine_a, 'scheduled')
  on conflict (user_id, "date") do update
    set routine_id = excluded.routine_id,
        workout_id = null,
        status = 'scheduled',
        updated_at = now();

  -- First start: creates workout_1
  v_result := public.start_scheduled_workout(v_test_date);
  if v_result ? 'error' then
    raise exception 'SMOKE RPC: first start failed: %', v_result->>'error';
  end if;
  v_workout_1 := (v_result->'workout'->>'id')::uuid;

  -- Second start while in_progress: idempotent, should return workout_1
  v_result := public.start_scheduled_workout(v_test_date);
  if v_result ? 'error' then
    raise exception 'SMOKE RPC: second start failed: %', v_result->>'error';
  end if;
  v_workout_1b := (v_result->'workout'->>'id')::uuid;
  if v_workout_1b <> v_workout_1 then
    raise exception 'SMOKE RPC: idempotency violated, expected % got %', v_workout_1, v_workout_1b;
  end if;

  -- Complete workout_1, then routine change should reset schedule
  update public.workouts
  set status = 'completed',
      ended_at = coalesce(ended_at, now()),
      updated_at = now()
  where id = v_workout_1
    and user_id = v_actor_uid;

  v_result := public.schedule_routine_for_date(v_test_date, v_routine_b);
  if v_result ? 'error' then
    raise exception 'SMOKE RPC: schedule change after complete failed: %', v_result->>'error';
  end if;
  if not (v_result ? 'ok' and (v_result->>'ok')::boolean) then
    raise exception 'SMOKE RPC: schedule change expected ok=true, got %', v_result;
  end if;

  select * into v_sched
  from public.scheduled_routines
  where user_id = v_actor_uid and "date" = v_test_date;

  if v_sched.routine_id <> v_routine_b then
    raise exception 'SMOKE RPC: schedule routine should be B %, got %', v_routine_b, v_sched.routine_id;
  end if;
  if v_sched.workout_id is not null then
    raise exception 'SMOKE RPC: schedule workout_id should be NULL after completed reset, got %', v_sched.workout_id;
  end if;
  if v_sched.status <> 'scheduled' then
    raise exception 'SMOKE RPC: schedule status should be scheduled after reset, got %', v_sched.status;
  end if;

  -- Start again after reset: creates workout_2
  v_result := public.start_scheduled_workout(v_test_date);
  if v_result ? 'error' then
    raise exception 'SMOKE RPC: third start failed: %', v_result->>'error';
  end if;
  v_workout_2 := (v_result->'workout'->>'id')::uuid;
  if v_workout_2 = v_workout_1 then
    raise exception 'SMOKE RPC: expected new workout after reset, got reused id %', v_workout_2;
  end if;

  -- While workout_2 is in progress, routine change must be blocked
  v_result := public.schedule_routine_for_date(v_test_date, v_routine_a);
  if not (v_result ? 'error' and v_result->>'error' = 'workout_in_progress') then
    raise exception 'SMOKE RPC: expected workout_in_progress, got %', v_result;
  end if;

  select * into v_sched
  from public.scheduled_routines
  where user_id = v_actor_uid and "date" = v_test_date;

  if v_sched.routine_id <> v_routine_b then
    raise exception 'SMOKE RPC: in-progress block should keep routine B %, got %', v_routine_b, v_sched.routine_id;
  end if;
  if v_sched.workout_id <> v_workout_2 then
    raise exception 'SMOKE RPC: in-progress block should keep workout_id %, got %', v_workout_2, v_sched.workout_id;
  end if;

  -- Complete workout_2, then start_scheduled_workout should reset and create workout_3
  update public.workouts
  set status = 'completed',
      ended_at = coalesce(ended_at, now()),
      updated_at = now()
  where id = v_workout_2
    and user_id = v_actor_uid;

  v_result := public.start_scheduled_workout(v_test_date);
  if v_result ? 'error' then
    raise exception 'SMOKE RPC: completed-reset start failed: %', v_result->>'error';
  end if;
  v_workout_3 := (v_result->'workout'->>'id')::uuid;
  if v_workout_3 = v_workout_2 then
    raise exception 'SMOKE RPC: expected a fresh workout after completed reset, got same id %', v_workout_3;
  end if;

  delete from public.workout_sets
  where workout_exercise_id in (
    select id
    from public.workout_exercises
    where workout_id in (v_workout_1, v_workout_2, v_workout_3)
  );
  delete from public.workout_exercises where workout_id in (v_workout_1, v_workout_2, v_workout_3);
  delete from public.workouts where id in (v_workout_1, v_workout_2, v_workout_3) and user_id = v_actor_uid;
  delete from public.scheduled_routines where user_id = v_actor_uid and "date" = v_test_date;
  delete from public.routine_items where routine_id in (v_routine_a, v_routine_b);
  delete from public.routines where id in (v_routine_a, v_routine_b);

  raise notice 'SMOKE RPC: OK — scheduling RPC hardening behavior verified';
end;
$$;
