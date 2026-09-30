# Analytics Time Windows & Period Comparison

> **Status:** Phase 0 spec — locked for MVP. Changes require updating all metric formulas and this doc together.

---

## 1. Time Window Definitions

| ID   | Label    | Length        | Definition                                                  |
| ---- | -------- | ------------- | ----------------------------------------------------------- |
| W28  | 28 days  | 28 cal. days  | **Default.** Rolling: `[today - 27 days, today]` inclusive. |
| W3M  | 3 months | 91 cal. days  | Rolling: `[today - 90 days, today]` inclusive.              |
| W1Y  | 1 year   | 365 cal. days | Rolling: `[today - 364 days, today]` inclusive.             |
| WALL | All time | unbounded     | From user's first completed workout through today.          |

**Chosen default: W28 (rolling 28 days).**

Rationale: 28 days = exactly 4 ISO weeks, making weekly averages whole numbers and keeping the comparison period symmetric. ISO-week alignment is preserved when the current day is Monday.

---

## 2. Week Definition

**ISO week: Monday–Sunday.**

Week number is derived from the user-local date (see §3). Week 1 of a year is the week containing the first Thursday.

```sql
-- Derive ISO week from a UTC timestamp in user local time
DATE_TRUNC('week', (w.started_at AT TIME ZONE :user_tz))::date AS iso_week_monday
```

---

## 3. Timezone Policy

| Layer          | Rule                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| **Storage**    | All timestamps stored as `timestamptz` (UTC) in the database.                     |
| **Bucketing**  | Convert to user-local timezone at query time using `AT TIME ZONE :user_tz`.       |
| **Default TZ** | `Europe/Madrid` when `user_settings.timezone` is absent (see Contract Gap below). |
| **DST**        | Postgres handles DST transitions automatically via the IANA tz database.          |

### Contract Gap — `user_settings.timezone`

`user_settings` currently has **no `timezone` column** (schema confirmed as of migration-026). All timezone-aware queries must use `Europe/Madrid` as a hard-coded default until this field is added.

**TODO:** Add `timezone text NOT NULL DEFAULT 'Europe/Madrid'` to `user_settings`. Until then, bucketing is approximate for users outside Spain.

### Bucketing example (Europe/Madrid, W28)

```sql
-- Current period: rolling 28 days
WITH tz AS (SELECT 'Europe/Madrid' AS val)
SELECT
  DATE_TRUNC('day', (w.started_at AT TIME ZONE (SELECT val FROM tz)))::date AS local_day,
  COUNT(*) AS workouts
FROM workouts w
WHERE w.user_id = :uid
  AND w.status = 'completed'
  AND (w.started_at AT TIME ZONE (SELECT val FROM tz))::date
      BETWEEN (CURRENT_DATE AT TIME ZONE (SELECT val FROM tz)) - INTERVAL '27 days'
      AND     (CURRENT_DATE AT TIME ZONE (SELECT val FROM tz))
GROUP BY 1
ORDER BY 1;
```

---

## 4. Period Comparison

For every time window there is a **comparison period** of equal length immediately preceding the current period.

| Window | Current period        | Comparison period            |
| ------ | --------------------- | ---------------------------- |
| W28    | `[today-27d, today]`  | `[today-55d, today-28d]`     |
| W3M    | `[today-90d, today]`  | `[today-181d, today-91d]`    |
| W1Y    | `[today-364d, today]` | `[today-729d, today-365d]`   |
| WALL   | all time              | **No comparison.** Show `—`. |

Both boundaries are computed in user-local date space, then converted to UTC for the query filter.

```sql
-- Current period start/end (UTC) for W28, tz = Europe/Madrid
:period_start_utc = (CURRENT_DATE - INTERVAL '27 days')::timestamptz AT TIME ZONE 'Europe/Madrid'
:period_end_utc   = (CURRENT_DATE + INTERVAL '1 day')::timestamptz   AT TIME ZONE 'Europe/Madrid'

-- Prior period
:prior_start_utc  = (CURRENT_DATE - INTERVAL '55 days')::timestamptz AT TIME ZONE 'Europe/Madrid'
:prior_end_utc    = (CURRENT_DATE - INTERVAL '27 days')::timestamptz AT TIME ZONE 'Europe/Madrid'
```

---

## 5. Delta Rules

### 5.1 Absolute delta

```
absolute_delta = current_value - prior_value
```

### 5.2 Percent delta

```
percent_delta = ((current_value - prior_value) / prior_value) * 100
```

Rounded to **1 decimal place** before display.

### 5.3 Baseline = 0 handling

| Condition                   | Display                              | Percent delta |
| --------------------------- | ------------------------------------ | ------------- |
| `prior = 0`, `current > 0`  | Show current value + **"New"** badge | Not shown     |
| `prior = 0`, `current = 0`  | Show `—`                             | Not shown     |
| `prior > 0`, `current = 0`  | Show `0` + `-100%`                   | `-100%`       |
| `prior > 0`, `current > 0`  | Normal delta + percent               | Calculated    |
| WALL window (no comparison) | Show `—` in delta column             | Not shown     |

### 5.4 Per-metric delta format

| Metric group                 | Delta format                       | Example            |
| ---------------------------- | ---------------------------------- | ------------------ |
| Counts (C1, C2, S2, M2, B3)  | `+N` / `-N` absolute, then `(+X%)` | `+3 (+25%)`        |
| Volume / distance / duration | absolute in display unit + percent | `+12.5 kg (+8.3%)` |
| Ratios / rates (C4, K3)      | percent delta only                 | `+5%`              |
| Streak (C3)                  | absolute days only, no percent     | `+4 days`          |
| e1RM (S3)                    | `+N kg (+X%)` per exercise         | `+2.5 kg (+3.1%)`  |

### 5.5 Rounding rules for display

| Value type            | Rule                     |
| --------------------- | ------------------------ |
| Integer counts        | Round to nearest integer |
| Weights / volume (kg) | 1 decimal place          |
| Distance (km)         | 2 decimal places         |
| Duration (min)        | 1 decimal place          |
| Pace (min/km)         | Display as `MM:SS`       |
| Percent delta         | 1 decimal place          |
| e1RM (kg)             | 1 decimal place          |

---

## 6. Workout Date Anchor

The canonical date of a workout is derived as:

```sql
COALESCE(w.started_at, w.ended_at, w.created_at)
```

This timestamptz value is then bucketed into user-local days/weeks via `AT TIME ZONE :user_tz`.

**Workouts spanning midnight:** assigned to the user-local day of `started_at`. No splitting across days.

---

## 7. Excluded Data

All time-windowed queries apply these global filters (see also `metrics.md §Global conventions`):

- `w.status = 'completed'` — exclude in-progress workouts.
- `ws.is_completed IS NOT FALSE` — include sets where `is_completed` is `TRUE` or `NULL` (legacy rows pre-schema-011); exclude explicit `FALSE`.
- `ed.deleted_at IS NULL` — exclude soft-deleted exercise definitions.
