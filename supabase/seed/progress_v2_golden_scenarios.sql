-- ============================================================
-- Progress v2 — Golden Scenarios Seed
-- ============================================================
--
-- PURPOSE:
--   Deterministic, reproducible dataset for smoke-testing the
--   analytics schema views and RPCs introduced in migration-027.
--
-- USAGE:
--   Run with SERVICE ROLE in the Supabase SQL editor (local dev
--   or a dedicated QA project). Never apply to production.
--
--   supabase db reset && psql "$DB_URL" -f supabase/migrations/*.sql
--   psql "$DB_URL" -f supabase/seed/progress_v2_golden_scenarios.sql
--
-- TIMEZONE NOTE (BLOCKER B1):
--   All views hard-code 'Europe/Madrid' (UTC+1 in winter, UTC+2
--   in summer). Workout timestamps below are at 10:00 UTC which
--   lands at 11:00 Madrid time — safely inside the same calendar
--   day and ISO week regardless of DST during Jan–Feb.
--
-- ANCHOR DATE: 2026-02-15 (Sunday, last day of a 28-day period
--   that starts 2026-01-19). Results below are valid when queried
--   within 28 days of the seed's anchor (before 2026-03-15).
--
-- SCENARIOS:
--   S0  — blank user       — empty-state assertions
--   S1  — sparse (3 wkts)  — below trend threshold
--   S2  — consistent (10)  — trends present, insights fire
--   S3  — focused (8 wkts) — clear e1RM trend on one lift
-- ============================================================

begin;

-- ── 0. Seed exercise definitions ──────────────────────────────────
-- Idempotent via ON CONFLICT (slug). These are scope='system'
-- exercises reserved for QA; prefix 'seed-' avoids collisions.

insert into public.exercise_definitions (
  id, name, slug, scope, category, tracking_mode,
  primary_targets, secondary_targets, muscle_group
) values
  (
    'eed00001-0000-0000-0000-000000000001',
    'Seed Bench Press', 'seed-bench-press', 'system', 'strength', 'weight_reps',
    array['Chest', 'Front Delt'], array['Triceps'], 'Chest'
  ),
  (
    'eed00001-0000-0000-0000-000000000002',
    'Seed Squat', 'seed-squat', 'system', 'strength', 'weight_reps',
    array['Quads', 'Glutes'], array['Hamstrings'], 'Quads'
  ),
  (
    'eed00001-0000-0000-0000-000000000003',
    'Seed Overhead Press', 'seed-overhead-press', 'system', 'strength', 'weight_reps',
    array['Front Delt'], array['Triceps'], 'Shoulders'
  ),
  (
    'eed00001-0000-0000-0000-000000000004',
    'Seed Deadlift', 'seed-deadlift', 'system', 'strength', 'weight_reps',
    array['Hamstrings', 'Glutes'], array['Back'], 'Hamstrings'
  ),
  (
    'eed00001-0000-0000-0000-000000000005',
    'Seed Row', 'seed-row', 'system', 'strength', 'weight_reps',
    array['Back'], array['Biceps'], 'Back'
  )
on conflict (slug) do nothing;

-- ── 1. Seed auth users ─────────────────────────────────────────────
-- INSERT into auth.users requires SERVICE ROLE or superuser.
-- Passwords are irrelevant for analytics testing.

insert into auth.users (
  id, email, encrypted_password,
  aud, role,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    'aa000000-0000-0000-0000-000000000000',
    'seed-s0-blank@test.invalid',
    '$2a$10$zDummyHashNotUsedForLoginSeeds....',
    'authenticated', 'authenticated',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}'
  ),
  (
    'aa000000-0000-0000-0000-000000000001',
    'seed-s1-sparse@test.invalid',
    '$2a$10$zDummyHashNotUsedForLoginSeeds....',
    'authenticated', 'authenticated',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}'
  ),
  (
    'aa000000-0000-0000-0000-000000000002',
    'seed-s2-consistent@test.invalid',
    '$2a$10$zDummyHashNotUsedForLoginSeeds....',
    'authenticated', 'authenticated',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}'
  ),
  (
    'aa000000-0000-0000-0000-000000000003',
    'seed-s3-focused@test.invalid',
    '$2a$10$zDummyHashNotUsedForLoginSeeds....',
    'authenticated', 'authenticated',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}'
  )
on conflict (id) do nothing;

-- ── SCENARIO S1: Sparse (3 workouts, 2 exercises, 3 active weeks) ──

-- Workout S1-W1: 2026-01-19 (Madrid week 2026-01-19)
insert into public.workouts (id, user_id, started_at, ended_at, status)
values ('b1000001-0000-0000-0000-000000000001',
        'aa000000-0000-0000-0000-000000000001',
        '2026-01-19T10:00:00Z', '2026-01-19T11:00:00Z', 'completed')
on conflict (id) do nothing;

-- S1-W1: Bench Press
insert into public.workout_exercises (id, workout_id, exercise_definition_id, order_index)
values ('c1000001-0000-0000-0000-000000000001',
        'b1000001-0000-0000-0000-000000000001',
        'eed00001-0000-0000-0000-000000000001', 0)
on conflict (id) do nothing;

insert into public.workout_sets (id, workout_exercise_id, set_index, reps, weight, weight_kg, is_weight_canonical)
values
  ('d1000001-0000-0000-0000-000000000001', 'c1000001-0000-0000-0000-000000000001', 0, 5, 60, 60, true),
  ('d1000001-0000-0000-0000-000000000002', 'c1000001-0000-0000-0000-000000000001', 1, 5, 65, 65, true),
  ('d1000001-0000-0000-0000-000000000003', 'c1000001-0000-0000-0000-000000000001', 2, 5, 70, 70, true)
on conflict (id) do nothing;

-- S1-W1: Squat
insert into public.workout_exercises (id, workout_id, exercise_definition_id, order_index)
values ('c1000001-0000-0000-0000-000000000002',
        'b1000001-0000-0000-0000-000000000001',
        'eed00001-0000-0000-0000-000000000002', 1)
on conflict (id) do nothing;

insert into public.workout_sets (id, workout_exercise_id, set_index, reps, weight, weight_kg, is_weight_canonical)
values
  ('d1000001-0000-0000-0000-000000000004', 'c1000001-0000-0000-0000-000000000002', 0, 5, 80, 80, true),
  ('d1000001-0000-0000-0000-000000000005', 'c1000001-0000-0000-0000-000000000002', 1, 5, 90, 90, true),
  ('d1000001-0000-0000-0000-000000000006', 'c1000001-0000-0000-0000-000000000002', 2, 5, 100, 100, true)
on conflict (id) do nothing;

-- Workout S1-W2: 2026-02-02 (Madrid week 2026-02-02)
insert into public.workouts (id, user_id, started_at, ended_at, status)
values ('b1000001-0000-0000-0000-000000000002',
        'aa000000-0000-0000-0000-000000000001',
        '2026-02-02T10:00:00Z', '2026-02-02T10:45:00Z', 'completed')
on conflict (id) do nothing;

insert into public.workout_exercises (id, workout_id, exercise_definition_id, order_index)
values ('c1000001-0000-0000-0000-000000000003',
        'b1000001-0000-0000-0000-000000000002',
        'eed00001-0000-0000-0000-000000000001', 0)
on conflict (id) do nothing;

insert into public.workout_sets (id, workout_exercise_id, set_index, reps, weight, weight_kg, is_weight_canonical)
values
  ('d1000001-0000-0000-0000-000000000007', 'c1000001-0000-0000-0000-000000000003', 0, 5, 65, 65, true),
  ('d1000001-0000-0000-0000-000000000008', 'c1000001-0000-0000-0000-000000000003', 1, 5, 70, 70, true),
  ('d1000001-0000-0000-0000-000000000009', 'c1000001-0000-0000-0000-000000000003', 2, 5, 72.5, 72.5, true)
on conflict (id) do nothing;

-- Workout S1-W3: 2026-02-09 (Madrid week 2026-02-09)
insert into public.workouts (id, user_id, started_at, ended_at, status)
values ('b1000001-0000-0000-0000-000000000003',
        'aa000000-0000-0000-0000-000000000001',
        '2026-02-09T10:00:00Z', '2026-02-09T11:00:00Z', 'completed')
on conflict (id) do nothing;

insert into public.workout_exercises (id, workout_id, exercise_definition_id, order_index)
values ('c1000001-0000-0000-0000-000000000004',
        'b1000001-0000-0000-0000-000000000003',
        'eed00001-0000-0000-0000-000000000002', 0)
on conflict (id) do nothing;

insert into public.workout_sets (id, workout_exercise_id, set_index, reps, weight, weight_kg, is_weight_canonical)
values
  ('d1000001-0000-0000-0000-000000000010', 'c1000001-0000-0000-0000-000000000004', 0, 5, 90, 90, true),
  ('d1000001-0000-0000-0000-000000000011', 'c1000001-0000-0000-0000-000000000004', 1, 5, 100, 100, true),
  ('d1000001-0000-0000-0000-000000000012', 'c1000001-0000-0000-0000-000000000004', 2, 5, 102.5, 102.5, true)
on conflict (id) do nothing;

-- ── SCENARIO S2: Consistent (10 workouts across all 4 weeks) ────────

-- Week 2026-01-19: 3 workouts
do $$
declare
  w_ids uuid[] := array[
    'b2000001-0000-0000-0000-000000000001'::uuid,
    'b2000001-0000-0000-0000-000000000002'::uuid,
    'b2000001-0000-0000-0000-000000000003'::uuid
  ];
  w_starts timestamptz[] := array[
    '2026-01-19T08:00:00Z', '2026-01-21T08:00:00Z', '2026-01-23T08:00:00Z'
  ];
  w_ends timestamptz[] := array[
    '2026-01-19T09:00:00Z', '2026-01-21T09:00:00Z', '2026-01-23T09:00:00Z'
  ];
  uid uuid := 'aa000000-0000-0000-0000-000000000002';
  i int;
begin
  for i in 1..3 loop
    insert into public.workouts (id, user_id, started_at, ended_at, status)
    values (w_ids[i], uid, w_starts[i], w_ends[i], 'completed')
    on conflict (id) do nothing;
  end loop;
end $$;

-- Week 2026-01-26: 3 workouts
do $$
declare
  w_ids uuid[] := array[
    'b2000001-0000-0000-0000-000000000004'::uuid,
    'b2000001-0000-0000-0000-000000000005'::uuid,
    'b2000001-0000-0000-0000-000000000006'::uuid
  ];
  w_starts timestamptz[] := array[
    '2026-01-26T08:00:00Z', '2026-01-28T08:00:00Z', '2026-01-30T08:00:00Z'
  ];
  w_ends timestamptz[] := array[
    '2026-01-26T09:00:00Z', '2026-01-28T09:00:00Z', '2026-01-30T09:00:00Z'
  ];
  uid uuid := 'aa000000-0000-0000-0000-000000000002';
  i int;
begin
  for i in 1..3 loop
    insert into public.workouts (id, user_id, started_at, ended_at, status)
    values (w_ids[i], uid, w_starts[i], w_ends[i], 'completed')
    on conflict (id) do nothing;
  end loop;
end $$;

-- Week 2026-02-02: 2 workouts
do $$
declare
  w_ids uuid[] := array[
    'b2000001-0000-0000-0000-000000000007'::uuid,
    'b2000001-0000-0000-0000-000000000008'::uuid
  ];
  w_starts timestamptz[] := array[
    '2026-02-02T08:00:00Z', '2026-02-04T08:00:00Z'
  ];
  w_ends timestamptz[] := array[
    '2026-02-02T09:00:00Z', '2026-02-04T09:00:00Z'
  ];
  uid uuid := 'aa000000-0000-0000-0000-000000000002';
  i int;
begin
  for i in 1..2 loop
    insert into public.workouts (id, user_id, started_at, ended_at, status)
    values (w_ids[i], uid, w_starts[i], w_ends[i], 'completed')
    on conflict (id) do nothing;
  end loop;
end $$;

-- Week 2026-02-09: 2 workouts
do $$
declare
  w_ids uuid[] := array[
    'b2000001-0000-0000-0000-000000000009'::uuid,
    'b2000001-0000-0000-0000-000000000010'::uuid
  ];
  w_starts timestamptz[] := array[
    '2026-02-09T08:00:00Z', '2026-02-11T08:00:00Z'
  ];
  w_ends timestamptz[] := array[
    '2026-02-09T09:00:00Z', '2026-02-11T09:00:00Z'
  ];
  uid uuid := 'aa000000-0000-0000-0000-000000000002';
  i int;
begin
  for i in 1..2 loop
    insert into public.workouts (id, user_id, started_at, ended_at, status)
    values (w_ids[i], uid, w_starts[i], w_ends[i], 'completed')
    on conflict (id) do nothing;
  end loop;
end $$;

-- S2 exercises + sets: each workout = Bench + OHP + Squat (3 sets each)
-- Using a DO block for compact insertion
do $$
declare
  workout_ids uuid[] := array[
    'b2000001-0000-0000-0000-000000000001'::uuid,
    'b2000001-0000-0000-0000-000000000002'::uuid,
    'b2000001-0000-0000-0000-000000000003'::uuid,
    'b2000001-0000-0000-0000-000000000004'::uuid,
    'b2000001-0000-0000-0000-000000000005'::uuid,
    'b2000001-0000-0000-0000-000000000006'::uuid,
    'b2000001-0000-0000-0000-000000000007'::uuid,
    'b2000001-0000-0000-0000-000000000008'::uuid,
    'b2000001-0000-0000-0000-000000000009'::uuid,
    'b2000001-0000-0000-0000-000000000010'::uuid
  ];
  bench_id uuid := 'eed00001-0000-0000-0000-000000000001';
  squat_id uuid := 'eed00001-0000-0000-0000-000000000002';
  ohp_id   uuid := 'eed00001-0000-0000-0000-000000000003';
  wi int;
  we_id uuid;
begin
  for wi in 1..10 loop
    -- Bench
    we_id := gen_random_uuid();
    insert into public.workout_exercises (id, workout_id, exercise_definition_id, order_index)
    values (we_id, workout_ids[wi], bench_id, 0) on conflict do nothing;
    insert into public.workout_sets (workout_exercise_id, set_index, reps, weight, weight_kg, is_weight_canonical)
    values (we_id, 0, 5, 70+wi, 70+wi, true),
           (we_id, 1, 5, 75+wi, 75+wi, true),
           (we_id, 2, 5, 77.5+wi, 77.5+wi, true)
    on conflict do nothing;

    -- Squat
    we_id := gen_random_uuid();
    insert into public.workout_exercises (id, workout_id, exercise_definition_id, order_index)
    values (we_id, workout_ids[wi], squat_id, 1) on conflict do nothing;
    insert into public.workout_sets (workout_exercise_id, set_index, reps, weight, weight_kg, is_weight_canonical)
    values (we_id, 0, 5, 90+wi, 90+wi, true),
           (we_id, 1, 5, 100+wi, 100+wi, true),
           (we_id, 2, 3, 107.5, 107.5, true)
    on conflict do nothing;

    -- OHP
    we_id := gen_random_uuid();
    insert into public.workout_exercises (id, workout_id, exercise_definition_id, order_index)
    values (we_id, workout_ids[wi], ohp_id, 2) on conflict do nothing;
    insert into public.workout_sets (workout_exercise_id, set_index, reps, weight, weight_kg, is_weight_canonical)
    values (we_id, 0, 5, 50, 50, true),
           (we_id, 1, 5, 52.5, 52.5, true),
           (we_id, 2, 5, 55, 55, true)
    on conflict do nothing;
  end loop;
end $$;

-- ── SCENARIO S3: Focused (8 workouts, Bench Press + Deadlift only) ──
-- One workout per week with monotonically increasing weight.

do $$
declare
  bench_id uuid := 'eed00001-0000-0000-0000-000000000001';
  dead_id  uuid := 'eed00001-0000-0000-0000-000000000004';
  uid      uuid := 'aa000000-0000-0000-0000-000000000003';
  -- 8 Mondays spanning ~8 weeks (last 2 months)
  wk_dates timestamptz[] := array[
    '2026-01-05T10:00:00Z', '2026-01-12T10:00:00Z',
    '2026-01-19T10:00:00Z', '2026-01-26T10:00:00Z',
    '2026-02-02T10:00:00Z', '2026-02-09T10:00:00Z',
    '2026-02-16T10:00:00Z', '2026-02-23T10:00:00Z'
  ];
  bench_weights numeric[] := array[80, 82.5, 85, 87.5, 90, 92.5, 95, 97.5];
  dead_weights  numeric[] := array[120, 125, 127.5, 130, 132.5, 135, 140, 142.5];
  wid uuid;
  we_id uuid;
  i int;
begin
  for i in 1..8 loop
    wid := gen_random_uuid();
    insert into public.workouts (id, user_id, started_at, ended_at, status)
    values (wid, uid, wk_dates[i], wk_dates[i] + interval '70 minutes', 'completed')
    on conflict do nothing;

    -- Bench
    we_id := gen_random_uuid();
    insert into public.workout_exercises (id, workout_id, exercise_definition_id, order_index)
    values (we_id, wid, bench_id, 0) on conflict do nothing;
    insert into public.workout_sets (workout_exercise_id, set_index, reps, weight, weight_kg, is_weight_canonical)
    values (we_id, 0, 5, bench_weights[i],         bench_weights[i],         true),
           (we_id, 1, 5, bench_weights[i],         bench_weights[i],         true),
           (we_id, 2, 4, bench_weights[i] + 2.5,   bench_weights[i] + 2.5,   true)
    on conflict do nothing;

    -- Deadlift
    we_id := gen_random_uuid();
    insert into public.workout_exercises (id, workout_id, exercise_definition_id, order_index)
    values (we_id, wid, dead_id, 1) on conflict do nothing;
    insert into public.workout_sets (workout_exercise_id, set_index, reps, weight, weight_kg, is_weight_canonical)
    values (we_id, 0, 5, dead_weights[i],       dead_weights[i],       true),
           (we_id, 1, 4, dead_weights[i] + 5,   dead_weights[i] + 5,   true),
           (we_id, 2, 3, dead_weights[i] + 10,  dead_weights[i] + 10,  true)
    on conflict do nothing;
  end loop;
end $$;

commit;

-- ── Verification ──────────────────────────────────────────────────
-- Quick sanity check: row counts per scenario user
select
  u.email,
  count(distinct w.id) as workout_count
from public.workouts w
join auth.users u on u.id = w.user_id
where w.user_id in (
  'aa000000-0000-0000-0000-000000000000',
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-000000000002',
  'aa000000-0000-0000-0000-000000000003'
)
group by u.email
order by u.email;
-- Expected:
--   seed-s0-blank@test.invalid      | 0
--   seed-s1-sparse@test.invalid     | 3
--   seed-s2-consistent@test.invalid | 10
--   seed-s3-focused@test.invalid    | 8
