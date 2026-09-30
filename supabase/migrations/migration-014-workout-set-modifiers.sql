-- Migration 014: structured workout set modifiers (set_type, rir).
-- Safe to run multiple times.

alter table public.workout_sets
  add column if not exists set_type text;

update public.workout_sets
set set_type = 'normal'
where set_type is null;

alter table public.workout_sets
  alter column set_type set default 'normal';

alter table public.workout_sets
  alter column set_type set not null;

alter table public.workout_sets
  add column if not exists rir smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_set_type_check'
      and conrelid = 'public.workout_sets'::regclass
  ) then
    alter table public.workout_sets
      add constraint workout_sets_set_type_check
      check (set_type in ('normal', 'warmup', 'drop', 'failure'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_rir_range_check'
      and conrelid = 'public.workout_sets'::regclass
  ) then
    alter table public.workout_sets
      add constraint workout_sets_rir_range_check
      check (rir is null or (rir between 0 and 10));
  end if;
end $$;
