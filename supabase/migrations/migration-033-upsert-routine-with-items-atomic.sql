-- ============================================================
-- Migration 033: Atomic routine + items upsert RPC
-- Rejects empty items; upserts routine by (user_id, client_uuid)
-- and replaces routine_items in one transaction.
-- Phase 2: makes empty remote routines impossible.
-- ============================================================

create or replace function public.upsert_routine_with_items_atomic(
  p_routine jsonb,
  p_items   jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid              uuid := auth.uid();
  v_client_uuid      uuid;
  v_routine_id       uuid;
  v_existing_updated timestamptz;
  v_incoming_updated timestamptz;
  v_item             jsonb;
  v_ex_id            uuid;
  v_idx              int := 0;
  v_routine_row      public.routines%rowtype;
  v_items_agg        jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('error', 'routine_empty');
  end if;

  v_client_uuid := (p_routine->>'client_uuid')::uuid;
  if v_client_uuid is null then
    return jsonb_build_object('error', 'missing_routine_client_uuid');
  end if;

  v_incoming_updated := (p_routine->>'updated_at')::timestamptz;

  -- Optional: skip if remote is newer
  select r.id, r.updated_at
    into v_routine_id, v_existing_updated
    from public.routines r
   where r.user_id = v_uid
     and r.client_uuid = v_client_uuid;

  if found and v_existing_updated is not null and v_incoming_updated is not null
     and v_existing_updated > v_incoming_updated then
    select * into v_routine_row from public.routines r where r.id = v_routine_id;
    select coalesce(jsonb_agg(to_jsonb(ri) order by ri."order"), '[]'::jsonb)
      into v_items_agg
      from public.routine_items ri
     where ri.routine_id = v_routine_id;
    return jsonb_build_object(
      'routine', to_jsonb(v_routine_row),
      'items',   v_items_agg,
      'skipped_by_remote_newer', true
    );
  end if;

  -- Validate each item: exercise_id must exist and scope = 'system'
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_ex_id := (v_item->>'exercise_id')::uuid;
    if v_ex_id is null then
      return jsonb_build_object('error', 'invalid_item_exercise_id');
    end if;
    if not exists (
      select 1 from public.exercise_definitions
       where id = v_ex_id and scope = 'system' and (deleted_at is null)
    ) then
      return jsonb_build_object('error', 'exercise_not_system', 'exercise_id', v_ex_id);
    end if;
  end loop;

  -- Upsert routine
  insert into public.routines (
    id, user_id, client_uuid, name, description, color, pinned, created_at, updated_at
  )
  values (
    coalesce(nullif(p_routine->>'id', '')::uuid, gen_random_uuid()),
    v_uid,
    v_client_uuid,
    nullif(trim(p_routine->>'name'), ''),
    nullif(trim(p_routine->>'description'), ''),
    nullif(trim(p_routine->>'color'), ''),
    coalesce((p_routine->>'pinned')::boolean, false),
    coalesce((p_routine->>'created_at')::timestamptz, now()),
    coalesce((p_routine->>'updated_at')::timestamptz, now())
  )
  on conflict (user_id, client_uuid) do update set
    name        = coalesce(nullif(trim(excluded.name), ''), routines.name),
    description = excluded.description,
    color       = excluded.color,
    pinned      = excluded.pinned,
    updated_at  = excluded.updated_at
  returning * into v_routine_row;

  v_routine_id := v_routine_row.id;

  -- Replace items atomically
  delete from public.routine_items where routine_id = v_routine_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.routine_items (
      routine_id, client_uuid, "order", exercise_id, sets, reps, rest, notes, created_at, updated_at
    )
    values (
      v_routine_id,
      coalesce((v_item->>'client_uuid')::uuid, gen_random_uuid()),
      v_idx,
      (v_item->>'exercise_id')::uuid,
      (v_item->>'sets')::int,
      (v_item->>'reps')::int,
      (v_item->>'rest')::int,
      nullif(trim(v_item->>'notes'), ''),
      coalesce((v_item->>'created_at')::timestamptz, now()),
      coalesce((v_item->>'updated_at')::timestamptz, now())
    );
    v_idx := v_idx + 1;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(ri) order by ri."order"), '[]'::jsonb)
    into v_items_agg
    from public.routine_items ri
   where ri.routine_id = v_routine_id;

  return jsonb_build_object(
    'routine', to_jsonb(v_routine_row),
    'items',   v_items_agg,
    'skipped_by_remote_newer', false
  );
end;
$$;

grant execute on function public.upsert_routine_with_items_atomic(jsonb, jsonb) to authenticated;
grant execute on function public.upsert_routine_with_items_atomic(jsonb, jsonb) to service_role;
