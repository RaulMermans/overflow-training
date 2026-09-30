-- Migration 023: updated_at auto-touch triggers for sync-surface tables
--
-- Ensures updated_at is set on real UPDATEs (even if callers forget),
-- does NOT bump on no-op updates (prevents false "remote is newer" churn),
-- and preserves client-provided updated_at when explicitly set (LWW logic).
--
-- Tables: routines, routine_items, plans, plan_days, user_settings,
--         checkin_photos, exercise_definitions (all have updated_at).
-- Idempotent: safe to re-run.
-- ============================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- If nothing changed, don't churn updated_at.
    if new is not distinct from old then
      return new;
    end if;

    -- If caller didn't explicitly change updated_at, set it.
    if new.updated_at is null or new.updated_at = old.updated_at then
      new.updated_at = now();
    end if;
  end if;

  return new;
end;
$$;

-- routines
drop trigger if exists routines_touch_updated_at on public.routines;
create trigger routines_touch_updated_at
before update on public.routines
for each row execute function public.touch_updated_at();

-- routine_items
drop trigger if exists routine_items_touch_updated_at on public.routine_items;
create trigger routine_items_touch_updated_at
before update on public.routine_items
for each row execute function public.touch_updated_at();

-- plans
drop trigger if exists plans_touch_updated_at on public.plans;
create trigger plans_touch_updated_at
before update on public.plans
for each row execute function public.touch_updated_at();

-- plan_days
drop trigger if exists plan_days_touch_updated_at on public.plan_days;
create trigger plan_days_touch_updated_at
before update on public.plan_days
for each row execute function public.touch_updated_at();

-- user_settings
drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
before update on public.user_settings
for each row execute function public.touch_updated_at();

-- checkin_photos
drop trigger if exists checkin_photos_touch_updated_at on public.checkin_photos;
create trigger checkin_photos_touch_updated_at
before update on public.checkin_photos
for each row execute function public.touch_updated_at();

-- exercise_definitions (user-editable rows use updated_at for sync)
drop trigger if exists exercise_definitions_touch_updated_at on public.exercise_definitions;
create trigger exercise_definitions_touch_updated_at
before update on public.exercise_definitions
for each row execute function public.touch_updated_at();
