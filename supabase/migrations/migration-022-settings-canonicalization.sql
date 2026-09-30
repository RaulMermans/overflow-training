-- Migration 022: Settings canonicalization — user_settings as sole authority
--
-- Prerequisite: Run preflight queries from docs/PR_SETTINGS_CANONICALIZATION.md.
--
-- Behavior:
--   - No-op if public.profiles does not exist.
--   - If profiles exists and has weekly_workouts_goal:
--     a) Ensure user_settings rows exist for all profile users (idempotent).
--        New rows: use profile value when available; existing rows: never overwrite.
--     b) Drop weekly_workouts_goal from profiles.
--   - Safe to run multiple times (idempotent).
--
-- profiles.user_id is assumed; if profiles uses 'id' instead, adjust join.
-- ============================================================

do $$
declare
  _profiles_reg regclass;
  _has_goal boolean;
  _prof_key text;
begin
  _profiles_reg := to_regclass('public.profiles');
  if _profiles_reg is null then
    return;
  end if;

  -- Check if profiles has weekly_workouts_goal
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'weekly_workouts_goal'
  ) into _has_goal;

  if not _has_goal then
    return;
  end if;

  -- Determine profiles user key: user_id or id
  select case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name = 'user_id'
    ) then 'user_id'
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name = 'id'
    ) then 'id'
    else null
  end into _prof_key;

  if _prof_key is null then
    return;
  end if;

  -- Step 1: Ensure user_settings rows exist for all profile users.
  -- For NEW rows (ON CONFLICT DO NOTHING): use profile value when available.
  -- For EXISTING rows: do not touch (never overwrite non-null user_settings).
  if _prof_key = 'user_id' then
    insert into public.user_settings (user_id, weekly_workouts_goal, created_at, updated_at)
    select
      p.user_id,
      greatest(0, least(14, coalesce(p.weekly_workouts_goal, 4))),
      now(),
      now()
    from public.profiles p
    where p.user_id is not null
    on conflict (user_id) do nothing;
  else
    insert into public.user_settings (user_id, weekly_workouts_goal, created_at, updated_at)
    select
      p.id,
      greatest(0, least(14, coalesce(p.weekly_workouts_goal, 4))),
      now(),
      now()
    from public.profiles p
    where p.id is not null
    on conflict (user_id) do nothing;
  end if;

  -- Step 2: Drop overlapping column from profiles
  alter table public.profiles drop column if exists weekly_workouts_goal;

end $$;
