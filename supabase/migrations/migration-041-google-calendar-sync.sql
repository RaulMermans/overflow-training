-- migration-041: Google Calendar sync tables
-- Adds per-user calendar connection state and scheduled_routine → Google event mapping.

-- ── google_calendar_connections ─────────────────────────────────────────────
-- One row per user. Stores which calendar they've selected and whether sync
-- is enabled. Actual OAuth tokens are stored client-side in SecureStore.

create table public.google_calendar_connections (
  id                       uuid        primary key default uuid_generate_v4(),
  user_id                  uuid        not null references auth.users(id) on delete cascade,
  selected_calendar_id     text        not null default 'primary',
  selected_calendar_summary text,
  sync_enabled             boolean     not null default false,
  status                   text        not null default 'disconnected',
    -- 'connected' | 'disconnected' | 'error'
  connected_at             timestamptz,
  updated_at               timestamptz not null default now(),
  last_error               text,
  constraint google_calendar_connections_user_id_key unique (user_id)
);

alter table public.google_calendar_connections enable row level security;

create policy "google_calendar_connections_all_own"
on public.google_calendar_connections
for all
to authenticated
using  ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create trigger google_calendar_connections_updated_at
  before update on public.google_calendar_connections
  for each row execute function public.update_updated_at_column();

-- ── scheduled_workout_calendar_links ────────────────────────────────────────
-- One row per scheduled_routine. Maps a scheduled workout to its Google
-- Calendar event so the app can update/delete it later.

create table public.scheduled_workout_calendar_links (
  id                    uuid        primary key default uuid_generate_v4(),
  user_id               uuid        not null references auth.users(id) on delete cascade,
  scheduled_routine_id  uuid        not null references public.scheduled_routines(id) on delete cascade,
  external_calendar_id  text        not null,
  external_event_id     text        not null,
  sync_status           text        not null default 'pending',
    -- 'synced' | 'pending' | 'error'
  last_synced_at        timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint scheduled_workout_calendar_links_unique unique (user_id, scheduled_routine_id)
);

alter table public.scheduled_workout_calendar_links enable row level security;

create policy "scheduled_workout_calendar_links_all_own"
on public.scheduled_workout_calendar_links
for all
to authenticated
using  ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create trigger scheduled_workout_calendar_links_updated_at
  before update on public.scheduled_workout_calendar_links
  for each row execute function public.update_updated_at_column();
