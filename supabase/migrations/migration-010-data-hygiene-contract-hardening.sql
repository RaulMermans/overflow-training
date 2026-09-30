-- Migration 010: data hygiene and contract hardening.
-- Safe to run multiple times.

create or replace function public.derive_legacy_exercise_type(input_category text)
returns text
language sql
immutable
as $$
  select case coalesce(input_category, 'strength')
    when 'strength' then 'strength'
    when 'warmup' then 'warmup'
    when 'stretch' then 'stretch'
    when 'cardio' then 'cardio'
    when 'mobility' then 'mobility'
    else 'strength'
  end;
$$;

create or replace function public.sync_exercise_type_from_category()
returns trigger
language plpgsql
as $$
begin
  new.exercise_type := public.derive_legacy_exercise_type(new.category);
  return new;
end;
$$;

drop trigger if exists exercise_definitions_sync_exercise_type_trg on public.exercise_definitions;

create trigger exercise_definitions_sync_exercise_type_trg
before insert or update of category
on public.exercise_definitions
for each row
execute function public.sync_exercise_type_from_category();

update public.exercise_definitions
set exercise_type = public.derive_legacy_exercise_type(category)
where exercise_type is distinct from public.derive_legacy_exercise_type(category);

update public.exercise_definitions
set scope = 'user'
where owner_user_id is not null
  and scope is distinct from 'user';

update public.exercise_definitions
set scope = 'system', owner_user_id = null
where owner_user_id is null
  and scope is distinct from 'system';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercise_definitions_scope_owner_consistency_check'
      and conrelid = 'public.exercise_definitions'::regclass
  ) then
    alter table public.exercise_definitions
      add constraint exercise_definitions_scope_owner_consistency_check
      check (
        (scope = 'system' and owner_user_id is null)
        or (scope = 'user' and owner_user_id is not null)
      );
  end if;
end $$;

delete from public.workout_sets
where reps is null
  and duration_seconds is null
  and distance_m is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_metric_presence_check'
      and conrelid = 'public.workout_sets'::regclass
  ) then
    alter table public.workout_sets
      add constraint workout_sets_metric_presence_check
      check (reps is not null or duration_seconds is not null or distance_m is not null);
  end if;
end $$;
