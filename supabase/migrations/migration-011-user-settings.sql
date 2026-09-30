-- Migration 011: user settings for cross-device weekly workouts goal.
-- Safe to run multiple times.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weekly_workouts_goal smallint not null default 4,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_weekly_goal_range
    check (weekly_workouts_goal between 0 and 14)
);

create index if not exists user_settings_updated_at_idx
  on public.user_settings (updated_at desc);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
on public.user_settings for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
on public.user_settings for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
on public.user_settings for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "user_settings_delete_own" on public.user_settings;
create policy "user_settings_delete_own"
on public.user_settings for delete
to authenticated
using (user_id = auth.uid());
