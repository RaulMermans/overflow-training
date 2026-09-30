-- ============================================================
-- Dev-only sanity checks: fail fast on broken states.
-- Run: supabase db execute --file scripts/db/sanity_checks.sql
--      or: npm run db:sanity-checks
-- Exits with 0 on success; RAISE EXCEPTION (non-zero exit) on violation.
-- Use after supabase link for local/dev/staging.
-- ============================================================

do $$
declare
  v_empty_routines int;
  v_empty_ids text;
  v_dangling_scheduled int;
begin
  -- 1) No routines with 0 items (atomic RPC prevents new ones; this catches legacy drift)
  select count(*), string_agg(r.id::text, ', ')
  into v_empty_routines, v_empty_ids
  from public.routines r
  where not exists (
    select 1 from public.routine_items ri where ri.routine_id = r.id
  );

  if v_empty_routines > 0 then
    raise exception 'SANITY: routines with 0 items (count: %, ids: %)', v_empty_routines, coalesce(v_empty_ids, '');
  end if;

  -- 2) No scheduled_routines referencing missing routine_id (FK prevents; verification only)
  select count(*)
  into v_dangling_scheduled
  from public.scheduled_routines sr
  left join public.routines r on r.id = sr.routine_id
  where r.id is null;

  if v_dangling_scheduled > 0 then
    raise exception 'SANITY: scheduled_routines with missing routine_id (count: %)', v_dangling_scheduled;
  end if;

  raise notice 'SANITY_CHECKS: OK — no empty routines, no dangling scheduled_routines';
end;
$$;
