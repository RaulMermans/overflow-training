-- Migration 007: add exercise types and target classification for routine picker filters.
-- Safe to run multiple times.

-- 1) Schema additions
alter table exercise_definitions
  add column if not exists exercise_type text not null default 'strength';

alter table exercise_definitions
  add column if not exists primary_targets text[] not null default '{}';

alter table exercise_definitions
  add column if not exists secondary_targets text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercise_definitions_exercise_type_check'
      and conrelid = 'exercise_definitions'::regclass
  ) then
    alter table exercise_definitions
      add constraint exercise_definitions_exercise_type_check
      check (exercise_type in ('strength', 'warmup', 'stretch', 'cardio', 'mobility'));
  end if;
end $$;

create index if not exists exercise_definitions_primary_targets_gin_idx
  on exercise_definitions using gin (primary_targets);

create index if not exists exercise_definitions_secondary_targets_gin_idx
  on exercise_definitions using gin (secondary_targets);

create index if not exists exercise_definitions_exercise_type_idx
  on exercise_definitions (exercise_type);

-- 2) Baseline targets from macro muscle_group
update exercise_definitions
set primary_targets = case lower(coalesce(muscle_group, ''))
  when 'chest' then array['chest']
  when 'back' then array['back']
  when 'shoulders' then array['shoulders']
  when 'core' then array['core']
  when 'mobility' then array['mobility']
  when 'cardio' then array['cardio']
  when 'legs' then array['quads']
  when 'arms' then array['biceps']
  when 'full_body' then array['core']
  else array['mobility']
end
where coalesce(array_length(primary_targets, 1), 0) = 0;

-- 3) Normalize macro non-strength categories
update exercise_definitions
set exercise_type = 'cardio'
where lower(coalesce(muscle_group, '')) = 'cardio';

update exercise_definitions
set exercise_type = 'mobility'
where lower(coalesce(muscle_group, '')) = 'mobility';

-- 4) Curated slug-based target updates for legs
-- calves
update exercise_definitions
set primary_targets = array['calves']
where lower(coalesce(muscle_group, '')) in ('legs', 'full_body')
  and slug ~* 'calf';

-- hamstrings
update exercise_definitions
set primary_targets = array['hamstrings']
where lower(coalesce(muscle_group, '')) in ('legs', 'full_body')
  and slug ~* '(hamstring|leg-curl)';

-- glutes
update exercise_definitions
set primary_targets = array['glutes']
where lower(coalesce(muscle_group, '')) in ('legs', 'full_body')
  and slug ~* '(glute|hip-thrust|kickback)';

-- quads (except rows already identified as hamstrings/glutes)
update exercise_definitions
set primary_targets = array['quads']
where lower(coalesce(muscle_group, '')) in ('legs', 'full_body')
  and slug ~* '(quad|leg-extension|squat|lunge|leg-press)'
  and not (primary_targets && array['hamstrings', 'glutes']::text[]);

-- 5) Curated slug-based target updates for arms
-- triceps
update exercise_definitions
set primary_targets = array['triceps']
where lower(coalesce(muscle_group, '')) in ('arms', 'full_body')
  and slug ~* '(tricep|pushdown)';

-- biceps (except rows already identified as triceps)
update exercise_definitions
set primary_targets = array['biceps']
where lower(coalesce(muscle_group, '')) in ('arms', 'full_body')
  and slug ~* 'curl'
  and not (primary_targets && array['triceps']::text[]);

-- Safety fallback: ensure every row has at least one primary target
update exercise_definitions
set primary_targets = array['mobility']
where coalesce(array_length(primary_targets, 1), 0) = 0;

-- 6) Starter warmup + stretch library
insert into exercise_definitions (
  name,
  slug,
  aliases,
  muscle_group,
  equipment,
  exercise_type,
  primary_targets,
  secondary_targets
)
values
  ('Dynamic Leg Swings', 'dynamic-leg-swings', array['leg swings', 'dynamic swings'], 'mobility', 'bodyweight', 'warmup', array['quads'], array['hamstrings']),
  ('Arm Circles', 'arm-circles', array['shoulder circles'], 'mobility', 'bodyweight', 'warmup', array['shoulders'], array['mobility']),
  ('Glute Activation Bridge', 'glute-activation-bridge', array['activation bridge', 'glute warmup bridge'], 'mobility', 'bodyweight', 'warmup', array['glutes'], array['mobility']),
  ('Band Pull Apart Warmup', 'band-pull-apart-warmup', array['pull apart warmup'], 'mobility', 'band', 'warmup', array['shoulders'], array['back']),
  ('Cat Cow Warmup', 'cat-cow-warmup', array['cat cow drill'], 'mobility', 'bodyweight', 'warmup', array['mobility'], array['core']),
  ('Jump Rope Warmup', 'jump-rope-warmup', array['rope warmup'], 'cardio', 'bodyweight', 'warmup', array['cardio'], array['calves']),
  ('Hip Openers Dynamic', 'hip-openers-dynamic', array['dynamic hip opener'], 'mobility', 'bodyweight', 'warmup', array['mobility'], array['glutes']),
  ('Shoulder Dislocates', 'shoulder-dislocates', array['band shoulder dislocates'], 'mobility', 'band', 'warmup', array['shoulders'], array['mobility']),
  ('Hamstring Stretch Hold', 'hamstring-stretch-hold', array['seated hamstring stretch'], 'mobility', 'bodyweight', 'stretch', array['hamstrings'], array['mobility']),
  ('Quad Stretch Hold', 'quad-stretch-hold', array['standing quad stretch'], 'mobility', 'bodyweight', 'stretch', array['quads'], array['mobility']),
  ('Calf Wall Stretch', 'calf-wall-stretch', array['wall calf stretch'], 'mobility', 'bodyweight', 'stretch', array['calves'], array['mobility']),
  ('Hip Flexor Stretch', 'hip-flexor-stretch', array['kneeling hip flexor stretch'], 'mobility', 'bodyweight', 'stretch', array['mobility'], array['hamstrings']),
  ('Chest Doorway Stretch', 'chest-doorway-stretch', array['doorway pec stretch'], 'mobility', 'bodyweight', 'stretch', array['chest'], array['shoulders']),
  ('Lat Stretch Reach', 'lat-stretch-reach', array['lat stretch'], 'mobility', 'bodyweight', 'stretch', array['back'], array['mobility']),
  ('Triceps Overhead Stretch', 'triceps-overhead-stretch', array['overhead triceps stretch'], 'mobility', 'bodyweight', 'stretch', array['triceps'], array['mobility']),
  ('Childs Pose Stretch', 'childs-pose-stretch', array['child pose stretch'], 'mobility', 'bodyweight', 'stretch', array['mobility'], array['back'])
on conflict (slug) do update set
  name = excluded.name,
  aliases = (
    select array_agg(distinct merged_alias order by merged_alias)
    from unnest(
      coalesce(exercise_definitions.aliases, '{}'::text[])
      || coalesce(excluded.aliases, '{}'::text[])
    ) as merged_alias
  ),
  muscle_group = coalesce(excluded.muscle_group, exercise_definitions.muscle_group),
  equipment = coalesce(excluded.equipment, exercise_definitions.equipment),
  exercise_type = excluded.exercise_type,
  primary_targets = excluded.primary_targets,
  secondary_targets = excluded.secondary_targets;
