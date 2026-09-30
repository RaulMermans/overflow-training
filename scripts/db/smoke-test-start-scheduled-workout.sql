-- ============================================================
-- Smoke test: start_scheduled_workout
-- Creates routine + items + scheduled_routines row, calls RPC twice,
-- asserts idempotency (same workout_id) and exactly 1 workout row.
-- Simulates auth context so auth.uid() is non-null.
-- Run: supabase db execute --file scripts/db/smoke-test-start-scheduled-workout.sql
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
  v_uid uuid := auth.uid();
  v_ex_id uuid;
  v_routine_id uuid;
  v_result jsonb;
  v_workout_id_1 uuid;
  v_workout_id_2 uuid;
  v_today date := current_date;
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

  insert into public.routines (user_id, client_uuid, name, created_at, updated_at)
  values (v_uid, gen_random_uuid(), 'phase3-smoke-' || substr(gen_random_uuid()::text, 1, 8), now(), now())
  returning id into v_routine_id;

  insert into public.routine_items (routine_id, client_uuid, "order", exercise_id, created_at, updated_at)
  values (v_routine_id, gen_random_uuid(), 0, v_ex_id, now(), now());

  insert into public.scheduled_routines (user_id, "date", routine_id, status)
  values (v_uid, v_today, v_routine_id, 'scheduled')
  on conflict (user_id, "date") do update set routine_id = excluded.routine_id, status = 'scheduled';

  v_result := public.start_scheduled_workout(v_today);
  if v_result ? 'error' then
    raise exception 'SMOKE: First call failed: %', v_result->>'error';
  end if;
  v_workout_id_1 := (v_result->'workout'->>'id')::uuid;

  v_result := public.start_scheduled_workout(v_today);
  if v_result ? 'error' then
    raise exception 'SMOKE: Second call failed: %', v_result->>'error';
  end if;
  v_workout_id_2 := (v_result->'workout'->>'id')::uuid;

  if v_workout_id_1 <> v_workout_id_2 then
    raise exception 'SMOKE: Idempotency violated — got different workout ids % vs %', v_workout_id_1, v_workout_id_2;
  end if;

  if (select count(*) from public.workouts where user_id = v_uid) <> 1 then
    raise exception 'SMOKE: Expected 1 workout, got %', (select count(*) from public.workouts where user_id = v_uid);
  end if;

  -- Cleanup
  delete from public.workout_sets
  where workout_exercise_id in (select id from public.workout_exercises where workout_id = v_workout_id_1);
  delete from public.workout_exercises where workout_id = v_workout_id_1;
  delete from public.workouts where id = v_workout_id_1;
  delete from public.scheduled_routines where user_id = v_uid and "date" = v_today;
  delete from public.routine_items where routine_id = v_routine_id;
  delete from public.routines where id = v_routine_id;

  raise notice 'SMOKE: OK — start_scheduled_workout idempotent, 1 workout created';
end;
$$;
