# Analytics Metric Specifications

> **Status:** Phase 0 spec — locked for MVP. Do not add analytics views, RPCs, or UI before this doc is stable.
> **Last updated:** 2026-02-25
> **Cross-references:** `docs/analytics/time_windows.md`, `docs/analytics/units.md`, `docs/adr/ADR-AN-001`, `docs/adr/ADR-AN-002`, `docs/adr/ADR-AN-003`

---

## Global Conventions

These rules apply to **every** metric unless the metric explicitly overrides them.

### G1 — Status filter

```sql
w.status = 'completed'
```

In-progress workouts (`status = 'in_progress'`) are **excluded** from all analytics.

### G2 — Set completion filter

```sql
ws.is_completed IS NOT FALSE
```

Include sets where `is_completed = TRUE` or `is_completed IS NULL` (legacy rows). Exclude sets where `is_completed = FALSE` (abandoned sets).

### G3 — Workout date anchor

```sql
COALESCE(w.started_at, w.ended_at, w.created_at)
```

This is the canonical timestamp for bucketing into user-local days and weeks. Abbreviated as `workout_ts` in formulas below.

### G4 — User-local date bucketing

```sql
(workout_ts AT TIME ZONE :user_tz)::date  AS local_day
DATE_TRUNC('week', workout_ts AT TIME ZONE :user_tz)::date  AS iso_week_monday
```

`:user_tz` defaults to `'Europe/Madrid'` until `user_settings.timezone` exists (see `units.md §2.1`).

### G5 — Weight computation

```sql
COALESCE(ws.weight_kg, ws.weight)  AS w_kg
```

Always use `weight_kg`; fall back to `weight` for legacy rows where `weight_kg IS NULL`. Treat fallback as kg (see `units.md §1.2` for mixed-unit risk).

### G6 — Exercise definition validity

```sql
ed.deleted_at IS NULL
```

Exclude soft-deleted exercise definitions.

### G7 — Modality classification

Classification uses **both** `exercise_definitions.tracking_mode` and `exercise_definitions.category`.

| Modality | Rule                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| Strength | `ed.tracking_mode IN ('weight_reps', 'reps_only')`                                                           |
| Cardio   | `ed.tracking_mode = 'distance_time'` OR (`ed.tracking_mode = 'time' AND ed.category = 'cardio'`)             |
| Mobility | `ed.tracking_mode = 'time' AND ed.category IN ('warmup', 'stretch', 'mobility', 'yoga', 'pilates', 'other')` |

A workout is "mixed" if it contains exercises from more than one modality. Each exercise contributes to its own modality's metrics independently. See `ADR-AN-001` for rationale.

### G8 — Period window

Default: rolling 28 days (W28). See `time_windows.md` for all window definitions and comparison period logic.

---

## Consistency Metrics

### C1 — Workouts Completed Count

| Field             | Value                         |
| ----------------- | ----------------------------- |
| **Metric ID**     | `C1_WORKOUTS_COMPLETED_COUNT` |
| **Name**          | Workouts Completed            |
| **Scope**         | All modalities                |
| **Returned unit** | Integer count                 |
| **Rounding**      | Whole number                  |

**Definition:** Count of distinct completed workouts with `workout_ts` falling within the selected time window (user-local date).

**Formula:**

```sql
SELECT COUNT(DISTINCT w.id) AS c1
FROM workouts w
WHERE w.user_id = :uid
  AND w.status = 'completed'
  AND (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date
      BETWEEN :period_start_local AND :period_end_local;
```

**Data sources:** `workouts` (user_id, status, started_at, ended_at, created_at)

**Edge cases:**

| Scenario                      | Policy                                                           |
| ----------------------------- | ---------------------------------------------------------------- |
| Workout with 0 exercises/sets | Counted — `status = 'completed'` is the sole criterion           |
| Workout spanning midnight     | Assigned to user-local day of `started_at`                       |
| `started_at IS NULL`          | Use `COALESCE(started_at, ended_at, created_at)` for date bucket |

**UI-allowed claims:**

- "You completed **N workouts** this month."
- "**N** workouts" (card label with period label)
- Delta badge: "+3 (+25%)" or "New" (see `time_windows.md §5.3`)

**Not allowed:** "You've been consistent!" — subjective; not deterministic.

---

### C2 — Workouts Per Week

| Field             | Value                      |
| ----------------- | -------------------------- |
| **Metric ID**     | `C2_WORKOUTS_PER_WEEK_AVG` |
| **Name**          | Avg. Workouts / Week       |
| **Scope**         | All modalities             |
| **Returned unit** | Decimal (average)          |
| **Rounding**      | 1 decimal place            |

**Definition:** Average number of completed workouts per ISO week within the selected window. Partial weeks at the boundary of the window are included at their actual count (not prorated).

**Formula:**

```sql
WITH week_counts AS (
  SELECT
    DATE_TRUNC('week', COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date AS iso_week,
    COUNT(DISTINCT w.id) AS week_total
  FROM workouts w
  WHERE w.user_id = :uid
    AND w.status = 'completed'
    AND (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date
        BETWEEN :period_start_local AND :period_end_local
  GROUP BY 1
)
SELECT ROUND(AVG(week_total)::numeric, 1) AS c2
FROM week_counts;
```

For W28: exactly 4 ISO weeks; the denominator is always 4 (including weeks with 0 workouts).

**Data sources:** `workouts`

**Edge cases:**

| Scenario                    | Policy                                                    |
| --------------------------- | --------------------------------------------------------- |
| Week with 0 workouts        | Included in average as 0                                  |
| W28 window: 4 weeks exactly | Denominator = 4                                           |
| WALL window                 | Denominator = total ISO weeks from first workout to today |

**UI-allowed claims:**

- "**N.N** workouts/week on average"
- "You hit your goal of **N** workouts this week." (only if `C2 >= user_settings.weekly_workouts_goal` for the current week)

**Not allowed:** "You're on track!" — requires a target comparison that must use `weekly_workouts_goal` explicitly.

---

### C3 — Streak

| Field             | Value            |
| ----------------- | ---------------- |
| **Metric ID**     | `C3_STREAK_DAYS` |
| **Name**          | Current Streak   |
| **Scope**         | All modalities   |
| **Returned unit** | Integer (days)   |
| **Rounding**      | Whole number     |

**Definition:** The number of consecutive user-local calendar days ending at "today" (or "yesterday" if no workout today) during which at least one completed workout was logged. The streak breaks on the first day with no workout.

**Formula (pseudo-SQL — recommend computing in application layer or a recursive CTE):**

```sql
WITH active_days AS (
  SELECT DISTINCT
    (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date AS local_day
  FROM workouts w
  WHERE w.user_id = :uid
    AND w.status = 'completed'
),
anchor AS (
  -- Use today if worked out today, otherwise yesterday
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM active_days WHERE local_day = CURRENT_DATE AT TIME ZONE :user_tz)
    THEN (CURRENT_DATE AT TIME ZONE :user_tz)
    ELSE (CURRENT_DATE AT TIME ZONE :user_tz) - 1
  END AS streak_anchor
),
streak_sequence AS (
  SELECT
    a.local_day,
    (SELECT streak_anchor FROM anchor) - ROW_NUMBER() OVER (ORDER BY a.local_day DESC)::int AS grp
  FROM active_days a
  WHERE a.local_day <= (SELECT streak_anchor FROM anchor)
)
SELECT COUNT(*) AS c3
FROM streak_sequence
WHERE grp = (SELECT streak_anchor FROM anchor) - COUNT(*) OVER () + 1
  -- Simplified: all rows in the streak group where grp is constant
;
```

_Note: the recursive form is cleaner; recommend implementing as an application-layer loop over sorted distinct active days._

**Data sources:** `workouts`

**Edge cases:**

| Scenario                                  | Policy                                                   |
| ----------------------------------------- | -------------------------------------------------------- |
| No workout today AND no workout yesterday | Streak = 0                                               |
| Multiple workouts on same day             | Day counts once                                          |
| `started_at IS NULL`                      | Use `COALESCE(started_at, ended_at, created_at)` for day |
| First-ever workout                        | Streak = 1 if today or yesterday; 0 otherwise            |

**UI-allowed claims:**

- "**N-day** streak 🔥" (show flame only if N ≥ 3)
- "Keep it up! You've worked out **N days** in a row."

**Not allowed:** "Best streak ever" — requires all-time max streak, which is not defined in MVP. Do not show without explicit `C3_STREAK_DAYS_ALL_TIME` metric.

---

### C4 — Adherence (Plan vs Execution)

| Field             | Value              |
| ----------------- | ------------------ |
| **Metric ID**     | `C4_ADHERENCE_PCT` |
| **Name**          | Plan Adherence     |
| **Scope**         | All modalities     |
| **Returned unit** | Percentage (0–100) |
| **Rounding**      | Whole number       |

**⚠️ CONTRACT GAP — BLOCKED FOR MVP**

**Blocker:** There is no foreign key from `workouts` to `plan_days`. The schema establishes `plan_days.routine_id → routines.id` but no `workouts.plan_day_id` or `workouts.plan_id`. It is impossible to canonically determine whether a completed workout executed a specific planned routine.

**Heuristic approximation (not to be used in MVP):** For each day in the window, check if the user-local weekday matches a `plan_days.weekday` in the active plan. If a completed workout exists on that day, score it as "adhered". Accuracy is undermined by ad-hoc workouts on planned days and rest-day workouts.

**Required schema addition (do not implement in Phase 0):**

```sql
-- Proposed: one of the following
ALTER TABLE workouts ADD COLUMN plan_day_id uuid REFERENCES plan_days(id);
-- OR
ALTER TABLE workouts ADD COLUMN plan_id uuid REFERENCES plans(id);
```

**MVP policy:** Do not display C4 in the UI. Reserve the metric ID. Show "—" or hide the card until the schema gap is resolved.

---

## Strength Metrics

### S1 — Volume (kg)

| Field             | Value                                                      |
| ----------------- | ---------------------------------------------------------- |
| **Metric ID**     | `S1_VOLUME_KG`                                             |
| **Name**          | Strength Volume                                            |
| **Scope**         | Strength (`tracking_mode IN ('weight_reps', 'reps_only')`) |
| **Returned unit** | kg (canonical); display in user's unit preference          |
| **Rounding**      | 1 decimal place                                            |

**Definition:** Total weight lifted — sum of `weight_kg × reps` across all completed strength sets in the window.

**Formula:**

```sql
SELECT
  ROUND(SUM(COALESCE(ws.weight_kg, ws.weight) * ws.reps)::numeric, 1) AS s1_volume_kg
FROM workouts w
JOIN workout_exercises we ON we.workout_id = w.id
JOIN workout_sets ws       ON ws.workout_exercise_id = we.id
JOIN exercise_definitions ed ON ed.id = we.exercise_definition_id
WHERE w.user_id = :uid
  AND w.status = 'completed'
  AND (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date
      BETWEEN :period_start_local AND :period_end_local
  AND ws.is_completed IS NOT FALSE
  AND ed.tracking_mode IN ('weight_reps', 'reps_only')
  AND ed.deleted_at IS NULL
  AND ws.reps IS NOT NULL
  AND ws.reps > 0
  AND COALESCE(ws.weight_kg, ws.weight) IS NOT NULL
  AND COALESCE(ws.weight_kg, ws.weight) >= 0;
```

**Data sources:**

- `workouts`: user_id, status, started_at, ended_at, created_at
- `workout_exercises`: workout_id, exercise_definition_id
- `workout_sets`: workout_exercise_id, weight_kg, weight, reps, is_completed
- `exercise_definitions`: id, tracking_mode, deleted_at

**Edge cases:**

| Scenario                                                | Policy                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Set has reps but `weight_kg = NULL` and `weight = NULL` | Exclude — 0 weight is ambiguous for bodyweight exercises                     |
| Set has weight but `reps IS NULL`                       | Exclude — reps is required factor in volume                                  |
| Set has `weight_kg = 0` (bodyweight)                    | Included — contributes 0 to volume; sets still counted in S2                 |
| `set_type = 'warmup'`                                   | Included — warmup sets contribute to physical output                         |
| `set_type = 'drop'` or `'failure'`                      | Included                                                                     |
| `reps_only` exercises (no weight)                       | Excluded from S1 volume (weight component missing); included in S2 set count |

**UI-allowed claims:**

- "**N,NNN kg** lifted this month"
- "+N kg vs. last period" (delta)

**Not allowed:** "You lifted the equivalent of N elephants." — not deterministic per this spec.

---

### S2 — Sets Count

| Field             | Value           |
| ----------------- | --------------- |
| **Metric ID**     | `S2_SETS_COUNT` |
| **Name**          | Strength Sets   |
| **Scope**         | Strength        |
| **Returned unit** | Integer count   |
| **Rounding**      | Whole number    |

**Definition:** Count of completed strength sets in the window.

**Formula:**

```sql
SELECT COUNT(ws.id) AS s2_sets_count
FROM workouts w
JOIN workout_exercises we ON we.workout_id = w.id
JOIN workout_sets ws       ON ws.workout_exercise_id = we.id
JOIN exercise_definitions ed ON ed.id = we.exercise_definition_id
WHERE w.user_id = :uid
  AND w.status = 'completed'
  AND (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date
      BETWEEN :period_start_local AND :period_end_local
  AND ws.is_completed IS NOT FALSE
  AND ed.tracking_mode IN ('weight_reps', 'reps_only')
  AND ed.deleted_at IS NULL;
```

**Data sources:** Same as S1.

**Edge cases:**

| Scenario                       | Policy                                                            |
| ------------------------------ | ----------------------------------------------------------------- |
| Set with no reps and no weight | Still counted (metric_presence_check ensures at least one metric) |
| `set_type = 'warmup'`          | Included                                                          |

**UI-allowed claims:**

- "**N** sets completed"

---

### S3 — Estimated 1RM Trend

| Field             | Value                                |
| ----------------- | ------------------------------------ |
| **Metric ID**     | `S3_E1RM_TREND_KG`                   |
| **Name**          | Est. 1RM Trend                       |
| **Scope**         | Strength (per exercise)              |
| **Returned unit** | kg per exercise, weekly trend series |
| **Rounding**      | 1 decimal place                      |

**Definition:** For each strength exercise, the weekly best estimated 1RM (Epley formula) computed from completed sets. Produces a time series of (iso_week, e1rm_kg) per exercise for trend charting.

**Epley formula (locked — see ADR-AN-002):**

```
e1rm_kg = COALESCE(ws.weight_kg, ws.weight) * (1 + ws.reps / 30.0)
```

**Formula:**

```sql
WITH set_e1rm AS (
  SELECT
    we.exercise_definition_id,
    DATE_TRUNC('week', COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date AS iso_week,
    COALESCE(ws.weight_kg, ws.weight) * (1 + ws.reps::numeric / 30.0) AS e1rm_kg
  FROM workouts w
  JOIN workout_exercises we ON we.workout_id = w.id
  JOIN workout_sets ws       ON ws.workout_exercise_id = we.id
  JOIN exercise_definitions ed ON ed.id = we.exercise_definition_id
  WHERE w.user_id = :uid
    AND w.status = 'completed'
    AND (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date
        BETWEEN :period_start_local AND :period_end_local
    AND ws.is_completed IS NOT FALSE
    AND ed.tracking_mode IN ('weight_reps', 'reps_only')
    AND ed.deleted_at IS NULL
    AND ws.reps IS NOT NULL
    AND ws.reps BETWEEN 1 AND 36        -- valid rep range for Epley (see ADR-AN-002)
    AND COALESCE(ws.weight_kg, ws.weight) > 0
)
SELECT
  exercise_definition_id,
  iso_week,
  ROUND(MAX(e1rm_kg)::numeric, 1) AS weekly_best_e1rm_kg  -- weekly best, not average
FROM set_e1rm
GROUP BY exercise_definition_id, iso_week
ORDER BY exercise_definition_id, iso_week;
```

**Data sources:** Same as S1, plus `exercise_definitions.name` for display.

**Edge cases:**

| Scenario                               | Policy                                                     |
| -------------------------------------- | ---------------------------------------------------------- |
| `reps = 0`                             | Exclude — invalid for Epley                                |
| `reps > 36`                            | Exclude — Epley unreliable above ~36 reps (see ADR-AN-002) |
| `weight_kg = 0` (bodyweight)           | Exclude from e1RM — meaningless                            |
| `weight IS NULL AND weight_kg IS NULL` | Exclude                                                    |
| Single-rep set (`reps = 1`)            | e1RM = weight × (1 + 1/30) ≈ weight × 1.033. Included.     |
| Machine exercises                      | Included — no machine-specific treatment in MVP            |
| Week with no valid sets                | No row emitted for that week (gap in series)               |

**UI-allowed claims:**

- "Est. 1RM: **N.N kg**" (current period best, per exercise)
- Trend chart of weekly best e1RM

**Not allowed:** "You hit a new PR!" — use S4 for PR events, not S3 trend display.

---

### S4 — PR Events

| Field             | Value                                |
| ----------------- | ------------------------------------ |
| **Metric ID**     | `S4_PR_EVENTS_COUNT`                 |
| **Name**          | Personal Records                     |
| **Scope**         | Strength (per exercise)              |
| **Returned unit** | Integer count of PR events in window |
| **Rounding**      | Whole number                         |

**Definition:** A PR event is a set whose Epley e1RM exceeds **all** prior Epley e1RMs for the same exercise definition by the same user. Count of such events within the selected window.

**Formula:**

```sql
WITH all_e1rm AS (
  SELECT
    we.exercise_definition_id,
    ws.id AS set_id,
    COALESCE(w.started_at, w.ended_at, w.created_at) AS workout_ts,
    COALESCE(ws.weight_kg, ws.weight) * (1 + ws.reps::numeric / 30.0) AS e1rm_kg
  FROM workouts w
  JOIN workout_exercises we ON we.workout_id = w.id
  JOIN workout_sets ws       ON ws.workout_exercise_id = we.id
  JOIN exercise_definitions ed ON ed.id = we.exercise_definition_id
  WHERE w.user_id = :uid
    AND w.status = 'completed'
    AND ws.is_completed IS NOT FALSE
    AND ed.tracking_mode IN ('weight_reps', 'reps_only')
    AND ed.deleted_at IS NULL
    AND ws.reps BETWEEN 1 AND 36
    AND COALESCE(ws.weight_kg, ws.weight) > 0
),
with_prev_max AS (
  SELECT
    set_id,
    workout_ts,
    e1rm_kg,
    MAX(e1rm_kg) OVER (
      PARTITION BY exercise_definition_id
      ORDER BY workout_ts
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS prev_best_e1rm
  FROM all_e1rm
)
SELECT COUNT(*) AS s4_pr_count
FROM with_prev_max
WHERE (prev_best_e1rm IS NULL OR e1rm_kg > prev_best_e1rm)   -- first set ever OR beats all prior
  AND (workout_ts AT TIME ZONE :user_tz)::date
      BETWEEN :period_start_local AND :period_end_local;
```

**Data sources:** `workouts`, `workout_exercises`, `workout_sets`, `exercise_definitions`

**Edge cases:**

| Scenario                        | Policy                          |
| ------------------------------- | ------------------------------- |
| First ever set for an exercise  | Is a PR (no prior exists)       |
| Tie (e1RM = prev best)          | Not a PR — must strictly exceed |
| Two PR sets in the same workout | Both count independently        |

**UI-allowed claims:**

- "**N** new PRs this period"
- "🏆 PR" badge on an individual workout's exercise card (requires per-set computation at display time)

---

## Cardio Metrics

### K1 — Distance

| Field             | Value                                      |
| ----------------- | ------------------------------------------ |
| **Metric ID**     | `K1_DISTANCE_KM`                           |
| **Name**          | Distance                                   |
| **Scope**         | Cardio (`tracking_mode = 'distance_time'`) |
| **Returned unit** | km (display); metres (compute)             |
| **Rounding**      | 2 decimal places                           |

**Formula:**

```sql
SELECT ROUND((SUM(ws.distance_m) / 1000.0)::numeric, 2) AS k1_distance_km
FROM workouts w
JOIN workout_exercises we ON we.workout_id = w.id
JOIN workout_sets ws       ON ws.workout_exercise_id = we.id
JOIN exercise_definitions ed ON ed.id = we.exercise_definition_id
WHERE w.user_id = :uid
  AND w.status = 'completed'
  AND (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date
      BETWEEN :period_start_local AND :period_end_local
  AND ws.is_completed IS NOT FALSE
  AND ed.tracking_mode = 'distance_time'
  AND ed.deleted_at IS NULL
  AND ws.distance_m IS NOT NULL
  AND ws.distance_m > 0;
```

**Edge cases:**

| Scenario                                               | Policy                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `distance_m IS NULL`                                   | Exclude set from K1                                                |
| `duration_seconds IS NULL` (distance without duration) | K1 still computed; K3 pace excluded for sets with missing duration |
| `distance_m = 0`                                       | Exclude — not a valid distance entry                               |

**UI-allowed claims:**

- "**N.NN km** total distance"

---

### K2 — Duration (Cardio)

| Field             | Value                                                |
| ----------------- | ---------------------------------------------------- |
| **Metric ID**     | `K2_CARDIO_DURATION_MIN`                             |
| **Name**          | Cardio Time                                          |
| **Scope**         | Cardio                                               |
| **Returned unit** | Minutes (decimal); display as `X h Y min` or `X min` |
| **Rounding**      | 1 decimal place                                      |

**Definition:** Total duration of cardio sets. Includes both `distance_time` and `time`-tracked cardio exercises.

**Formula:**

```sql
SELECT ROUND((SUM(ws.duration_seconds) / 60.0)::numeric, 1) AS k2_cardio_min
FROM workouts w
JOIN workout_exercises we ON we.workout_id = w.id
JOIN workout_sets ws       ON ws.workout_exercise_id = we.id
JOIN exercise_definitions ed ON ed.id = we.exercise_definition_id
WHERE w.user_id = :uid
  AND w.status = 'completed'
  AND (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date
      BETWEEN :period_start_local AND :period_end_local
  AND ws.is_completed IS NOT FALSE
  AND (
    ed.tracking_mode = 'distance_time'
    OR (ed.tracking_mode = 'time' AND ed.category = 'cardio')
  )
  AND ed.deleted_at IS NULL
  AND ws.duration_seconds IS NOT NULL
  AND ws.duration_seconds > 0;
```

**Edge cases:**

| Scenario                             | Policy                                        |
| ------------------------------------ | --------------------------------------------- |
| `duration_seconds IS NULL`           | Exclude set from K2                           |
| `distance_time` set with no duration | Excluded from K2; distance still counts in K1 |

**UI-allowed claims:**

- "**X h Y min** of cardio"

---

### K3 — Pace

| Field             | Value                           |
| ----------------- | ------------------------------- |
| **Metric ID**     | `K3_PACE_MIN_PER_KM`            |
| **Name**          | Avg Pace                        |
| **Scope**         | Cardio (`distance_time` only)   |
| **Returned unit** | min/km displayed as `MM:SS /km` |
| **Rounding**      | Display as `MM:SS`              |

**Definition:** Aggregate pace over the window — total duration divided by total distance.

**Formula:**

```sql
WITH cardio_totals AS (
  SELECT
    SUM(ws.duration_seconds) AS total_seconds,
    SUM(ws.distance_m)       AS total_metres
  FROM workouts w
  JOIN workout_exercises we ON we.workout_id = w.id
  JOIN workout_sets ws       ON ws.workout_exercise_id = we.id
  JOIN exercise_definitions ed ON ed.id = we.exercise_definition_id
  WHERE w.user_id = :uid
    AND w.status = 'completed'
    AND (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date
        BETWEEN :period_start_local AND :period_end_local
    AND ws.is_completed IS NOT FALSE
    AND ed.tracking_mode = 'distance_time'
    AND ed.deleted_at IS NULL
    AND ws.duration_seconds IS NOT NULL AND ws.duration_seconds > 0
    AND ws.distance_m IS NOT NULL AND ws.distance_m > 0
)
SELECT
  CASE
    WHEN total_metres > 0 AND total_seconds > 0
    THEN ROUND(((total_seconds / 60.0) / (total_metres / 1000.0))::numeric, 4)
    ELSE NULL
  END AS k3_pace_min_per_km
FROM cardio_totals;
```

**Edge cases:**

| Scenario                         | Policy                     |
| -------------------------------- | -------------------------- |
| No valid distance+duration sets  | Return `NULL`; display `—` |
| Distance > 0 but duration = NULL | Exclude from K3            |
| Duration > 0 but distance = NULL | Exclude from K3            |

**UI-allowed claims:**

- "Avg pace: **M:SS /km**"
- Show only when `K1 > 0 AND K2 > 0`

---

## Mobility Metrics

### M1 — Minutes Practiced

| Field             | Value                                                |
| ----------------- | ---------------------------------------------------- |
| **Metric ID**     | `M1_MOBILITY_MINUTES`                                |
| **Name**          | Mobility Time                                        |
| **Scope**         | Mobility                                             |
| **Returned unit** | Minutes (decimal); display as `X h Y min` or `X min` |
| **Rounding**      | 1 decimal place                                      |

**Formula:**

```sql
SELECT ROUND((SUM(ws.duration_seconds) / 60.0)::numeric, 1) AS m1_mobility_min
FROM workouts w
JOIN workout_exercises we ON we.workout_id = w.id
JOIN workout_sets ws       ON ws.workout_exercise_id = we.id
JOIN exercise_definitions ed ON ed.id = we.exercise_definition_id
WHERE w.user_id = :uid
  AND w.status = 'completed'
  AND (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date
      BETWEEN :period_start_local AND :period_end_local
  AND ws.is_completed IS NOT FALSE
  AND ed.tracking_mode = 'time'
  AND ed.category IN ('warmup', 'stretch', 'mobility', 'yoga', 'pilates', 'other')
  AND ed.deleted_at IS NULL
  AND ws.duration_seconds IS NOT NULL
  AND ws.duration_seconds > 0;
```

**Edge cases:**

| Scenario                                           | Policy              |
| -------------------------------------------------- | ------------------- |
| `category = 'other'` with `tracking_mode = 'time'` | Treated as mobility |
| `duration_seconds = NULL`                          | Exclude             |

**UI-allowed claims:**

- "**X min** of mobility work"

---

### M2 — Days Practiced

| Field             | Value                          |
| ----------------- | ------------------------------ |
| **Metric ID**     | `M2_MOBILITY_DAYS_COUNT`       |
| **Name**          | Mobility Days                  |
| **Scope**         | Mobility                       |
| **Returned unit** | Integer count of distinct days |
| **Rounding**      | Whole number                   |

**Formula:**

```sql
SELECT COUNT(DISTINCT (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date) AS m2_days
FROM workouts w
JOIN workout_exercises we ON we.workout_id = w.id
JOIN workout_sets ws       ON ws.workout_exercise_id = we.id
JOIN exercise_definitions ed ON ed.id = we.exercise_definition_id
WHERE w.user_id = :uid
  AND w.status = 'completed'
  AND (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date
      BETWEEN :period_start_local AND :period_end_local
  AND ws.is_completed IS NOT FALSE
  AND ed.tracking_mode = 'time'
  AND ed.category IN ('warmup', 'stretch', 'mobility', 'yoga', 'pilates', 'other')
  AND ed.deleted_at IS NULL
  AND ws.duration_seconds IS NOT NULL
  AND ws.duration_seconds > 0;
```

**UI-allowed claims:**

- "**N** days with mobility work"

---

## Balance & Body Metrics

### B1 — Muscle Group Distribution

| Field             | Value                                               |
| ----------------- | --------------------------------------------------- |
| **Metric ID**     | `B1_MUSCLE_DIST_PCT`                                |
| **Name**          | Muscle Group Balance                                |
| **Scope**         | Strength                                            |
| **Returned unit** | Percent share per muscle group (0–100, sums to 100) |
| **Rounding**      | 1 decimal place                                     |

**Definition:** For each muscle group (derived from `primary_targets` and `secondary_targets`), the percentage of total attributed volume (sets × weight) in the window. Weighting: 70% primary, 30% secondary (see ADR-AN-003).

**Formula:**

```sql
WITH set_base AS (
  SELECT
    ws.id AS set_id,
    COALESCE(ws.weight_kg, ws.weight) AS w_kg,
    COALESCE(ws.reps, 1) AS reps,   -- for reps_only: 1 rep weight = bodyweight, treated as 1
    ed.primary_targets,
    ed.secondary_targets
  FROM workouts w
  JOIN workout_exercises we ON we.workout_id = w.id
  JOIN workout_sets ws       ON ws.workout_exercise_id = we.id
  JOIN exercise_definitions ed ON ed.id = we.exercise_definition_id
  WHERE w.user_id = :uid
    AND w.status = 'completed'
    AND (COALESCE(w.started_at, w.ended_at, w.created_at) AT TIME ZONE :user_tz)::date
        BETWEEN :period_start_local AND :period_end_local
    AND ws.is_completed IS NOT FALSE
    AND ed.tracking_mode IN ('weight_reps', 'reps_only')
    AND ed.deleted_at IS NULL
),
primary_contrib AS (
  SELECT
    set_id,
    UNNEST(primary_targets) AS muscle,
    0.70 * COALESCE(w_kg, 0) * reps / NULLIF(CARDINALITY(primary_targets), 0) AS load
  FROM set_base
  WHERE CARDINALITY(primary_targets) > 0
),
secondary_contrib AS (
  SELECT
    set_id,
    UNNEST(secondary_targets) AS muscle,
    0.30 * COALESCE(w_kg, 0) * reps / NULLIF(CARDINALITY(secondary_targets), 0) AS load
  FROM set_base
  WHERE CARDINALITY(secondary_targets) > 0
),
all_contrib AS (
  SELECT muscle, load FROM primary_contrib
  UNION ALL
  SELECT muscle, load FROM secondary_contrib
),
totals AS (
  SELECT muscle, SUM(load) AS muscle_load FROM all_contrib GROUP BY muscle
)
SELECT
  muscle,
  ROUND((muscle_load / NULLIF(SUM(muscle_load) OVER (), 0) * 100)::numeric, 1) AS pct
FROM totals
ORDER BY pct DESC;
```

**Fallback:** If `primary_targets = '{}' AND secondary_targets = '{}'`, fall back to `exercise_definitions.muscle_group` as the sole primary target with 100% weight. If `muscle_group IS NULL`, the exercise contributes to an "Unknown" bucket.

**Data sources:** `workouts`, `workout_exercises`, `workout_sets`, `exercise_definitions` (primary_targets, secondary_targets, muscle_group)

**Edge cases:**

| Scenario                                            | Policy                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Both target arrays empty AND `muscle_group IS NULL` | Set loads are attributed to `"Unknown"` bucket                                        |
| `reps_only` exercise (no weight)                    | Weight = 0, contributes 0 to volume distribution; use set-count variant if volume = 0 |
| Exercise with only primary_targets                  | 100% of load goes to primary targets                                                  |

**UI-allowed claims:**

- Pie/donut chart with muscle group labels and percentages.
- "Your most trained muscle group: **[group]** (**N%**)"

**Not allowed:** "You're imbalanced" or any prescriptive claim without a defined threshold.

---

### B2 — Bodyweight Trend

| Field             | Value                      |
| ----------------- | -------------------------- |
| **Metric ID**     | `B2_BODYWEIGHT_TREND_KG`   |
| **Name**          | Bodyweight Trend           |
| **Scope**         | Body                       |
| **Returned unit** | kg per entry (time series) |
| **Rounding**      | 1 decimal place            |

**⚠️ CONTRACT GAP — PARTIAL DATA ONLY**

**Blocker:** The `bodyweight_entries` table is referenced in `delete_my_account()` (migration-017) but is **not defined** in any migration or `schema.sql`. No columns, constraints, or RLS policies exist in the repo.

**Fallback data source (MVP):** `checkin_photos.weight_kg`

`checkin_photos` has a `weight_kg numeric` column (nullable). Not all check-ins include weight. This produces a sparse, opt-in series — not a dedicated weight log.

**Fallback formula:**

```sql
SELECT
  (cp.taken_at AT TIME ZONE :user_tz)::date AS local_day,
  ROUND(cp.weight_kg::numeric, 1) AS weight_kg
FROM checkin_photos cp
WHERE cp.user_id = :uid
  AND cp.weight_kg IS NOT NULL
  AND (cp.taken_at AT TIME ZONE :user_tz)::date
      BETWEEN :period_start_local AND :period_end_local
ORDER BY local_day ASC;
```

**Required schema addition (do not implement in Phase 0):**

```sql
-- Proposed bodyweight_entries table
CREATE TABLE public.bodyweight_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  weight_kg   numeric NOT NULL CHECK (weight_kg > 0),
  notes       text,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'checkin')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

**MVP policy:** Display B2 only if at least 2 check-in photos with `weight_kg` exist in the window. Otherwise show "—".

**UI-allowed claims:**

- Weight trend sparkline (points only, no interpolation between gaps)
- "**N.N kg** (last check-in)"

---

### B3 — Check-in Cadence

| Field             | Value                                |
| ----------------- | ------------------------------------ |
| **Metric ID**     | `B3_CHECKIN_COUNT`                   |
| **Name**          | Check-in Cadence                     |
| **Scope**         | Body                                 |
| **Returned unit** | Integer count of check-ins in window |
| **Rounding**      | Whole number                         |

**Definition:** Number of distinct days on which a check-in photo was taken within the window.

**Formula:**

```sql
SELECT COUNT(DISTINCT (cp.taken_at AT TIME ZONE :user_tz)::date) AS b3_checkin_days
FROM checkin_photos cp
WHERE cp.user_id = :uid
  AND (cp.taken_at AT TIME ZONE :user_tz)::date
      BETWEEN :period_start_local AND :period_end_local;
```

**Data sources:** `checkin_photos` (user_id, taken_at)

**Edge cases:**

| Scenario                                     | Policy                            |
| -------------------------------------------- | --------------------------------- |
| Multiple poses on same day (front/side/back) | Count as 1 check-in day           |
| `weight_kg = NULL`                           | Check-in still counts for cadence |

**UI-allowed claims:**

- "**N** check-ins this period"
- "Last check-in: **N days ago**" (computed from max `taken_at`)

---

## Phase 0 Acceptance Checklist

| Metric | Formula     | Data source            | Filters | Edge cases | Units | UI claims |
| ------ | ----------- | ---------------------- | ------- | ---------- | ----- | --------- |
| C1     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| C2     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| C3     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| C4     | ⛔ Blocked  | ⛔ Schema gap          | —       | —          | —     | —         |
| S1     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| S2     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| S3     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| S4     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| K1     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| K2     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| K3     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| M1     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| M2     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| B1     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |
| B2     | ⚠️ Fallback | ⚠️ checkin_photos only | ✅      | ✅         | ✅    | ✅        |
| B3     | ✅          | ✅                     | ✅      | ✅         | ✅    | ✅        |

### Open contract gaps (must resolve before analytics Phase 1)

| Gap                                          | Blocking                                             | Proposed addition                                |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| `user_settings.timezone`                     | All timezone-bucketed metrics use hard-coded default | `timezone text NOT NULL DEFAULT 'Europe/Madrid'` |
| `user_settings.preferred_unit`               | Unit display uses metric default                     | `preferred_unit text NOT NULL DEFAULT 'metric'`  |
| `bodyweight_entries` table                   | B2 uses sparse fallback                              | Define table (schema proposed in B2 section)     |
| `workouts.plan_day_id` or `workouts.plan_id` | C4 completely blocked                                | Add FK to enable canonical adherence computation |
