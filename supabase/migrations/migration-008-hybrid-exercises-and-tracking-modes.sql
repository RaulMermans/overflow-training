-- Migration 008: hybrid exercise library + tracking modes.
-- Safe to run multiple times.

create or replace function normalize_name(input text)
returns text
language sql
immutable
returns null on null input
as $$
  select regexp_replace(lower(trim(input)), '\s+', ' ', 'g');
$$;

-- 1) exercise_definitions: hybrid library fields.
alter table exercise_definitions
  add column if not exists scope text not null default 'system';

alter table exercise_definitions
  add column if not exists owner_user_id uuid references auth.users (id);

alter table exercise_definitions
  add column if not exists category text not null default 'strength';

alter table exercise_definitions
  add column if not exists tracking_mode text not null default 'weight_reps';

alter table exercise_definitions
  add column if not exists primary_targets text[] not null default '{}';

alter table exercise_definitions
  add column if not exists secondary_targets text[] not null default '{}';

alter table exercise_definitions
  add column if not exists updated_at timestamptz not null default now();

alter table exercise_definitions
  add column if not exists deleted_at timestamptz;

alter table exercise_definitions
  add column if not exists client_id text;

alter table exercise_definitions
  add column if not exists name_norm text generated always as (normalize_name(name)) stored;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercise_definitions_scope_check'
      and conrelid = 'exercise_definitions'::regclass
  ) then
    alter table exercise_definitions
      add constraint exercise_definitions_scope_check
      check (scope in ('system', 'user'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercise_definitions_category_check'
      and conrelid = 'exercise_definitions'::regclass
  ) then
    alter table exercise_definitions
      add constraint exercise_definitions_category_check
      check (category in ('strength', 'warmup', 'stretch', 'cardio', 'mobility', 'yoga', 'pilates', 'other'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercise_definitions_tracking_mode_check'
      and conrelid = 'exercise_definitions'::regclass
  ) then
    alter table exercise_definitions
      add constraint exercise_definitions_tracking_mode_check
      check (tracking_mode in ('weight_reps', 'reps_only', 'time', 'distance_time'));
  end if;
end $$;

update exercise_definitions
set scope = 'system',
    owner_user_id = null
where owner_user_id is null
  and scope is distinct from 'system';

update exercise_definitions
set category = 'cardio'
where owner_user_id is null
  and category = 'strength'
  and lower(coalesce(muscle_group, '')) = 'cardio';

update exercise_definitions
set category = 'mobility'
where owner_user_id is null
  and category = 'strength'
  and lower(coalesce(muscle_group, '')) = 'mobility';

update exercise_definitions
set tracking_mode = 'weight_reps'
where tracking_mode is null;

create index if not exists exercise_definitions_owner_user_id_idx
  on exercise_definitions (owner_user_id);

create index if not exists exercise_definitions_scope_idx
  on exercise_definitions (scope);

create index if not exists exercise_definitions_category_idx
  on exercise_definitions (category);

create index if not exists exercise_definitions_tracking_mode_idx
  on exercise_definitions (tracking_mode);

create index if not exists exercise_definitions_primary_targets_gin_idx
  on exercise_definitions using gin (primary_targets);

create index if not exists exercise_definitions_secondary_targets_gin_idx
  on exercise_definitions using gin (secondary_targets);

create index if not exists exercise_definitions_name_norm_idx
  on exercise_definitions (name_norm);

-- 2) workout_sets: support duration/time and distance/time logging.
alter table workout_sets
  add column if not exists duration_seconds integer;

alter table workout_sets
  add column if not exists distance_m numeric;

do $$
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'workout_sets'::regclass
      and attname = 'reps'
      and attnum > 0
      and not attisdropped
      and attnotnull
  ) then
    alter table workout_sets
      alter column reps drop not null;
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'workout_sets'::regclass
      and attname = 'weight'
      and attnum > 0
      and not attisdropped
      and attnotnull
  ) then
    alter table workout_sets
      alter column weight drop not null;
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'workout_sets'::regclass
      and attname = 'weight_kg'
      and attnum > 0
      and not attisdropped
      and attnotnull
  ) then
    alter table workout_sets
      alter column weight_kg drop not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_duration_seconds_nonneg'
      and conrelid = 'workout_sets'::regclass
  ) then
    alter table workout_sets
      add constraint workout_sets_duration_seconds_nonneg
      check (duration_seconds is null or duration_seconds >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_distance_m_nonneg'
      and conrelid = 'workout_sets'::regclass
  ) then
    alter table workout_sets
      add constraint workout_sets_distance_m_nonneg
      check (distance_m is null or distance_m >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_metric_presence_check'
      and conrelid = 'workout_sets'::regclass
  ) then
    alter table workout_sets
      add constraint workout_sets_metric_presence_check
      check (
        reps is not null
        or duration_seconds is not null
        or distance_m is not null
      );
  end if;
end $$;

-- 3) exercise_definitions RLS: system read + owner CRUD.
grant select, insert, update, delete on exercise_definitions to authenticated;

alter table exercise_definitions enable row level security;

drop policy if exists "exercise_definitions_select_authenticated" on exercise_definitions;
drop policy if exists "exercise_definitions_insert_own" on exercise_definitions;
drop policy if exists "exercise_definitions_update_own" on exercise_definitions;
drop policy if exists "exercise_definitions_delete_own" on exercise_definitions;

create policy "exercise_definitions_select_authenticated"
on exercise_definitions for select
to authenticated
using (
  scope = 'system'
  or owner_user_id = auth.uid()
);

create policy "exercise_definitions_insert_own"
on exercise_definitions for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and scope = 'user'
);

create policy "exercise_definitions_update_own"
on exercise_definitions for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "exercise_definitions_delete_own"
on exercise_definitions for delete
to authenticated
using (owner_user_id = auth.uid());
