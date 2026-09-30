-- ============================================================
-- Smoke test: start_workout_from_routine
-- Creates a temporary routine with items, calls the RPC, asserts
-- 1 workout + N workout_exercises. Cleans up after.
-- Simulates auth context so auth.uid() is non-null when run via
-- supabase db execute or SQL editor (no JWT).
-- Requires: at least one exercise_definition (e.g. system seed).
-- ============================================================

-- Simulate authenticated user (Supabase auth.uid() reads from request.jwt.claims)
-- Use a deterministic test UUID; replace with real user UUID if testing with real data
do $$ begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text, true);
  set role authenticated;
exception when others then
  raise notice 'SMOKE: Could not set auth context (Postgres < 14 may use request.jwt.claim.sub)';
end $$;

do $$
declare
  v_uid         uuid := auth.uid();
  v_ex_id       uuid;
  v_routine_id  uuid;
  v_result      jsonb;
  v_workout_id  uuid;
  v_ex_count    int;
  v_we_count    int;
begin
  if v_uid is null then
    raise notice 'SMOKE: Skipping — no auth.uid() (run with authenticated session)';
    return;
  end if;

  -- Need at least one exercise_definition
  select id into v_ex_id
  from public.exercise_definitions
  where scope = 'system' and deleted_at is null
  limit 1;

  if v_ex_id is null then
    raise exception 'SMOKE: No exercise_definition found — seed data required';
  end if;

  -- Create routine
  insert into public.routines (user_id, client_uuid, name, created_at, updated_at)
  values (v_uid, gen_random_uuid(), 'smoke-test-routine-' || substr(gen_random_uuid()::text, 1, 8), now(), now())
  returning id into v_routine_id;

  -- Create one routine_item
  insert into public.routine_items (routine_id, client_uuid, "order", exercise_id, created_at, updated_at)
  values (v_routine_id, gen_random_uuid(), 0, v_ex_id, now(), now());

  -- Call RPC
  select public.start_workout_from_routine(v_routine_id) into v_result;

  -- Assert: no error in result
  if v_result ? 'error' then
    raise exception 'SMOKE: RPC returned error: %', v_result->>'error';
  end if;

  if not (v_result ? 'workout' and v_result ? 'exercises') then
    raise exception 'SMOKE: RPC result missing workout or exercises: %', v_result;
  end if;

  v_workout_id := (v_result->'workout'->>'id')::uuid;
  v_ex_count   := jsonb_array_length(v_result->'exercises');

  if v_ex_count < 1 then
    raise exception 'SMOKE: expected at least 1 exercise, got %', v_ex_count;
  end if;

  -- Assert: exactly 1 workout row
  select count(*) into v_we_count
  from public.workouts
  where id = v_workout_id and user_id = v_uid;

  if v_we_count <> 1 then
    raise exception 'SMOKE: expected 1 workout row, got %', v_we_count;
  end if;

  -- Assert: N workout_exercises for this workout
  select count(*) into v_we_count
  from public.workout_exercises
  where workout_id = v_workout_id;

  if v_we_count <> v_ex_count then
    raise exception 'SMOKE: expected % workout_exercises, got %', v_ex_count, v_we_count;
  end if;

  -- Cleanup (order: sets → exercises → workout, then routine_items → routine)
  delete from public.workout_sets where workout_exercise_id in (select id from public.workout_exercises where workout_id = v_workout_id);
  delete from public.workout_exercises where workout_id = v_workout_id;
  delete from public.workouts where id = v_workout_id;
  delete from public.routine_items where routine_id = v_routine_id;
  delete from public.routines where id = v_routine_id;

  raise notice 'SMOKE: OK — 1 workout + % workout_exercises created and cleaned up', v_ex_count;
end;
$$;
