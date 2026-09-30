-- Migration 028: Add deleted_at to routines for soft-delete
--
-- Enables soft-delete: instead of hard-deleting a routine (which may violate
-- ON DELETE RESTRICT on scheduled_routines), we set deleted_at.
-- Cloud fetch filters out deleted_at IS NOT NULL.
-- Scheduled routines referencing a soft-deleted routine are cleaned up
-- as part of the deletion flow.

alter table public.routines
  add column if not exists deleted_at timestamptz null;

create index if not exists routines_deleted_at_idx
  on public.routines (deleted_at)
  where deleted_at is null;

comment on column public.routines.deleted_at is
  'Soft-delete timestamp. Non-null means the routine is logically deleted.';
