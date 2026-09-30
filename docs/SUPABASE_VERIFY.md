# Supabase Live-Schema Verification Checklist

Run these queries in the **Supabase SQL Editor** against your live instance
before submitting to TestFlight. Every query should return the expected result.
If any check fails, resolve the mismatch **before** shipping.

---

## Quick Verify (Recommended)

Instead of running each query individually, paste the entire contents of
[`docs/SUPABASE_VERIFY_ALL.sql`](./SUPABASE_VERIFY_ALL.sql) into the
Supabase SQL Editor and click **Run**. Each `SELECT` produces a separate
result grid. Compare the outputs to the table below.

### Expected Outputs — What PASS looks like

| Section                     | Query                                                                                           | Pass criteria                                                                                                                                                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Tables                   | Tables exist                                                                                    | 6 rows: `exercise_definitions`, `exercise_favorites`, `routine_favorites`, `workouts`, `workout_exercises`, `workout_sets`                                                                                                                                                                           |
| 2. Enum                     | workout_status values                                                                           | 2 values: `completed`, `in_progress`                                                                                                                                                                                                                                                                 |
| 3a–3d. Columns              | Per-table column check                                                                          | Row counts and types match the tables in Sections 2a–2d below (including `scope`, `owner_user_id`, `category`, `tracking_mode`, `name_norm`, `duration_seconds`, and `distance_m`)                                                                                                                   |
| 4. RLS                      | RLS enabled                                                                                     | 4 rows, all `rowsecurity = true`                                                                                                                                                                                                                                                                     |
| 5. Policies                 | RLS policies                                                                                    | 16 rows matching the table in Section 4 below                                                                                                                                                                                                                                                        |
| 6. Constraints              | Check constraints                                                                               | 10 rows: prior checks plus `exercise_definitions_scope_owner_consistency_check`, `workout_sets_duration_seconds_nonneg`, `workout_sets_distance_m_nonneg`, `workout_sets_metric_presence_check`                                                                                                      |
| 6b. Trigger                 | Legacy derivation trigger                                                                       | `exercise_definitions_sync_exercise_type_trg` with function `sync_exercise_type_from_category`                                                                                                                                                                                                       |
| 7. Indexes                  | Table indexes                                                                                   | 17+ rows covering PKs, unique, and performance indexes (including `exercise_definitions_owner_user_id_idx`, `exercise_definitions_scope_idx`, `exercise_definitions_category_idx`, `exercise_definitions_tracking_mode_idx`, `exercise_definitions_name_norm_idx`, and existing target/type indexes) |
| 8. Seed count               | Exercise count                                                                                  | `exercise_count >= 10`                                                                                                                                                                                                                                                                               |
| 9. Seed slugs               | Exercise slugs                                                                                  | 10 known slugs listed in Section 5 below                                                                                                                                                                                                                                                             |
| 10. Legacy tables           | Deprecated status                                                                               | 0 rows (no legacy tables) or all marked `DEPRECATED`                                                                                                                                                                                                                                                 |
| 11. FK integrity            | exercise_definition_id refs                                                                     | `orphan_exercise_refs = 0`                                                                                                                                                                                                                                                                           |
| 12. Title status            | workouts.title                                                                                  | 0 rows (absent) or `is_nullable = 'YES'`                                                                                                                                                                                                                                                             |
| 13. updated_at triggers     | touch_updated_at on sync tables                                                                 | 7 rows: `checkin_photos_touch_updated_at`, `exercise_definitions_touch_updated_at`, `plan_days_touch_updated_at`, `plans_touch_updated_at`, `routine_items_touch_updated_at`, `routines_touch_updated_at`, `user_settings_touch_updated_at`                                                          |
| 14. One active plan         | plans_one_active_per_user index                                                                 | 1 row                                                                                                                                                                                                                                                                                                |
| 15a. Ordering uniqueness    | workout_exercises_order_unique, workout_sets_set_unique                                         | 2 rows                                                                                                                                                                                                                                                                                               |
| 15b. Weight consistency     | workout_sets_weight_consistency constraint                                                      | 1 row                                                                                                                                                                                                                                                                                                |
| 16. activate_plan RPC       | activate_plan function                                                                          | 1 row                                                                                                                                                                                                                                                                                                |
| 17. Performance indexes     | workouts_user_started_at_desc, routines_user_updated_at_desc, plans_user_active_updated_at_desc | 3 rows                                                                                                                                                                                                                                                                                               |
| 18. RLS policy optimization | Hot-table policies use auth.uid() in USING/with_check                                           | All rows show uses_select_auth_uid_in_using = true where applicable; uses_select_auth_uid_in_check = true for INSERT/UPDATE                                                                                                                                                                          |

If any section fails, see the detailed per-query instructions below to
diagnose the specific issue.

---

## 1. Tables exist

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'exercise_definitions',
    'exercise_favorites',
    'routine_favorites',
    'workouts',
    'workout_exercises',
    'workout_sets'
  )
ORDER BY table_name;
```

**Expected**: 6 rows — `exercise_definitions`, `exercise_favorites`,
`routine_favorites`, `workout_exercises`, `workout_sets`, `workouts`.

---

## 2. Column checks per table

> Note: on long-lived databases that used guarded `ALTER TABLE` migrations,
> column ordinal positions may differ from a fresh rebuild. Validate the same
> `(column_name, data_type, is_nullable)` set, not strict order.

### exercise_definitions

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'exercise_definitions'
ORDER BY ordinal_position;
```

| column_name       | data_type                | is_nullable |
| ----------------- | ------------------------ | ----------- |
| id                | uuid                     | NO          |
| name              | text                     | NO          |
| name_norm         | text                     | YES         |
| slug              | text                     | NO          |
| aliases           | ARRAY                    | NO          |
| muscle_group      | text                     | YES         |
| equipment         | text                     | YES         |
| scope             | text                     | NO          |
| owner_user_id     | uuid                     | YES         |
| category          | text                     | NO          |
| tracking_mode     | text                     | NO          |
| exercise_type     | text                     | NO          |
| primary_targets   | ARRAY                    | NO          |
| secondary_targets | ARRAY                    | NO          |
| updated_at        | timestamp with time zone | NO          |
| deleted_at        | timestamp with time zone | YES         |
| client_id         | text                     | YES         |
| created_at        | timestamp with time zone | NO          |

### workouts

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'workouts'
ORDER BY ordinal_position;
```

| column_name   | data_type                | is_nullable |
| ------------- | ------------------------ | ----------- |
| id            | uuid                     | NO          |
| user_id       | uuid                     | NO          |
| client_uuid   | uuid                     | NO          |
| started_at    | timestamp with time zone | NO          |
| ended_at      | timestamp with time zone | YES         |
| status        | USER-DEFINED             | NO          |
| notes         | text                     | YES         |
| effort_rating | integer                  | YES         |
| session_note  | text                     | YES         |
| created_at    | timestamp with time zone | NO          |

### workout_exercises

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'workout_exercises'
ORDER BY ordinal_position;
```

| column_name            | data_type                | is_nullable |
| ---------------------- | ------------------------ | ----------- |
| id                     | uuid                     | NO          |
| workout_id             | uuid                     | NO          |
| client_uuid            | uuid                     | NO          |
| exercise_definition_id | uuid                     | NO          |
| order_index            | integer                  | NO          |
| notes                  | text                     | YES         |
| created_at             | timestamp with time zone | NO          |

### workout_sets

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'workout_sets'
ORDER BY ordinal_position;
```

| column_name         | data_type                | is_nullable |
| ------------------- | ------------------------ | ----------- |
| id                  | uuid                     | NO          |
| workout_exercise_id | uuid                     | NO          |
| client_uuid         | uuid                     | NO          |
| set_index           | integer                  | NO          |
| reps                | integer                  | YES         |
| weight              | numeric                  | YES         |
| weight_kg           | numeric                  | YES         |
| duration_seconds    | integer                  | YES         |
| distance_m          | numeric                  | YES         |
| is_weight_canonical | boolean                  | NO          |
| is_completed        | boolean                  | NO          |
| created_at          | timestamp with time zone | NO          |

---

## 3. RLS enabled

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'exercise_definitions',
    'workouts',
    'workout_exercises',
    'workout_sets'
  )
ORDER BY tablename;
```

**Expected**: All 4 rows show `rowsecurity = true`.

---

## 4. RLS policies

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
```

**Expected 16 policies**:

| table                | policy                                    | cmd    |
| -------------------- | ----------------------------------------- | ------ |
| exercise_definitions | exercise_definitions_select_authenticated | SELECT |
| exercise_definitions | exercise_definitions_insert_own           | INSERT |
| exercise_definitions | exercise_definitions_update_own           | UPDATE |
| exercise_definitions | exercise_definitions_delete_own           | DELETE |
| workout_exercises    | workout_exercises_select_own              | SELECT |
| workout_exercises    | workout_exercises_insert_own              | INSERT |
| workout_exercises    | workout_exercises_update_own              | UPDATE |
| workout_exercises    | workout_exercises_delete_own              | DELETE |
| workout_sets         | workout_sets_select_own                   | SELECT |
| workout_sets         | workout_sets_insert_own                   | INSERT |
| workout_sets         | workout_sets_update_own                   | UPDATE |
| workout_sets         | workout_sets_delete_own                   | DELETE |
| workouts             | workouts_select_own                       | SELECT |
| workouts             | workouts_insert_own                       | INSERT |
| workouts             | workouts_update_own                       | UPDATE |
| workouts             | workouts_delete_own                       | DELETE |

`exercise_definitions` access model:

- authenticated users can read `scope='system'` rows.
- authenticated users can read/update/delete their own rows (`owner_user_id = auth.uid()`).
- inserts require `scope='user'` and `owner_user_id = auth.uid()`.
- `exercise_type` is legacy-derived from `category` via trigger; new app logic should rely on `category`.

---

## 5. Seed data

```sql
SELECT count(*) AS exercise_count FROM exercise_definitions;
```

**Expected**: at least **10** rows (seeded with `ON CONFLICT DO NOTHING`).

Optionally verify specific slugs:

```sql
SELECT slug FROM exercise_definitions ORDER BY slug;
```

Expected slugs: `bench-press`, `bicep-curl`, `deadlift`,
`dumbbell-bench-press`, `dumbbell-row`, `incline-bench-press`,
`lat-pulldown`, `overhead-press`, `squat`, `tricep-pushdown`.

---

## 6. Check constraints

```sql
SELECT conname, conrelid::regclass AS table_name
FROM pg_constraint
WHERE conrelid::regclass::text IN ('exercise_definitions', 'workout_exercises', 'workout_sets', 'workouts')
  AND contype = 'c'
ORDER BY table_name, conname;
```

**Expected**:

| table_name           | conname                                            |
| -------------------- | -------------------------------------------------- |
| exercise_definitions | exercise_definitions_scope_owner_consistency_check |
| workout_exercises    | workout_exercises_order_index_nonneg               |
| workout_sets         | workout_sets_reps_positive                         |
| workout_sets         | workout_sets_set_index_nonneg                      |
| workout_sets         | workout_sets_weight_nonneg                         |
| workout_sets         | workout_sets_weight_kg_nonneg                      |
| workout_sets         | workout_sets_duration_seconds_nonneg               |
| workout_sets         | workout_sets_distance_m_nonneg                     |
| workout_sets         | workout_sets_metric_presence_check                 |
| workouts             | workouts_effort_rating_range                       |

---

## 6b. category -> exercise_type trigger

```sql
SELECT
  t.tgname AS trigger_name,
  p.proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.exercise_definitions'::regclass
  AND NOT t.tgisinternal
  AND t.tgname = 'exercise_definitions_sync_exercise_type_trg';
```

**Expected**: 1 row with:

- `trigger_name = exercise_definitions_sync_exercise_type_trg`
- `function_name = sync_exercise_type_from_category`

---

## 7. Indexes

```sql
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'exercise_definitions',
    'workouts',
    'workout_exercises',
    'workout_sets'
  )
ORDER BY tablename, indexname;
```

**Expected**: 17+ rows covering PKs, unique, and performance indexes,
including `exercise_definitions_aliases_gin_idx`,
`exercise_definitions_owner_user_id_idx`,
`exercise_definitions_scope_idx`,
`exercise_definitions_category_idx`,
`exercise_definitions_tracking_mode_idx`,
`exercise_definitions_name_norm_idx`,
`exercise_definitions_primary_targets_gin_idx`,
`exercise_definitions_secondary_targets_gin_idx`,
`exercise_definitions_exercise_type_idx`, and
`workouts_completed_user_started_at_idx` for started_at-based progress range scans.

---

## 8. Legacy table status (post migration-002)

```sql
SELECT
  c.relname AS table_name,
  d.description AS table_comment,
  CASE
    WHEN d.description ILIKE '%deprecated%' THEN 'DEPRECATED (ok)'
    ELSE 'NOT DEPRECATED (review needed)'
  END AS status
FROM pg_class c
LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('exercise_catalog', 'exercise_aliases', 'exercises')
  AND c.relkind = 'r'
ORDER BY c.relname;
```

**Expected**: 0 rows (legacy tables don't exist) or all rows show
`DEPRECATED (ok)` in the status column.

---

## 9. FK integrity for exercise_definition_id

```sql
SELECT count(*) AS orphan_exercise_refs
FROM workout_exercises we
WHERE we.exercise_definition_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM exercise_definitions ed WHERE ed.id = we.exercise_definition_id
  );
```

**Expected**: `orphan_exercise_refs = 0` — all exercise references are valid.

---

## 10. workouts.title status

```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workouts'
  AND column_name = 'title';
```

**Expected**: 0 rows (column doesn't exist, cleanest state) or 1 row with
`is_nullable = 'YES'`. If `is_nullable = 'NO'`, run migration-002 to fix.

---

## 13. updated_at triggers (migration-023)

```sql
SELECT t.tgname AS trigger_name
FROM pg_trigger t
WHERE t.tgrelid IN (
  'public.routines'::regclass,
  'public.routine_items'::regclass,
  'public.plans'::regclass,
  'public.plan_days'::regclass,
  'public.user_settings'::regclass,
  'public.checkin_photos'::regclass,
  'public.exercise_definitions'::regclass
)
AND NOT t.tgisinternal
AND t.tgname LIKE '%touch_updated_at'
ORDER BY t.tgname;
```

**Expected**: 7 rows with trigger names:
`checkin_photos_touch_updated_at`, `exercise_definitions_touch_updated_at`,
`plan_days_touch_updated_at`, `plans_touch_updated_at`,
`routine_items_touch_updated_at`, `routines_touch_updated_at`,
`user_settings_touch_updated_at`.

---

## 14. plans one-active-per-user index (migration-024)

```sql
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'plans'
  AND indexname = 'plans_one_active_per_user';
```

**Expected**: 1 row with `plans_one_active_per_user`.

---

## 15a. Execution ordering uniqueness (migration-024)

```sql
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    (tablename = 'workout_exercises' AND indexname = 'workout_exercises_order_unique')
    OR (tablename = 'workout_sets' AND indexname = 'workout_sets_set_unique')
  )
ORDER BY tablename, indexname;
```

**Expected**: 2 rows — `workout_exercises_order_unique`, `workout_sets_set_unique`.

---

## 15b. Weight consistency constraint (migration-024)

```sql
SELECT conname
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid = 'public.workout_sets'::regclass
  AND conname = 'workout_sets_weight_consistency';
```

**Expected**: 1 row with `workout_sets_weight_consistency`.

---

## 16. activate_plan RPC (migration-024)

```sql
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'activate_plan';
```

**Expected**: 1 row with `activate_plan`.

---

## 17. Performance indexes (migration-025)

```sql
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'workouts_user_started_at_desc',
    'routines_user_updated_at_desc',
    'plans_user_active_updated_at_desc'
  )
ORDER BY indexname;
```

**Expected**: 3 rows — `workouts_user_started_at_desc`, `routines_user_updated_at_desc`, `plans_user_active_updated_at_desc`.

---

## 18. RLS policy expression optimization (migration-025)

PASS criteria:

- All hot-table policies use `(select auth.uid())` in `USING` / `with_check`.
- `qual` and `with_check` are `pg_policies` columns; policies without `with_check` show `NULL`.

```sql
SELECT schemaname, tablename, policyname,
       (qual IS NOT NULL AND qual::text LIKE '%auth.uid()%') AS uses_select_auth_uid_in_using,
       (with_check IS NOT NULL AND with_check::text LIKE '%auth.uid()%') AS uses_select_auth_uid_in_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('workouts', 'routines', 'plans', 'user_settings', 'exercise_definitions')
ORDER BY tablename, policyname;
```

**Expected**: All rows show `uses_select_auth_uid_in_using = true` where the policy has a USING expression. Policies with `with_check` (INSERT/UPDATE) should also show `uses_select_auth_uid_in_check = true`.

---

## If mismatched

Pick **ONE** direction and follow it completely:

- **Option A — DB leads**: Migrate the live database to match
  `supabase/schema.sql` exactly. Re-run `schema.sql` then `policies.sql`.
  If incremental fixes are required, use scripts under
  `supabase/migrations/` in documented order.
- **Option B — App leads**: Update `src/types/db.ts` and `src/db/workouts.ts`
  to match the live database columns.

**Never mix**: partial DB migration + partial app changes leads to runtime
errors that are hard to diagnose.

See also: [`docs/TESTFLIGHT_GO_NO_GO.md`](./TESTFLIGHT_GO_NO_GO.md) for the
full release checklist.
