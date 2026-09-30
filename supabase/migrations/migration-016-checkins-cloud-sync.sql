-- Migration 016: cloud sync for check-in photos via private Supabase Storage.
-- Safe to run multiple times.

-- 1) Private bucket for check-in photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'checkins',
  'checkins',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/heic']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Metadata table
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

alter table public.checkin_photos enable row level security;

drop policy if exists "checkin_photos_select_own" on public.checkin_photos;
create policy "checkin_photos_select_own"
on public.checkin_photos for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "checkin_photos_insert_own" on public.checkin_photos;
create policy "checkin_photos_insert_own"
on public.checkin_photos for insert
to authenticated
with check (
  user_id = auth.uid()
  and split_part(photo_path, '/', 1) = auth.uid()::text
);

drop policy if exists "checkin_photos_update_own" on public.checkin_photos;
create policy "checkin_photos_update_own"
on public.checkin_photos for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and split_part(photo_path, '/', 1) = auth.uid()::text
);

drop policy if exists "checkin_photos_delete_own" on public.checkin_photos;
create policy "checkin_photos_delete_own"
on public.checkin_photos for delete
to authenticated
using (user_id = auth.uid());

-- 3) Storage object policies (private bucket, user folder only)
drop policy if exists "checkins_storage_select_own" on storage.objects;
create policy "checkins_storage_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "checkins_storage_insert_own" on storage.objects;
create policy "checkins_storage_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "checkins_storage_update_own" on storage.objects;
create policy "checkins_storage_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "checkins_storage_delete_own" on storage.objects;
create policy "checkins_storage_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = auth.uid()::text
);
