-- ============================================================
-- Smoke test: scheduled_routines RLS ownership invariant
-- Verifies UPDATE cannot reassign scheduled_routines.user_id.
-- Simulates auth context so auth.uid() is non-null.
-- Run: supabase db execute --file scripts/db/smoke-test-scheduled-routines-rls.sql
-- ============================================================

do $$
declare
  v_uid         uuid;
  v_other_uid   uuid;
  v_actor_uid   uuid;
  v_ex_id       uuid;
  v_routine_id  uuid;
  v_sched_id    uuid;
  v_test_date   date := current_date + 30;
  v_updated     int := 0;
  v_blocked     boolean := false;
begin
  select u.id into v_uid
  from auth.users u
  order by u.created_at
  limit 1;

  select u.id into v_other_uid
  from auth.users u
  where u.id <> v_uid
  order by u.created_at
  limit 1;

  if v_uid is null then
    raise exception 'SMOKE RLS: auth.users is empty; cannot simulate authenticated context';
  end if;

  if v_other_uid is null then
    raise exception 'SMOKE RLS: Need at least two auth.users rows to validate ownership reassignment block';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_uid::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  v_actor_uid := auth.uid();
  if v_actor_uid is null then
    raise exception 'SMOKE RLS: auth.uid() is null after setting request.jwt.claims';
  end if;

  select id into v_ex_id
  from public.exercise_definitions
  where scope = 'system' and deleted_at is null
  limit 1;

  if v_ex_id is null then
    raise exception 'SMOKE RLS: No exercise_definition found — seed data required';
  end if;

  insert into public.routines (user_id, client_uuid, name, created_at, updated_at)
  values (
    v_actor_uid,
    gen_random_uuid(),
    'smoke-rls-routine-' || substr(gen_random_uuid()::text, 1, 8),
    now(),
    now()
  )
  returning id into v_routine_id;

  insert into public.routine_items (routine_id, client_uuid, "order", exercise_id, created_at, updated_at)
  values (v_routine_id, gen_random_uuid(), 0, v_ex_id, now(), now());

  insert into public.scheduled_routines (user_id, "date", routine_id, status)
  values (v_actor_uid, v_test_date, v_routine_id, 'scheduled')
  on conflict (user_id, "date") do update
    set routine_id = excluded.routine_id,
        status = 'scheduled',
        workout_id = null,
        updated_at = now()
  returning id into v_sched_id;

  begin
    update public.scheduled_routines
    set user_id = v_other_uid,
        updated_at = now()
    where id = v_sched_id;

    get diagnostics v_updated = row_count;
  exception
    when others then
      v_blocked := true;
  end;

  if not v_blocked and v_updated <> 0 then
    raise exception 'SMOKE RLS: Ownership reassignment unexpectedly succeeded (% row(s) updated)', v_updated;
  end if;

  if exists (
    select 1
    from public.scheduled_routines
    where id = v_sched_id
      and user_id <> v_actor_uid
  ) then
    raise exception 'SMOKE RLS: scheduled_routines.user_id changed unexpectedly';
  end if;

  delete from public.scheduled_routines where id = v_sched_id;
  delete from public.routine_items where routine_id = v_routine_id;
  delete from public.routines where id = v_routine_id;

  raise notice 'SMOKE RLS: OK — scheduled_routines.user_id ownership is immutable by UPDATE';
end;
$$;
