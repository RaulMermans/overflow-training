-- Migration 007: canonical weight storage, started_at consistency, scalable progress RPCs,
-- and structured workout metadata.
-- Safe to run multiple times.

-- 1) workout_sets canonical weight columns
alter table workout_sets
  add column if not exists weight_kg numeric(12, 6);

alter table workout_sets
  add column if not exists is_weight_canonical boolean;

-- Backfill legacy rows in safe mode: preserve existing display semantics.
update workout_sets
set weight_kg = weight
where weight_kg is null;

update workout_sets
set is_weight_canonical = false
where is_weight_canonical is null;

-- Enforce canonical invariants for future writes.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_weight_kg_nonneg'
      and conrelid = 'workout_sets'::regclass
  ) then
    alter table workout_sets
      add constraint workout_sets_weight_kg_nonneg check (weight_kg >= 0);
  end if;
end $$;

alter table workout_sets
  alter column weight_kg set not null;

alter table workout_sets
  alter column is_weight_canonical set not null;

alter table workout_sets
  alter column is_weight_canonical set default true;


-- 2) workouts structured metadata columns
alter table workouts
  add column if not exists effort_rating integer;

alter table workouts
  add column if not exists session_note text;

-- Backfill missing started_at values from existing timestamps.
update workouts
set started_at = coalesce(started_at, created_at, ended_at, now())
where started_at is null;

-- Backfill structured metadata from legacy notes when possible.
with parsed as (
  select
    w.id,
    case
      when effort_match is null then null
      when effort_denominator = 5 and effort_value between 1 and 5 then effort_value
      when effort_denominator = 10 and effort_value between 1 and 10 then effort_value
      when effort_denominator is null and effort_value between 1 and 10 then effort_value
      else null
    end as parsed_effort_rating,
    nullif(trim(coalesce(note_match[1], '')), '') as parsed_session_note
  from (
    select
      id,
      regexp_match(notes, '(?im)^Effort:\s*([0-9]{1,2})(?:\s*/\s*([0-9]{1,2}))?') as effort_match,
      regexp_match(notes, '(?im)^Note:\s*(.+)$') as note_match
    from workouts
    where notes is not null
      and (effort_rating is null or session_note is null)
  ) w
  cross join lateral (
    select
      case
        when w.effort_match is null then null
        else (w.effort_match[1])::integer
      end as effort_value,
      case
        when w.effort_match is null or w.effort_match[2] is null then null
        else (w.effort_match[2])::integer
      end as effort_denominator
  ) extracted
)
update workouts target
set
  effort_rating = coalesce(target.effort_rating, parsed.parsed_effort_rating),
  session_note = coalesce(target.session_note, parsed.parsed_session_note)
from parsed
where target.id = parsed.id;


do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workouts_effort_rating_range'
      and conrelid = 'workouts'::regclass
  ) then
    alter table workouts
      add constraint workouts_effort_rating_range
      check (effort_rating is null or (effort_rating between 1 and 10));
  end if;
end $$;


-- 3) Progress-oriented index
create index if not exists workouts_completed_user_started_at_idx
  on workouts (user_id, started_at desc)
  where status = 'completed';


-- 4) RPC: last completed performance for one exercise
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


-- 5) RPC: all-time PR by exercise (one row per exercise)
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


-- 6) RPC: most recent N workout occurrences for one exercise
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
$$;
