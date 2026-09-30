-- Migration 015: workout exercise supersets (strict pairs).
-- Safe to run multiple times.

alter table public.workout_exercises
  add column if not exists superset_group_id uuid;

alter table public.workout_exercises
  add column if not exists superset_order smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_exercises_superset_order_range_check'
      and conrelid = 'public.workout_exercises'::regclass
  ) then
    alter table public.workout_exercises
      add constraint workout_exercises_superset_order_range_check
      check (superset_order is null or superset_order in (1, 2));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_exercises_superset_pair_presence_check'
      and conrelid = 'public.workout_exercises'::regclass
  ) then
    alter table public.workout_exercises
      add constraint workout_exercises_superset_pair_presence_check
      check (
        (superset_group_id is null and superset_order is null)
        or (superset_group_id is not null and superset_order is not null)
      );
  end if;
end $$;

create unique index if not exists workout_exercises_superset_position_unique
  on public.workout_exercises (workout_id, superset_group_id, superset_order)
  where superset_group_id is not null;
