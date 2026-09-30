-- ============================================================
-- Migration 038: scheduled_routines UPDATE ownership invariant
-- Fixes drift where WITH CHECK was null in live policy.
-- ============================================================

drop policy if exists scheduled_routines_update_own on public.scheduled_routines;

create policy "scheduled_routines_update_own"
  on public.scheduled_routines for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
