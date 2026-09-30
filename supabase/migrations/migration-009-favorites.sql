-- migration-009-favorites.sql
-- Adds per-user favorite tables for exercises and routines.

-- ── Exercise favorites ────────────────────────────────────────────────────────

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

-- ── Routine favorites ─────────────────────────────────────────────────────────

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
