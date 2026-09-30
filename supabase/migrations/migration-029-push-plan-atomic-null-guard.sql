-- ============================================================
-- Migration 029: Null guard in push_plan_atomic
-- Adds an explicit check before inserting each plan_day so
-- a null routine_id raises a named exception rather than a
-- raw 23502 not_null_violation from the DB constraint.
-- ============================================================

create or replace function public.push_plan_atomic(
  p_plan jsonb,
  p_days jsonb   -- JSON array of day objects
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id            uuid := auth.uid();
  v_plan_id            uuid;
  v_existing_updated   timestamptz;
  v_incoming_updated   timestamptz;
  v_day                jsonb;
  v_client_uuid        uuid;
  v_idx                int := 0;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  v_client_uuid      := (p_plan->>'client_uuid')::uuid;
  v_incoming_updated := (p_plan->>'updated_at')::timestamptz;

  -- Optimistic skip: if remote copy is newer, do nothing
  select id, updated_at
    into v_plan_id, v_existing_updated
    from public.plans
   where user_id = v_user_id
     and client_uuid = v_client_uuid;

  if found and v_existing_updated > v_incoming_updated then
    return jsonb_build_object(
      'plan_id',                 v_plan_id,
      'skipped_by_remote_newer', true
    );
  end if;

  -- Upsert plan (active = false; activate step comes last)
  insert into public.plans
    (id, user_id, client_uuid, name, schedule_json, active, created_at, updated_at)
  values (
    coalesce((p_plan->>'id')::uuid, gen_random_uuid()),
    v_user_id,
    v_client_uuid,
    p_plan->>'name',
    p_plan->'schedule_json',
    false,
    coalesce((p_plan->>'created_at')::timestamptz, now()),
    coalesce((p_plan->>'updated_at')::timestamptz, now())
  )
  on conflict (user_id, client_uuid) do update
    set name          = excluded.name,
        schedule_json = excluded.schedule_json,
        updated_at    = excluded.updated_at
  returning id into v_plan_id;

  -- Atomically replace all plan_days
  delete from public.plan_days where plan_id = v_plan_id;

  for v_day in select * from jsonb_array_elements(p_days)
  loop
    -- Explicit null guard: surface a named error rather than a raw 23502.
    if v_day->>'routine_id' is null then
      raise exception 'plan_day_routine_id_null'
        using errcode = 'P0001',
              detail  = format('plan_id=%s idx=%s', v_plan_id, v_idx);
    end if;

    insert into public.plan_days
      (id, plan_id, client_uuid, weekday, routine_id, template_json, "order", created_at, updated_at)
    values (
      coalesce((v_day->>'id')::uuid, gen_random_uuid()),
      v_plan_id,
      (v_day->>'client_uuid')::uuid,
      (v_day->>'weekday')::smallint,
      (v_day->>'routine_id')::uuid,
      null,
      v_idx,
      coalesce((v_day->>'created_at')::timestamptz, now()),
      coalesce((v_day->>'updated_at')::timestamptz, now())
    );
    v_idx := v_idx + 1;
  end loop;

  -- Activate: deactivate all others for this user, then activate this one
  update public.plans
     set active = false
   where user_id = v_user_id
     and active  = true;

  update public.plans
     set active = true
   where id = v_plan_id;

  return jsonb_build_object(
    'plan_id',                 v_plan_id,
    'skipped_by_remote_newer', false
  );
end;
$$;

grant execute on function public.push_plan_atomic(jsonb, jsonb) to authenticated;
