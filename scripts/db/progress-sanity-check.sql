-- ============================================================
-- Progress sanity check: last 10 workouts
-- ============================================================
--
-- PURPOSE: Debug why progress might be empty. Completed workouts
-- must have status='completed' and ended_at set to count in analytics.
--
-- USAGE:
--   1. Replace YOUR_USER_ID with your auth.users.id (Dashboard > Auth > Users)
--   2. Run in Supabase Dashboard SQL Editor, or:
--      supabase db execute --file scripts/db/progress-sanity-check.sql
--      (Edit the file first to set user_id)
--
-- ============================================================

SELECT id, status, started_at, ended_at, updated_at
FROM public.workouts
WHERE user_id = 'YOUR_USER_ID'
ORDER BY coalesce(started_at, ended_at, created_at) DESC NULLS LAST
LIMIT 10;
