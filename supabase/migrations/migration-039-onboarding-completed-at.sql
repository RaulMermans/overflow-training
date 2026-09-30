-- Migration 027: Add onboarding_completed_at to user_settings
--
-- Moves onboarding completion from device-local-only (SecureStore) to
-- durable, account-backed state in Supabase.
--
-- Backward compatible: column is nullable with no default.
-- Existing rows (users who already completed onboarding) will be backfilled
-- by the app on next bootstrap.

alter table public.user_settings
  add column if not exists onboarding_completed_at timestamptz null;

comment on column public.user_settings.onboarding_completed_at is
  'Timestamp when user completed onboarding. NULL means onboarding not yet completed (or pre-migration user awaiting backfill).';
