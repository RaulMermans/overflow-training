-- Migration 013: exercise library v1 reproducibility + conservative cleanup.
-- Safe to run multiple times.

insert into exercise_definitions (
  name,
  slug,
  aliases,
  muscle_group,
  equipment,
  scope,
  owner_user_id,
  category,
  tracking_mode,
  primary_targets,
  secondary_targets
)
values
  -- Warmup
  ('Dynamic Leg Swings', 'dynamic-leg-swings', array['leg swings', 'dynamic swings'], 'mobility', 'bodyweight', 'system', null, 'warmup', 'time', array['quads'], array['hamstrings']),
  ('Arm Circles', 'arm-circles', array['shoulder circles'], 'mobility', 'bodyweight', 'system', null, 'warmup', 'time', array['shoulders'], array['mobility']),
  ('Jump Rope Warmup', 'jump-rope-warmup', array['rope warmup'], 'cardio', 'bodyweight', 'system', null, 'warmup', 'distance_time', array['cardio'], array['calves']),
  ('Cat Cow Warmup', 'cat-cow-warmup', array['cat cow drill'], 'mobility', 'bodyweight', 'system', null, 'warmup', 'time', array['mobility'], array['core']),
  ('Shoulder Dislocates', 'shoulder-dislocates', array['band shoulder dislocates'], 'mobility', 'band', 'system', null, 'warmup', 'time', array['shoulders'], array['mobility']),
  -- Stretch
  ('Hamstring Stretch Hold', 'hamstring-stretch-hold', array['seated hamstring stretch'], 'mobility', 'bodyweight', 'system', null, 'stretch', 'time', array['hamstrings'], array['mobility']),
  ('Quad Stretch Hold', 'quad-stretch-hold', array['standing quad stretch'], 'mobility', 'bodyweight', 'system', null, 'stretch', 'time', array['quads'], array['mobility']),
  ('Calf Wall Stretch', 'calf-wall-stretch', array['wall calf stretch'], 'mobility', 'bodyweight', 'system', null, 'stretch', 'time', array['calves'], array['mobility']),
  ('Hip Flexor Stretch', 'hip-flexor-stretch', array['kneeling hip flexor stretch'], 'mobility', 'bodyweight', 'system', null, 'stretch', 'time', array['mobility'], array['hamstrings']),
  ('Childs Pose Stretch', 'childs-pose-stretch', array['child pose stretch'], 'mobility', 'bodyweight', 'system', null, 'stretch', 'time', array['mobility'], array['back']),
  -- Mobility
  ('Foam Roll', 'foam-roll', array['foam rolling', 'myofascial release'], 'mobility', 'bodyweight', 'system', null, 'mobility', 'time', array['mobility'], array['recovery']),
  ('Thoracic Rotation', 'thoracic-rotation', array['thoracic spine mobility', 't-spine rotation'], 'mobility', 'bodyweight', 'system', null, 'mobility', 'time', array['mobility'], array['back']),
  ('Hip Opener', 'hip-opener', array['hip flexor stretch'], 'mobility', 'bodyweight', 'system', null, 'mobility', 'time', array['mobility'], array['glutes']),
  ('Shoulder Stretch', 'shoulder-stretch', array['shoulder mobility'], 'mobility', 'bodyweight', 'system', null, 'mobility', 'time', array['shoulders'], array['mobility']),
  ('Cat Cow', 'cat-cow', array['cat cow stretch'], 'mobility', 'yoga', 'system', null, 'mobility', 'time', array['mobility'], array['core']),
  -- Cardio
  ('Run Outdoor', 'run-outdoor', array['outdoor run', 'jogging'], 'cardio', 'outdoor', 'system', null, 'cardio', 'distance_time', array['cardio'], array['endurance']),
  ('Treadmill Run', 'treadmill-run', array['treadmill', 'treadmill jog'], 'cardio', 'cardio', 'system', null, 'cardio', 'distance_time', array['cardio'], array['endurance']),
  ('Cycling', 'cycling', array['road cycling', 'bike ride'], 'cardio', 'outdoor', 'system', null, 'cardio', 'distance_time', array['cardio'], array['legs']),
  ('Rowing Machine', 'rowing-machine', array['erg', 'rower'], 'cardio', 'cardio', 'system', null, 'cardio', 'distance_time', array['cardio'], array['back']),
  ('Jump Rope', 'jump-rope', array['skipping', 'skipping rope'], 'cardio', 'bodyweight', 'system', null, 'cardio', 'distance_time', array['cardio'], array['calves'])
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
  scope = 'system',
  owner_user_id = null,
  category = excluded.category,
  tracking_mode = excluded.tracking_mode,
  primary_targets = excluded.primary_targets,
  secondary_targets = excluded.secondary_targets,
  updated_at = now();

-- Conservative cleanup for clearly invalid placeholder-like system entries only.
delete from exercise_definitions
where scope = 'system'
  and owner_user_id is null
  and (
    slug ~ '^(test|sample|todo|tmp|asdf|qwerty)(-|$)'
    or lower(trim(name)) in (
      'test exercise',
      'sample exercise',
      'todo exercise',
      'placeholder exercise'
    )
  );
