# Account Deletion Manual Runbook (P0)

Run this end-to-end cycle whenever `delete_my_account()` or its migration changes, or before any TestFlight build.

---

## Step 0 — Pre-flight: live DB state check

Run both queries in the [Supabase SQL Editor](https://supabase.com/dashboard/project/<project-ref>/sql/new) **before** starting the cycle.

### 0a — Optional table existence

```sql
select
  to_regclass('public.profiles')            as profiles,
  to_regclass('public.bodyweight_entries')  as bodyweight_entries,
  to_regclass('public.goals')               as goals,
  to_regclass('public.exercise_catalog')    as exercise_catalog,
  to_regclass('public.workout_templates')   as workout_templates,
  to_regclass('public.exercises')           as legacy_exercises,
  to_regclass('public.exercise_favorites')  as exercise_favorites,
  to_regclass('public.routine_favorites')   as routine_favorites,
  to_regclass('public.checkin_photos')      as checkin_photos;
```

**Expected baseline** (live DB matching schema.sql):

| profiles | bodyweight_entries | goals | exercise_catalog | workout_templates | legacy_exercises | exercise_favorites        | routine_favorites        | checkin_photos        |
| -------- | ------------------ | ----- | ---------------- | ----------------- | ---------------- | ------------------------- | ------------------------ | --------------------- |
| null     | null               | null  | null             | null              | null             | public.exercise_favorites | public.routine_favorites | public.checkin_photos |

If any of the first 6 columns is non-null, the live DB has tables not in schema.sql. The residual SQL in Step 6 handles them via `to_regclass` guards — no action needed here, but note it for the record.

### 0b — Live FK discovery (schema drift check)

```sql
select
  conrelid::regclass as table_name,
  a.attname          as fk_column
from pg_constraint con
join pg_attribute a
  on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
where con.contype = 'f'
  and con.confrelid = 'auth.users'::regclass
  and connamespace = 'public'::regnamespace
order by 1;
```

**Expected (exactly 8 rows):**

| table_name                  | fk_column     |
| --------------------------- | ------------- |
| public.checkin_photos       | user_id       |
| public.exercise_definitions | owner_user_id |
| public.exercise_favorites   | user_id       |
| public.plans                | user_id       |
| public.routine_favorites    | user_id       |
| public.routines             | user_id       |
| public.user_settings        | user_id       |
| public.workouts             | user_id       |

Any extra row not in this list → the RPC has a coverage gap. File a bug or create migration-018 with a dynamic FK loop.

---

## Step 1 — Live function verification

```sql
select
  routine_name,
  security_type,
  routine_definition is not null as has_body
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'delete_my_account';
```

**Expected:**

| routine_name      | security_type | has_body |
| ----------------- | ------------- | -------- |
| delete_my_account | DEFINER       | true     |

Also verify `search_path` and `SECURITY DEFINER`:

```sql
select
  proname,
  prosecdef,
  proconfig
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'delete_my_account';
```

- `prosecdef` must be `true` (SECURITY DEFINER)
- `proconfig` must contain `search_path=public, auth, pg_temp`

---

## Step 2 — Dirty data creation

Use a fresh test account each run (e.g. `test-delete+002@yourmail.com`; increment the suffix per run).
Create data in **this exact order** to ensure all FK tables are populated:

| #   | In-app action                                          | Table(s) written                                            |
| --- | ------------------------------------------------------ | ----------------------------------------------------------- |
| 1   | Sign up and sign in                                    | `auth.users`                                                |
| 2   | Open **Profile** tab                                   | `user_settings` (auto-upserted by `loadWeeklyWorkoutsGoal`) |
| 3   | Start workout → add 1 exercise + 1 set → **Finish**    | `workouts`, `workout_exercises`, `workout_sets`             |
| 4   | Routines → **New Routine** → add 1 exercise → **Save** | `routines`, `routine_items`                                 |
| 5   | Calendar → **Add Plan** → assign the routine to 1 day  | `plans`, `plan_days`                                        |
| 6   | Exercise picker → tap ♥ on any exercise                | `exercise_favorites`                                        |
| 7   | Workout tab → tap ♥ on a routine card                  | `routine_favorites`                                         |
| 8   | Check-ins → **Add Check-in** → upload a photo          | `checkin_photos`, Storage object                            |

> **`user_settings` timing:** The upsert fires the first time `loadWeeklyWorkoutsGoal()` runs,
> which happens when the **Profile tab renders** — not on auth sign-in. Always visit Profile
> before attempting deletion or the user_settings row will be absent.

---

## Step 3 — Capture UID

Dashboard → **Authentication → Users** → find the test email → copy the UUID.

Or via SQL:

```sql
select id from auth.users where email = 'test-delete+002@yourmail.com';
```

Keep this UUID for Step 6 residual verification.

---

## Step 4 — Storage guard test (photo still present)

**In-app (photo NOT yet deleted):**

1. Profile → **Delete Account**
2. Type `DELETE` in the confirmation field
3. Tap **Confirm**

**Expected:**

- Error toast: _"Account deletion blocked: you still own Storage objects…"_
- Spinner clears; UI is interactive (no freeze, no stuck modal)

**Failure mode:** If the guard does not fire, check `storage.objects` in Dashboard → Storage and confirm the photo's `owner` column matches the user's UID.

---

## Step 5 — Happy-path deletion

**Before proceeding:** delete the check-in photo inside the app (Check-ins → swipe to delete), then verify in Dashboard → **Storage → Objects** that no objects remain for this user.

**In-app:**

1. Profile → **Delete Account**
2. Type `DELETE` in the confirmation field
3. Tap **Confirm**

**Expected:**

- Spinner clears within ~3 s
- App returns to the **Auth screen** with no freeze

**Verify sign-in fails:**

1. Tap **Sign In** on the auth screen
2. Enter `test-delete+002@yourmail.com` + original password
3. Expected: auth error (not a silent success or a crash)

---

## Step 6 — Residual verification SQL

### 6a — Known tables (always exist)

Replace `<UID>` with the UUID from Step 3. All `remaining` values must be **0**.

```sql
-- Replace <UID> with the deleted user's UUID
with target(id) as (values ('<UID>'::uuid))
select
  'auth.users'        as tbl,
  (select count(*) from auth.users
   where id = (select id from target))                                              as remaining
union all
select 'workouts',
  (select count(*) from public.workouts
   where user_id = (select id from target))
union all
select 'routines',
  (select count(*) from public.routines
   where user_id = (select id from target))
union all
select 'routine_favorites',
  (select count(*) from public.routine_favorites
   where user_id = (select id from target))
union all
select 'plans',
  (select count(*) from public.plans
   where user_id = (select id from target))
union all
select 'exercise_favorites',
  (select count(*) from public.exercise_favorites
   where user_id = (select id from target))
union all
select 'user_settings',
  (select count(*) from public.user_settings
   where user_id = (select id from target))
union all
select 'checkin_photos',
  (select count(*) from public.checkin_photos
   where user_id = (select id from target))
union all
select 'exercise_definitions (custom)',
  (select count(*) from public.exercise_definitions
   where owner_user_id = (select id from target))
order by tbl;
```

> **`workout_exercises` and `workout_sets`** do not have a direct `user_id` column.
> They cascade-delete from `workouts`, so `workouts = 0` guarantees both are also 0.
> If you want an explicit check, join via: `workout_exercises we JOIN workouts w ON w.id = we.workout_id WHERE w.user_id = uid`.

### 6b — Optional tables (use `to_regclass` guard)

Paste this DO block in a **separate SQL editor run**. Outputs appear in the **Messages** tab.

```sql
do $$
declare
  uid uuid := '<UID>';  -- replace with deleted user UUID
begin
  if to_regclass('public.bodyweight_entries') is not null then
    raise notice 'bodyweight_entries: %',
      (select count(*) from public.bodyweight_entries where user_id = uid)::text;
  else
    raise notice 'bodyweight_entries: table_absent (ok)';
  end if;

  if to_regclass('public.profiles') is not null then
    raise notice 'profiles: %',
      (select count(*) from public.profiles where user_id = uid)::text;
  else
    raise notice 'profiles: table_absent (ok)';
  end if;

  if to_regclass('public.goals') is not null then
    -- "userId" is a case-sensitive column name
    raise notice 'goals: %',
      (select count(*) from public.goals where "userId" = uid)::text;
  else
    raise notice 'goals: table_absent (ok)';
  end if;

  if to_regclass('public.workout_templates') is not null then
    raise notice 'workout_templates: %',
      (select count(*) from public.workout_templates where owner_user_id = uid)::text;
  else
    raise notice 'workout_templates: table_absent (ok)';
  end if;
end;
$$;
```

---

## Pass criteria

| Check                           | Expected                                 |
| ------------------------------- | ---------------------------------------- |
| Storage guard (Step 4)          | Error toast shown; UI unlocks; no freeze |
| Happy-path (Step 5)             | Auth screen within ~3 s; no freeze       |
| Post-deletion sign-in           | Auth error — sign-in fails               |
| `auth.users`                    | 0                                        |
| `workouts`                      | 0                                        |
| `routines`                      | 0                                        |
| `routine_favorites`             | 0                                        |
| `plans`                         | 0                                        |
| `exercise_favorites`            | 0                                        |
| `user_settings`                 | 0                                        |
| `checkin_photos`                | 0                                        |
| `exercise_definitions` (custom) | 0                                        |
| `bodyweight_entries`            | 0 or `table_absent`                      |
| `profiles`                      | 0 or `table_absent`                      |
| `goals`                         | 0 or `table_absent`                      |
| `workout_templates`             | 0 or `table_absent`                      |

Any non-zero count → deletion has a coverage gap. File a bug referencing this table and the migration that introduced it.

---

## Related files

| File                                                                                                                                                | Purpose                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| [`supabase/migrations/migration-017-delete-my-account-rpc-hardening.sql`](../supabase/migrations/migration-017-delete-my-account-rpc-hardening.sql) | Current RPC implementation         |
| [`src/db/account.ts`](../src/db/account.ts)                                                                                                         | Client-side call with 12 s timeout |
| [`docs/QA_SMOKE.md`](./QA_SMOKE.md) § 7                                                                                                             | Quick smoke for routine CI         |
| [`docs/SUPABASE_VERIFY.md`](./SUPABASE_VERIFY.md)                                                                                                   | Full schema verification checklist |
