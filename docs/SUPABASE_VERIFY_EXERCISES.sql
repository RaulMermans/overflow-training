-- ============================================================
-- Workout Tracker iOS — Exercise Library Verification
-- ============================================================
-- Run after supabase/migrations/migration-004-expand-exercise-library.sql.
-- Each SELECT produces a separate result grid.
-- ============================================================


-- ============ 1. Total exercise count ============
-- PASS: >= 210

SELECT count(*) AS total_exercises FROM exercise_definitions;


-- ============ 2. Duplicate slug check ============
-- PASS: 0 rows

SELECT slug, count(*) AS cnt
FROM exercise_definitions
GROUP BY slug
HAVING count(*) > 1;


-- ============ 3. Top 20 most recently inserted/updated ============

SELECT name, slug, muscle_group, equipment, aliases, created_at
FROM exercise_definitions
ORDER BY created_at DESC
LIMIT 20;


-- ============ 4. Distribution by muscle_group ============

SELECT muscle_group, count(*) AS cnt
FROM exercise_definitions
GROUP BY muscle_group
ORDER BY cnt DESC;


-- ============ 5. Distribution by equipment ============

SELECT equipment, count(*) AS cnt
FROM exercise_definitions
GROUP BY equipment
ORDER BY cnt DESC;
