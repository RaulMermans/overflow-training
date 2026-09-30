# Progress v2 — Expected Outputs

> Historical note: use
> [`docs/progress-redesign/architecture.md`](docs/progress-redesign/architecture.md)
> for the current screen structure. This file remains the analytics reference for the original v2 data foundation.

Reference document for the golden scenarios defined in
`supabase/seed/progress_v2_golden_scenarios.sql`.

---

## Timezone note

All analytics views hard-code `'Europe/Madrid'` (UTC+1 in winter, UTC+2 in summer — BLOCKER B1 in migration-027). Workout timestamps in the seed use 10:00 UTC, landing at 11:00 Madrid — safely inside the same calendar day. The ISO week start each Monday is unchanged.

---

## View-level expected outputs

These queries are deterministic regardless of when you run them (no `current_timestamp` dependency). Run from the Supabase SQL editor with service role.

### S0 — Blank user

```sql
select count(*) from analytics.weekly_workouts
where user_id = 'aa000000-0000-0000-0000-000000000000';
```

| count |
| ----- |
| 0     |

```sql
select count(*) from analytics.weekly_strength_volume
where user_id = 'aa000000-0000-0000-0000-000000000000';
```

| count |
| ----- |
| 0     |

---

### S1 — Sparse (3 workouts)

#### weekly_workouts

```sql
select week_start, workouts_completed
from analytics.weekly_workouts
where user_id = 'aa000000-0000-0000-0000-000000000001'
order by week_start;
```

| week_start | workouts_completed |
| ---------- | ------------------ |
| 2026-01-19 | 1                  |
| 2026-02-02 | 1                  |
| 2026-02-09 | 1                  |

#### weekly_strength_volume

Volume formula: `SUM(weight_kg * reps)` per week.

Workout 1 (2026-01-19):

- Bench: (60+65+70)×5 = **975 kg**
- Squat: (80+90+100)×5 = **1350 kg**
- Week total: **2325 kg**

Workout 2 (2026-02-02):

- Bench: (65+70+72.5)×5 = **1037.5 kg**

Workout 3 (2026-02-09):

- Squat: (90+100+102.5)×5 = **1462.5 kg**

```sql
select week_start, round(strength_volume_kg::numeric, 1) as vol
from analytics.weekly_strength_volume
where user_id = 'aa000000-0000-0000-0000-000000000001'
order by week_start;
```

| week_start | vol    |
| ---------- | ------ |
| 2026-01-19 | 2325.0 |
| 2026-02-02 | 1037.5 |
| 2026-02-09 | 1462.5 |

#### weekly_training_time

```sql
select week_start, round(minutes_trained::numeric, 1) as mins
from analytics.weekly_training_time
where user_id = 'aa000000-0000-0000-0000-000000000001'
order by week_start;
```

| week_start | mins |
| ---------- | ---- |
| 2026-01-19 | 60.0 |
| 2026-02-02 | 45.0 |
| 2026-02-09 | 60.0 |

#### exercise_e1rm_weekly (Bench Press — eed00001-0000-0000-0000-000000000001)

e1RM formula: `weight_kg × (1 + reps / 30)` (Epley)

- Week 2026-01-19: best set = 70 kg × 5 → `70 × (1 + 5/30) = 81.667 kg`
- Week 2026-02-02: best set = 72.5 kg × 5 → `72.5 × (1 + 5/30) = 84.583 kg`

```sql
select week_start, round(best_e1rm::numeric, 2) as e1rm
from analytics.exercise_e1rm_weekly
where user_id = 'aa000000-0000-0000-0000-000000000001'
  and exercise_definition_id = 'eed00001-0000-0000-0000-000000000001'
order by week_start;
```

| week_start | e1rm  |
| ---------- | ----- |
| 2026-01-19 | 81.67 |
| 2026-02-02 | 84.58 |

#### weekly_muscle_balance (S1, week 2026-01-19)

Attribution rules (ADR-AN-003):

- 70% of volume → primary_targets (split equally)
- 30% of volume → secondary_targets (split equally)

Bench (975 kg-reps): Chest 341.25, Front Delt 341.25, Triceps 292.5
Squat (1350 kg-reps): Quads 472.5, Glutes 472.5, Hamstrings 405.0

```sql
select week_start, muscle_key, round(volume_kg::numeric, 2) as vol
from analytics.weekly_muscle_balance
where user_id = 'aa000000-0000-0000-0000-000000000001'
  and week_start = '2026-01-19'
order by vol desc;
```

| week_start | muscle_key | vol    |
| ---------- | ---------- | ------ |
| 2026-01-19 | Quads      | 472.50 |
| 2026-01-19 | Glutes     | 472.50 |
| 2026-01-19 | Hamstrings | 405.00 |
| 2026-01-19 | Chest      | 341.25 |
| 2026-01-19 | Front Delt | 341.25 |
| 2026-01-19 | Triceps    | 292.50 |

---

### S2 — Consistent (10 workouts, 4 active weeks)

#### weekly_workouts

```sql
select week_start, workouts_completed
from analytics.weekly_workouts
where user_id = 'aa000000-0000-0000-0000-000000000002'
order by week_start;
```

| week_start | workouts_completed |
| ---------- | ------------------ |
| 2026-01-19 | 3                  |
| 2026-01-26 | 3                  |
| 2026-02-02 | 2                  |
| 2026-02-09 | 2                  |

Total workouts: **10**
Average workouts/week (over 4 weeks): **2.5**

#### weekly_summary (aggregated)

```sql
select sum(workouts_completed) as total_workouts,
       round(avg(workouts_completed)::numeric, 1) as avg_per_week
from analytics.weekly_summary
where user_id = 'aa000000-0000-0000-0000-000000000002';
```

| total_workouts | avg_per_week |
| -------------- | ------------ |
| 10             | 2.5          |

---

### S3 — Focused (8 workouts, clear Bench e1RM progression)

#### exercise_e1rm_weekly (Bench Press, 8 weeks)

The seed increments bench weight by 2.5 kg each week. Best set each workout = last set (weight + 2.5, 4 reps).

Week progression (best_e1rm ≈ `(W+2.5) × (1 + 4/30)`):

| Week       | W    | Best set e1RM (approx) |
| ---------- | ---- | ---------------------- |
| 2026-01-05 | 80.0 | 82.5 × 1.133 = 93.50   |
| 2026-01-12 | 82.5 | 85.0 × 1.133 = 96.33   |
| 2026-01-19 | 85.0 | 87.5 × 1.133 = 99.17   |
| 2026-01-26 | 87.5 | 90.0 × 1.133 = 102.00  |
| 2026-02-02 | 90.0 | 92.5 × 1.133 = 104.83  |
| 2026-02-09 | 92.5 | 95.0 × 1.133 = 107.67  |
| 2026-02-16 | 95.0 | 97.5 × 1.133 = 110.50  |
| 2026-02-23 | 97.5 | 100.0 × 1.133 = 113.33 |

```sql
select week_start, round(best_e1rm::numeric, 2) as e1rm
from analytics.exercise_e1rm_weekly
where user_id = 'aa000000-0000-0000-0000-000000000003'
  and exercise_definition_id = 'eed00001-0000-0000-0000-000000000001'
order by week_start;
```

Row count: **8 rows** with monotonically increasing `best_e1rm`.

Trend check (first vs last): e1RM should increase ≥ 19 kg (+20%).

---

## RPC-level expected outputs (range-dependent)

The RPCs `rpc_progress_overview`, `rpc_strength_lift_trend`, `rpc_muscle_balance` use `current_timestamp` for their window calculation. Run these within 28 days of the seed's anchor date (2026-01-19 to 2026-02-15).

### rpc_progress_overview(28) — S1 (sparse)

```sql
select * from analytics.rpc_progress_overview(28)
-- run as user aa000000-0000-0000-0000-000000000001
```

Expected (approximately, if run on 2026-02-15):

| field              | value  |
| ------------------ | ------ |
| workouts           | 3      |
| workouts_per_week  | 0.8    |
| strength_volume_kg | 4825.0 |
| minutes_trained    | 165.0  |

Note: `workouts_per_week = ROUND(3 / 4, 1) = 0.8`
Note: `strength_volume_kg = 2325.0 + 1037.5 + 1462.5 = 4825.0`

### rpc_progress_overview(28) — S0 (blank)

All numeric fields should be **0.0**, `workouts = 0`.

### rpc_progress_overview(28) — S2 (consistent)

| field             | approx |
| ----------------- | ------ |
| workouts          | 10     |
| workouts_per_week | 2.5    |

---

## Service integrity checks

```sql
-- All seed views have security_invoker = true
select relname, reloptions
from pg_class
where relkind = 'v'
  and relnamespace = (select oid from pg_namespace where nspname = 'analytics')
order by relname;
-- All rows: reloptions should contain 'security_invoker=true'

-- No NULL user_id in weekly_summary (service-role scoped)
select count(*) from analytics.weekly_summary where user_id is null;
-- Expected: 0

-- All week_start values are Mondays (dow = 1)
select count(*) from analytics.weekly_workouts
where extract(dow from week_start) != 1;
-- Expected: 0

-- best_e1rm > 0 where present
select count(*) from analytics.exercise_e1rm_weekly where best_e1rm <= 0;
-- Expected: 0
```
