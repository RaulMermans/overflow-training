-- Migration 024: Phase 3 integrity hardening
-- 3A) One active plan per user (partial unique index + activate_plan RPC)
-- 3B) Ordering uniqueness (dedupe if needed; indexes already exist)
-- 3C) Weight semantics (weight/weight_kg consistency check)
-- Safe to run multiple times (idempotent).

-- ============================================================
-- PREFLIGHT: Fail early if weight violations exist
-- ============================================================
do $$
declare
  v_count bigint;
  v_sample text;
begin
  select count(*) into v_count
  from public.workout_sets
  where not (
    (weight is null and weight_kg is null)
    or (weight is not null and weight_kg is not null and weight_kg >= 0)
  );

  if v_count > 0 then
    select string_agg(id::text, ', ' order by id) into v_sample
    from (
      select id from public.workout_sets
      where not (
        (weight is null and weight_kg is null)
        or (weight is not null and weight_kg is not null and weight_kg >= 0)
      )
      limit 50
    ) sub;

    raise exception
      'Migration 024 blocked: % workout_sets rows violate weight consistency. '
      'Contract: (weight, weight_kg) must be (null, null) or (non-null, non-null with weight_kg >= 0). '
      'Sample IDs: %. '
      'Fix or delete offending rows before re-running.',
      v_count, coalesce(v_sample, '(none)');
  end if;
end $$;

-- ============================================================
-- 3B: Dedupe workout_exercises order_index (before relying on unique index)
-- ============================================================
with ranked as (
  select
    id,
    workout_id,
    (row_number() over (
      partition by workout_id
      order by order_index asc nulls last, created_at asc nulls last, id asc
    ) - 1)::int as new_order_index
  from public.workout_exercises
)
update public.workout_exercises we
set order_index = ranked.new_order_index
from ranked
where we.id = ranked.id
  and we.order_index is distinct from ranked.new_order_index;

-- ============================================================
-- 3B: Dedupe workout_sets set_index
-- ============================================================
with ranked as (
  select
    id,
    workout_exercise_id,
    (row_number() over (
      partition by workout_exercise_id
      order by set_index asc nulls last, created_at asc nulls last, id asc
    ) - 1)::int as new_set_index
  from public.workout_sets
)
update public.workout_sets ws
set set_index = ranked.new_set_index
from ranked
where ws.id = ranked.id
  and ws.set_index is distinct from ranked.new_set_index;

-- ============================================================
-- 3A: Partial unique index — one active plan per user
-- ============================================================
create unique index if not exists plans_one_active_per_user
  on public.plans (user_id)
  where active = true;

-- ============================================================
-- 3A: Atomic activation RPC
-- ============================================================
create or replace function public.activate_plan(plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan_user uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select p.user_id into v_plan_user
  from public.plans p
  where p.id = plan_id
  for update;

  if v_plan_user is null then
    raise exception 'plan_not_found';
  end if;

  if v_plan_user <> v_user_id then
    raise exception 'forbidden';
  end if;

  update public.plans
  set active = false
  where user_id = v_user_id
    and active = true;

  update public.plans
  set active = true
  where id = plan_id;

  return plan_id;
end;
$$;

grant execute on function public.activate_plan(uuid) to authenticated;

-- ============================================================
-- 3B: Ensure ordering uniqueness (indexes already exist from schema/migrations)
-- workout_exercises_order_unique, workout_sets_set_unique
-- If missing, create them.
-- ============================================================
create unique index if not exists workout_exercises_order_unique
  on public.workout_exercises (workout_id, order_index);

create unique index if not exists workout_sets_set_unique
  on public.workout_sets (workout_exercise_id, set_index);

-- ============================================================
-- 3C: Weight consistency check constraint
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_sets_weight_consistency'
      and conrelid = 'public.workout_sets'::regclass
  ) then
    alter table public.workout_sets
      add constraint workout_sets_weight_consistency
      check (
        (weight is null and weight_kg is null)
        or (weight is not null and weight_kg is not null and weight_kg >= 0)
      );
  end if;
end $$;
