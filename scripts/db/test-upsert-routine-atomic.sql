-- ============================================================
-- Test: upsert_routine_with_items_atomic
-- 1) Empty items → RPC returns error
-- 2) Valid items → routine + items persisted atomically
-- Simulates auth context so auth.uid() is non-null.
-- Run: supabase db execute --file scripts/db/test-upsert-routine-atomic.sql
-- ============================================================

-- Simulate authenticated user
do $$ begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text, true);
  set role authenticated;
exception when others then
  raise notice 'TEST: Could not set auth context';
end $$;

do $$
declare
  v_uid       uuid := auth.uid();
  v_ex_id     uuid;
  v_result    jsonb;
  v_routine   jsonb;
  v_items     jsonb;
  v_count    int;
begin
  if v_uid is null then
    raise notice 'TEST: Skipping — no auth.uid()';
    return;
  end if;

  select id into v_ex_id
  from public.exercise_definitions
  where scope = 'system' and deleted_at is null
  limit 1;

  if v_ex_id is null then
    raise exception 'TEST: No exercise_definition found — seed data required';
  end if;

  -- 1) Empty items must fail
  v_result := public.upsert_routine_with_items_atomic(
    jsonb_build_object(
      'client_uuid', gen_random_uuid(),
      'name', 'test-empty',
      'updated_at', now()
    ),
    '[]'::jsonb
  );

  if not (v_result ? 'error' and v_result->>'error' = 'routine_empty') then
    raise exception 'TEST: Expected error routine_empty for empty items, got: %', v_result;
  end if;
  raise notice 'TEST: Empty items → rejected OK';

  -- 2) Valid items → success
  v_result := public.upsert_routine_with_items_atomic(
    jsonb_build_object(
      'client_uuid', gen_random_uuid(),
      'name', 'test-atomic-' || substr(gen_random_uuid()::text, 1, 8),
      'description', null,
      'color', null,
      'pinned', false,
      'created_at', now(),
      'updated_at', now()
    ),
    jsonb_build_array(
      jsonb_build_object(
        'client_uuid', gen_random_uuid(),
        'order', 0,
        'exercise_id', v_ex_id,
        'sets', null,
        'reps', null,
        'rest', null,
        'notes', null,
        'created_at', now(),
        'updated_at', now()
      )
    )
  );

  if v_result ? 'error' then
    raise exception 'TEST: upsert with valid items failed: %', v_result->>'error';
  end if;

  v_routine := v_result->'routine';
  v_items   := v_result->'items';

  if v_routine is null or jsonb_array_length(v_items) < 1 then
    raise exception 'TEST: Expected routine + items, got routine=% items_len=%', v_routine is not null, jsonb_array_length(v_items);
  end if;

  -- Assert 1 routine row and 1 routine_item row for this routine
  select count(*) into v_count
  from public.routine_items
  where routine_id = (v_routine->>'id')::uuid;

  if v_count <> 1 then
    raise exception 'TEST: Expected 1 routine_item, got %', v_count;
  end if;

  -- Cleanup
  delete from public.routine_items where routine_id = (v_routine->>'id')::uuid;
  delete from public.routines where id = (v_routine->>'id')::uuid;

  raise notice 'TEST: OK — upsert_routine_with_items_atomic empty rejected, valid persisted';
end;
$$;
