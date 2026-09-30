-- Extensions
create extension if not exists "pgcrypto";

-- Enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'workout_status') then
    create type workout_status as enum ('in_progress', 'completed');
  end if;
end $$;

create or replace function normalize_name(input text)
returns text
language sql
immutable
returns null on null input
as $$
  select regexp_replace(lower(trim(input)), '\s+', ' ', 'g');
$$;

create or replace function derive_legacy_exercise_type(input_category text)
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

create or replace function sync_exercise_type_from_category()
returns trigger
language plpgsql
as $$
begin
  new.exercise_type := derive_legacy_exercise_type(new.category);
  return new;
end;
$$;

-- Canonical exercise library
create table if not exists exercise_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_norm text generated always as (normalize_name(name)) stored,
  slug text not null,
  aliases text[] not null default '{}',
  muscle_group text null,
  equipment text null,
  scope text not null default 'system'
    check (scope in ('system', 'user')),
  owner_user_id uuid null references auth.users (id),
  category text not null default 'strength'
    check (category in ('strength', 'warmup', 'stretch', 'cardio', 'mobility', 'yoga', 'pilates', 'other')),
  tracking_mode text not null default 'weight_reps'
    check (tracking_mode in ('weight_reps', 'reps_only', 'time', 'distance_time')),
  exercise_type text not null default 'strength'
    check (exercise_type in ('strength', 'warmup', 'stretch', 'cardio', 'mobility')),
  primary_targets text[] not null default '{}',
  secondary_targets text[] not null default '{}',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  client_id text null,
  created_at timestamptz not null default now()
);

create unique index if not exists exercise_definitions_slug_key on exercise_definitions (slug);
drop index if exists exercise_definitions_name_key;
create index if not exists exercise_definitions_name_idx on exercise_definitions (name);
create index if not exists exercise_definitions_aliases_gin_idx on exercise_definitions using gin (aliases);
create index if not exists exercise_definitions_primary_targets_gin_idx on exercise_definitions using gin (primary_targets);
create index if not exists exercise_definitions_secondary_targets_gin_idx on exercise_definitions using gin (secondary_targets);
create index if not exists exercise_definitions_exercise_type_idx on exercise_definitions (exercise_type);
create index if not exists exercise_definitions_owner_user_id_idx on exercise_definitions (owner_user_id);
create index if not exists exercise_definitions_scope_idx on exercise_definitions (scope);
create index if not exists exercise_definitions_category_idx on exercise_definitions (category);
create index if not exists exercise_definitions_tracking_mode_idx on exercise_definitions (tracking_mode);
create index if not exists exercise_definitions_name_norm_idx on exercise_definitions (name_norm);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercise_definitions_scope_owner_consistency_check'
      and conrelid = 'exercise_definitions'::regclass
  ) then
    alter table exercise_definitions
      add constraint exercise_definitions_scope_owner_consistency_check
      check (
        (scope = 'system' and owner_user_id is null)
        or (scope = 'user' and owner_user_id is not null)
      );
  end if;
end $$;

drop trigger if exists exercise_definitions_sync_exercise_type_trg on exercise_definitions;
create trigger exercise_definitions_sync_exercise_type_trg
before insert or update of category
on exercise_definitions
for each row
execute function sync_exercise_type_from_category();

-- Workouts
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_uuid uuid not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  status workout_status not null default 'in_progress',
  notes text null,
  effort_rating integer null,
  session_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workouts_user_id_idx on workouts (user_id);
create unique index if not exists workouts_user_client_uuid_key on workouts (user_id, client_uuid);
create index if not exists workouts_status_idx on workouts (status);
create index if not exists workouts_ended_at_idx on workouts (ended_at);
create index if not exists workouts_completed_user_started_at_idx on workouts (user_id, started_at desc) where status = 'completed';
create index if not exists workouts_user_started_at_desc on workouts (user_id, started_at desc);

-- Workout exercises
create table if not exists workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts (id) on delete cascade,
  client_uuid uuid not null default gen_random_uuid(),
  exercise_definition_id uuid not null references exercise_definitions (id),
  order_index int not null,
  notes text null,
  superset_group_id uuid null,
  superset_order smallint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_exercises_workout_id_idx on workout_exercises (workout_id);
create unique index if not exists workout_exercises_workout_client_uuid_key on workout_exercises (workout_id, client_uuid);
create index if not exists workout_exercises_exercise_definition_id_idx on workout_exercises (exercise_definition_id);
create unique index if not exists workout_exercises_order_unique on workout_exercises (workout_id, order_index);
create unique index if not exists workout_exercises_superset_position_unique
  on workout_exercises (workout_id, superset_group_id, superset_order)
  where superset_group_id is not null;

alter table workout_exercises
  add constraint workout_exercises_order_index_nonneg check (order_index >= 0),
  add constraint workout_exercises_superset_order_range_check check (superset_order is null or superset_order in (1, 2)),
  add constraint workout_exercises_superset_pair_presence_check
    check (
      (superset_group_id is null and superset_order is null)
      or (superset_group_id is not null and superset_order is not null)
    );

-- Workout sets
create table if not exists workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises (id) on delete cascade,
  client_uuid uuid not null default gen_random_uuid(),
  set_index int not null,
  reps int null,
  weight numeric null,
  weight_kg numeric(12, 6) null,
  duration_seconds integer null,
  distance_m numeric null,
  set_type text not null default 'normal',
  rir smallint null,
  is_weight_canonical boolean not null default true,
  is_completed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_sets_workout_exercise_id_idx on workout_sets (workout_exercise_id);
create unique index if not exists workout_sets_exercise_client_uuid_key on workout_sets (workout_exercise_id, client_uuid);
create unique index if not exists workout_sets_set_unique on workout_sets (workout_exercise_id, set_index);

alter table workout_sets
  add constraint workout_sets_set_index_nonneg check (set_index >= 0),
  add constraint workout_sets_reps_positive check (reps > 0),
  add constraint workout_sets_weight_nonneg check (weight >= 0),
  add constraint workout_sets_weight_kg_nonneg check (weight_kg >= 0),
  add constraint workout_sets_duration_seconds_nonneg check (duration_seconds is null or duration_seconds >= 0),
  add constraint workout_sets_distance_m_nonneg check (distance_m is null or distance_m >= 0),
  add constraint workout_sets_set_type_check check (set_type in ('normal', 'warmup', 'drop', 'failure')),
  add constraint workout_sets_rir_range_check check (rir is null or (rir between 0 and 10)),
  add constraint workout_sets_metric_presence_check
    check (reps is not null or duration_seconds is not null or distance_m is not null),
  add constraint workout_sets_weight_consistency
    check (
      (weight is null and weight_kg is null)
      or (weight is not null and weight_kg is not null and weight_kg >= 0)
    );

alter table workouts
  add constraint workouts_effort_rating_range
  check (effort_rating is null or (effort_rating between 1 and 10));

-- Routines
create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_uuid uuid not null default gen_random_uuid(),
  name text not null,
  description text null,
  color text null,
  pinned boolean not null default false,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists routines_user_client_uuid_key on routines (user_id, client_uuid);
create index if not exists routines_user_id_idx on routines (user_id);
create index if not exists routines_updated_at_idx on routines (updated_at desc);
create index if not exists routines_user_updated_at_desc on routines (user_id, updated_at desc);

create table if not exists routine_items (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines (id) on delete cascade,
  client_uuid uuid not null default gen_random_uuid(),
  "order" int not null,
  exercise_id uuid not null references exercise_definitions (id),
  sets int null,
  reps int null,
  rest int null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists routine_items_routine_client_uuid_key on routine_items (routine_id, client_uuid);
create unique index if not exists routine_items_routine_order_key on routine_items (routine_id, "order");
create index if not exists routine_items_routine_id_idx on routine_items (routine_id);
create index if not exists routine_items_updated_at_idx on routine_items (updated_at desc);

alter table routine_items
  add constraint routine_items_order_nonneg check ("order" >= 0),
  add constraint routine_items_sets_positive check (sets is null or sets > 0),
  add constraint routine_items_reps_positive check (reps is null or reps > 0),
  add constraint routine_items_rest_nonneg check (rest is null or rest >= 0);

-- Scheduled routines (date-specific schedule; replaces legacy plans/plan_days)
create table if not exists public.scheduled_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  "date" date not null,
  routine_id uuid not null references public.routines (id) on delete restrict,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'started', 'completed', 'skipped')),
  workout_id uuid null references public.workouts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_routines_user_date_unique unique (user_id, "date")
);

create index if not exists scheduled_routines_user_date_idx on public.scheduled_routines (user_id, "date");

-- User settings
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weekly_workouts_goal smallint not null default 4,
  onboarding_completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_weekly_goal_range
    check (weekly_workouts_goal between 0 and 14)
);

create index if not exists user_settings_updated_at_idx
  on public.user_settings (updated_at desc);

-- Check-in photo metadata
create table if not exists public.checkin_photos (
  checkin_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  taken_at timestamptz not null,
  pose text not null default 'front',
  photo_path text not null,
  width integer null,
  height integer null,
  notes text null,
  weight_kg numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkin_photos_pose_check
    check (pose in ('front', 'side', 'back')),
  constraint checkin_photos_dimensions_check
    check (
      (width is null or width > 0)
      and (height is null or height > 0)
    ),
  constraint checkin_photos_weight_check
    check (weight_kg is null or weight_kg > 0),
  constraint checkin_photos_path_user_prefix_check
    check (split_part(photo_path, '/', 1) = user_id::text)
);

create index if not exists checkin_photos_user_taken_idx
  on public.checkin_photos (user_id, taken_at desc);

-- updated_at auto-touch (sync-surface tables)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new is not distinct from old then
      return new;
    end if;
    if new.updated_at is null or new.updated_at = old.updated_at then
      new.updated_at = now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists routines_touch_updated_at on public.routines;
create trigger routines_touch_updated_at
before update on public.routines
for each row execute function public.touch_updated_at();

drop trigger if exists routine_items_touch_updated_at on public.routine_items;
create trigger routine_items_touch_updated_at
before update on public.routine_items
for each row execute function public.touch_updated_at();

drop trigger if exists scheduled_routines_touch_updated_at on public.scheduled_routines;
create trigger scheduled_routines_touch_updated_at
before update on public.scheduled_routines
for each row execute function public.touch_updated_at();

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
before update on public.user_settings
for each row execute function public.touch_updated_at();

drop trigger if exists checkin_photos_touch_updated_at on public.checkin_photos;
create trigger checkin_photos_touch_updated_at
before update on public.checkin_photos
for each row execute function public.touch_updated_at();

drop trigger if exists exercise_definitions_touch_updated_at on public.exercise_definitions;
create trigger exercise_definitions_touch_updated_at
before update on public.exercise_definitions
for each row execute function public.touch_updated_at();

drop trigger if exists workouts_touch_updated_at on public.workouts;
create trigger workouts_touch_updated_at
before update on public.workouts
for each row execute function public.touch_updated_at();

drop trigger if exists workout_exercises_touch_updated_at on public.workout_exercises;
create trigger workout_exercises_touch_updated_at
before update on public.workout_exercises
for each row execute function public.touch_updated_at();

drop trigger if exists workout_sets_touch_updated_at on public.workout_sets;
create trigger workout_sets_touch_updated_at
before update on public.workout_sets
for each row execute function public.touch_updated_at();

-- Seed: minimal canonical exercises
insert into exercise_definitions (name, slug, aliases, muscle_group, equipment)
values
  ('Bench Press', 'bench-press', array['benchpress'], 'chest', 'barbell'),
  ('Incline Bench Press', 'incline-bench-press', array['incline benchpress'], 'chest', 'barbell'),
  ('Squat', 'squat', array['back squat'], 'legs', 'barbell'),
  ('Deadlift', 'deadlift', array['conventional deadlift'], 'back', 'barbell'),
  ('Overhead Press', 'overhead-press', array['ohp','shoulder press'], 'shoulders', 'barbell'),
  ('Lat Pulldown', 'lat-pulldown', array['lat pull-down'], 'back', 'machine'),
  ('Dumbbell Row', 'dumbbell-row', array['db row'], 'back', 'dumbbell'),
  ('Dumbbell Bench Press', 'dumbbell-bench-press', array['db bench'], 'chest', 'dumbbell'),
  ('Bicep Curl', 'bicep-curl', array['curl'], 'arms', 'dumbbell'),
  ('Tricep Pushdown', 'tricep-pushdown', array['cable pushdown'], 'arms', 'cable')
on conflict (slug) do nothing;

-- RPC: fetch last completed performance for one exercise definition with sets
create or replace function get_last_exercise_performance(
  target_exercise_definition_id uuid,
  exclude_workout_id uuid default null
)
returns table (
  workout_id uuid,
  performed_at timestamptz,
  set_index integer,
  reps integer,
  weight numeric,
  weight_kg numeric,
  is_weight_canonical boolean
)
language sql
stable
as $$
  with latest_workout as (
    select
      w.id,
      coalesce(w.started_at, w.ended_at, w.created_at) as performed_at
    from workouts w
    join workout_exercises we on we.workout_id = w.id
    where w.status = 'completed'
      and w.user_id = auth.uid()
      and we.exercise_definition_id = target_exercise_definition_id
      and (exclude_workout_id is null or w.id <> exclude_workout_id)
    order by w.started_at desc nulls last, w.ended_at desc nulls last, w.created_at desc
    limit 1
  ),
  latest_exercise as (
    select
      we.id as workout_exercise_id,
      lw.id as workout_id,
      lw.performed_at
    from latest_workout lw
    join workout_exercises we on we.workout_id = lw.id
    where we.exercise_definition_id = target_exercise_definition_id
    order by we.order_index asc
    limit 1
  )
  select
    le.workout_id,
    le.performed_at,
    ws.set_index,
    ws.reps,
    ws.weight,
    ws.weight_kg,
    ws.is_weight_canonical
  from latest_exercise le
  join workout_sets ws on ws.workout_exercise_id = le.workout_exercise_id
  where ws.is_completed is distinct from false
  order by ws.set_index asc;
$$;

-- RPC: all-time best set per exercise
create or replace function get_progress_exercise_prs()
returns table (
  exercise_definition_id uuid,
  exercise_name text,
  workout_id uuid,
  performed_at timestamptz,
  reps integer,
  weight numeric,
  weight_kg numeric,
  is_weight_canonical boolean,
  e1rm_kg numeric
)
language sql
stable
as $$
  with ranked as (
    select
      we.exercise_definition_id,
      ed.name as exercise_name,
      w.id as workout_id,
      coalesce(w.started_at, w.ended_at, w.created_at) as performed_at,
      ws.reps,
      ws.weight,
      ws.weight_kg,
      ws.is_weight_canonical,
      (coalesce(ws.weight_kg, ws.weight) * (1 + (ws.reps::numeric / 30))) as e1rm_kg,
      row_number() over (
        partition by we.exercise_definition_id
        order by
          (coalesce(ws.weight_kg, ws.weight) * (1 + (ws.reps::numeric / 30))) desc,
          coalesce(w.started_at, w.ended_at, w.created_at) desc,
          ws.weight desc,
          ws.reps desc,
          w.id desc
      ) as rn
    from workouts w
    join workout_exercises we on we.workout_id = w.id
    join workout_sets ws on ws.workout_exercise_id = we.id
    join exercise_definitions ed on ed.id = we.exercise_definition_id
    where w.user_id = auth.uid()
      and w.status = 'completed'
      and ws.is_completed is distinct from false
      and ws.reps > 0
      and coalesce(ws.weight_kg, ws.weight) > 0
  )
  select
    exercise_definition_id,
    exercise_name,
    workout_id,
    performed_at,
    reps,
    weight,
    weight_kg,
    is_weight_canonical,
    e1rm_kg
  from ranked
  where rn = 1
  order by e1rm_kg desc, exercise_name asc;
$$;

-- RPC: most recent workout occurrences (best set per workout) for one exercise
create or replace function get_progress_exercise_recent_occurrences(
  target_exercise_definition_id uuid,
  occurrence_limit integer default 8
)
returns table (
  exercise_definition_id uuid,
  exercise_name text,
  workout_id uuid,
  performed_at timestamptz,
  reps integer,
  weight numeric,
  weight_kg numeric,
  is_weight_canonical boolean,
  e1rm_kg numeric
)
language sql
stable
as $$
  with per_workout_ranked as (
    select
      we.exercise_definition_id,
      ed.name as exercise_name,
      w.id as workout_id,
      coalesce(w.started_at, w.ended_at, w.created_at) as performed_at,
      ws.reps,
      ws.weight,
      ws.weight_kg,
      ws.is_weight_canonical,
      (coalesce(ws.weight_kg, ws.weight) * (1 + (ws.reps::numeric / 30))) as e1rm_kg,
      row_number() over (
        partition by w.id
        order by
          (coalesce(ws.weight_kg, ws.weight) * (1 + (ws.reps::numeric / 30))) desc,
          ws.weight desc,
          ws.reps desc,
          ws.set_index desc,
          ws.id desc
      ) as rn
    from workouts w
    join workout_exercises we on we.workout_id = w.id
    join workout_sets ws on ws.workout_exercise_id = we.id
    join exercise_definitions ed on ed.id = we.exercise_definition_id
    where w.user_id = auth.uid()
      and w.status = 'completed'
      and we.exercise_definition_id = target_exercise_definition_id
      and ws.is_completed is distinct from false
      and ws.reps > 0
      and coalesce(ws.weight_kg, ws.weight) > 0
  )
  select
    exercise_definition_id,
    exercise_name,
    workout_id,
    performed_at,
    reps,
    weight,
    weight_kg,
    is_weight_canonical,
    e1rm_kg
  from per_workout_ranked
  where rn = 1
  order by performed_at desc
  limit greatest(coalesce(occurrence_limit, 8), 1);

-- Favorites

create table if not exists public.exercise_favorites (
  user_id               uuid        not null references auth.users (id) on delete cascade,
  exercise_definition_id uuid        not null references public.exercise_definitions (id) on delete cascade,
  created_at            timestamptz not null default now(),
  constraint exercise_favorites_pk primary key (user_id, exercise_definition_id)
);

create index if not exists exercise_favorites_user_id_idx
  on public.exercise_favorites (user_id);

alter table public.exercise_favorites enable row level security;

create policy "exercise_favorites_select"
  on public.exercise_favorites
  for select
  using (user_id = auth.uid());

create policy "exercise_favorites_insert"
  on public.exercise_favorites
  for insert
  with check (user_id = auth.uid());

create policy "exercise_favorites_delete"
  on public.exercise_favorites
  for delete
  using (user_id = auth.uid());

create table if not exists public.routine_favorites (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  routine_id uuid        not null references public.routines (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint routine_favorites_pk primary key (user_id, routine_id)
);

create index if not exists routine_favorites_user_id_idx
  on public.routine_favorites (user_id);

alter table public.routine_favorites enable row level security;

create policy "routine_favorites_select"
  on public.routine_favorites
  for select
  using (user_id = auth.uid());

create policy "routine_favorites_insert"
  on public.routine_favorites
  for insert
  with check (user_id = auth.uid());

create policy "routine_favorites_delete"
  on public.routine_favorites
  for delete
  using (user_id = auth.uid());
$$;

-- RPC: full account deletion (auth user + owned app data)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid;
begin
  uid := auth.uid();

  if uid is null then
    raise exception 'Not authenticated.';
  end if;

  -- Storage ownership guard.
  if to_regclass('storage.objects') is not null then
    begin
      if exists (select 1 from storage.objects where owner = uid limit 1) then
        raise exception
          'Account deletion blocked: you still own Storage objects (e.g. check-in photos). '
          'Delete them via the app before deleting your account.';
      end if;
    exception when others then
      null;
    end;
  end if;

  -- Workout data: leaf → intermediate → parent
  delete from public.workout_sets
  where workout_exercise_id in (
    select we.id
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where w.user_id = uid
  );

  delete from public.workout_exercises
  where workout_id in (select id from public.workouts where user_id = uid);

  delete from public.workouts where user_id = uid;

  -- Routine data: items and favorites before routines
  delete from public.routine_items
  where routine_id in (select id from public.routines where user_id = uid);

  delete from public.routine_favorites where user_id = uid;

  delete from public.routines where user_id = uid;

  -- Favorites (exercise_definition_id FK has cascade, but explicit is safer)
  delete from public.exercise_favorites where user_id = uid;

  -- Settings and check-in metadata
  delete from public.user_settings where user_id = uid;

  delete from public.checkin_photos where user_id = uid;

  -- Resilience guards for tables that may be added in future migrations
  if to_regclass('public.bodyweight_entries') is not null then
    execute 'delete from public.bodyweight_entries where user_id = $1' using uid;
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'delete from public.profiles where user_id = $1' using uid;
  end if;

  if to_regclass('public.goals') is not null then
    execute format('delete from public.goals where %I = $1', 'userId') using uid;
  end if;

  if to_regclass('public.workout_templates') is not null then
    execute 'delete from public.workout_templates where owner_user_id = $1' using uid;
  end if;

  -- scheduled_routines (Phase 3)
  if to_regclass('public.scheduled_routines') is not null then
    execute 'delete from public.scheduled_routines where user_id = $1' using uid;
  end if;

  -- Custom exercises owned by this user
  delete from public.exercise_definitions where owner_user_id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- RPC: atomically start workout from a routine (auth-derived user)
create or replace function public.start_workout_from_routine(
  p_routine_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_routine   routines%rowtype;
  v_workout   workouts%rowtype;
  v_item      routine_items%rowtype;
  v_order_idx int := 0;
  v_exercises jsonb;
  v_has_items boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_routine
  from public.routines
  where user_id = v_uid
    and (id = p_routine_id or client_uuid = p_routine_id)
  limit 1;

  if v_routine.id is null then
    return jsonb_build_object('error', 'routine_not_found');
  end if;

  select exists(
    select 1
    from public.routine_items
    where routine_id = v_routine.id
  ) into v_has_items;

  if not v_has_items then
    return jsonb_build_object('error', 'routine_empty');
  end if;

  insert into public.workouts (user_id, client_uuid, started_at, status, created_at, updated_at)
  values (v_uid, gen_random_uuid(), now(), 'in_progress', now(), now())
  returning * into v_workout;

  for v_item in
    select *
    from public.routine_items
    where routine_id = v_routine.id
    order by "order"
  loop
    insert into public.workout_exercises (
      workout_id,
      client_uuid,
      exercise_definition_id,
      order_index,
      notes,
      created_at,
      updated_at
    )
    values (
      v_workout.id,
      gen_random_uuid(),
      v_item.exercise_id,
      v_order_idx,
      v_item.notes,
      now(),
      now()
    );

    v_order_idx := v_order_idx + 1;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', we.id,
        'workout_id', we.workout_id,
        'client_uuid', we.client_uuid,
        'exercise_definition_id', we.exercise_definition_id,
        'order_index', we.order_index,
        'notes', we.notes,
        'created_at', we.created_at,
        'updated_at', we.updated_at
      )
      order by we.order_index
    ),
    '[]'::jsonb
  )
  into v_exercises
  from public.workout_exercises we
  where we.workout_id = v_workout.id;

  return jsonb_build_object(
    'workout', to_jsonb(v_workout),
    'exercises', v_exercises
  );
end;
$$;

revoke all on function public.start_workout_from_routine(uuid) from public;
grant execute on function public.start_workout_from_routine(uuid) to authenticated;
grant execute on function public.start_workout_from_routine(uuid) to service_role;

-- ── google_calendar_connections ──────────────────────────────────────────────
-- Per-user Google Calendar connection config. OAuth tokens live in SecureStore.

create table public.google_calendar_connections (
  id                       uuid        primary key default uuid_generate_v4(),
  user_id                  uuid        not null references auth.users(id) on delete cascade,
  selected_calendar_id     text        not null default 'primary',
  selected_calendar_summary text,
  sync_enabled             boolean     not null default false,
  status                   text        not null default 'disconnected',
  connected_at             timestamptz,
  updated_at               timestamptz not null default now(),
  last_error               text,
  constraint google_calendar_connections_user_id_key unique (user_id)
);

-- ── scheduled_workout_calendar_links ─────────────────────────────────────────
-- Maps each scheduled_routine to its Google Calendar event for update/delete.

create table public.scheduled_workout_calendar_links (
  id                    uuid        primary key default uuid_generate_v4(),
  user_id               uuid        not null references auth.users(id) on delete cascade,
  scheduled_routine_id  uuid        not null references public.scheduled_routines(id) on delete cascade,
  external_calendar_id  text        not null,
  external_event_id     text        not null,
  sync_status           text        not null default 'pending',
  last_synced_at        timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint scheduled_workout_calendar_links_unique unique (user_id, scheduled_routine_id)
);
