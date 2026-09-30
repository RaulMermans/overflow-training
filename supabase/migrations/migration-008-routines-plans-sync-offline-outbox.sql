-- Migration 008: routines/plans cloud sync foundation + idempotent client UUIDs.
-- Safe to run multiple times.

-- 1) Add idempotent client UUIDs to workout entities.
alter table workouts
  add column if not exists client_uuid uuid;

update workouts
set client_uuid = id
where client_uuid is null;

alter table workouts
  alter column client_uuid set not null;
alter table workouts
  alter column client_uuid set default gen_random_uuid();

create unique index if not exists workouts_user_client_uuid_key
  on workouts (user_id, client_uuid);

alter table workout_exercises
  add column if not exists client_uuid uuid;

update workout_exercises
set client_uuid = id
where client_uuid is null;

alter table workout_exercises
  alter column client_uuid set not null;
alter table workout_exercises
  alter column client_uuid set default gen_random_uuid();

create unique index if not exists workout_exercises_workout_client_uuid_key
  on workout_exercises (workout_id, client_uuid);

alter table workout_sets
  add column if not exists client_uuid uuid;

update workout_sets
set client_uuid = id
where client_uuid is null;

alter table workout_sets
  alter column client_uuid set not null;
alter table workout_sets
  alter column client_uuid set default gen_random_uuid();

create unique index if not exists workout_sets_exercise_client_uuid_key
  on workout_sets (workout_exercise_id, client_uuid);

-- 2) Routines and routine items.
create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_uuid uuid not null default gen_random_uuid(),
  name text not null,
  description text null,
  color text null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists routines_user_client_uuid_key
  on routines (user_id, client_uuid);
create index if not exists routines_user_id_idx on routines (user_id);
create index if not exists routines_updated_at_idx on routines (updated_at desc);

create table if not exists routine_items (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines (id) on delete cascade,
  client_uuid uuid not null default gen_random_uuid(),
  "order" integer not null,
  exercise_id uuid not null references exercise_definitions (id),
  sets integer null,
  reps integer null,
  rest integer null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_items_order_nonneg check ("order" >= 0),
  constraint routine_items_sets_positive check (sets is null or sets > 0),
  constraint routine_items_reps_positive check (reps is null or reps > 0),
  constraint routine_items_rest_nonneg check (rest is null or rest >= 0)
);

create unique index if not exists routine_items_routine_client_uuid_key
  on routine_items (routine_id, client_uuid);
create unique index if not exists routine_items_routine_order_key
  on routine_items (routine_id, "order");
create index if not exists routine_items_routine_id_idx on routine_items (routine_id);
create index if not exists routine_items_updated_at_idx on routine_items (updated_at desc);

-- 3) Plans and plan days.
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_uuid uuid not null default gen_random_uuid(),
  name text not null,
  schedule_json jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists plans_user_client_uuid_key
  on plans (user_id, client_uuid);
create index if not exists plans_user_id_idx on plans (user_id);
create index if not exists plans_updated_at_idx on plans (updated_at desc);
create index if not exists plans_user_active_idx on plans (user_id, active);

create table if not exists plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans (id) on delete cascade,
  client_uuid uuid not null default gen_random_uuid(),
  weekday smallint not null,
  routine_id uuid null references routines (id) on delete set null,
  template_json jsonb not null default '{}'::jsonb,
  "order" integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_days_weekday_range check (weekday between 0 and 6),
  constraint plan_days_order_nonneg check ("order" >= 0)
);

create unique index if not exists plan_days_plan_client_uuid_key
  on plan_days (plan_id, client_uuid);
create unique index if not exists plan_days_plan_weekday_order_key
  on plan_days (plan_id, weekday, "order");
create index if not exists plan_days_plan_id_idx on plan_days (plan_id);
create index if not exists plan_days_updated_at_idx on plan_days (updated_at desc);

-- 4) RLS for new sync tables.
alter table routines enable row level security;
alter table routine_items enable row level security;
alter table plans enable row level security;
alter table plan_days enable row level security;

drop policy if exists "routines_select_own" on routines;
create policy "routines_select_own"
on routines for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "routines_insert_own" on routines;
create policy "routines_insert_own"
on routines for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "routines_update_own" on routines;
create policy "routines_update_own"
on routines for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "routines_delete_own" on routines;
create policy "routines_delete_own"
on routines for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "routine_items_select_own" on routine_items;
create policy "routine_items_select_own"
on routine_items for select
to authenticated
using (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "routine_items_insert_own" on routine_items;
create policy "routine_items_insert_own"
on routine_items for insert
to authenticated
with check (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "routine_items_update_own" on routine_items;
create policy "routine_items_update_own"
on routine_items for update
to authenticated
using (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "routine_items_delete_own" on routine_items;
create policy "routine_items_delete_own"
on routine_items for delete
to authenticated
using (
  exists (
    select 1
    from routines r
    where r.id = routine_items.routine_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "plans_select_own" on plans;
create policy "plans_select_own"
on plans for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "plans_insert_own" on plans;
create policy "plans_insert_own"
on plans for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "plans_update_own" on plans;
create policy "plans_update_own"
on plans for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "plans_delete_own" on plans;
create policy "plans_delete_own"
on plans for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "plan_days_select_own" on plan_days;
create policy "plan_days_select_own"
on plan_days for select
to authenticated
using (
  exists (
    select 1
    from plans p
    where p.id = plan_days.plan_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "plan_days_insert_own" on plan_days;
create policy "plan_days_insert_own"
on plan_days for insert
to authenticated
with check (
  exists (
    select 1
    from plans p
    where p.id = plan_days.plan_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "plan_days_update_own" on plan_days;
create policy "plan_days_update_own"
on plan_days for update
to authenticated
using (
  exists (
    select 1
    from plans p
    where p.id = plan_days.plan_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from plans p
    where p.id = plan_days.plan_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "plan_days_delete_own" on plan_days;
create policy "plan_days_delete_own"
on plan_days for delete
to authenticated
using (
  exists (
    select 1
    from plans p
    where p.id = plan_days.plan_id
      and p.user_id = auth.uid()
  )
);
