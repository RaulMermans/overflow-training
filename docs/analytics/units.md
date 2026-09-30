# Analytics Unit Normalization

> **Status:** Phase 0 spec — locked for MVP.
> All computation happens in canonical units. Display conversion happens only at the UI layer.

---

## 1. Canonical Storage Units

| Domain          | Canonical column                | Type            | Notes                                                                   |
| --------------- | ------------------------------- | --------------- | ----------------------------------------------------------------------- |
| Weight          | `workout_sets.weight_kg`        | `numeric(12,6)` | Canonical kg value. Always prefer over `weight`.                        |
| Weight (legacy) | `workout_sets.weight`           | `numeric`       | Legacy display-unit value. May be lbs or kg depending on when recorded. |
| Duration        | `workout_sets.duration_seconds` | `integer`       | Integer seconds. Always non-negative.                                   |
| Distance        | `workout_sets.distance_m`       | `numeric`       | Metres. Always non-negative.                                            |
| Body weight     | `checkin_photos.weight_kg`      | `numeric`       | Kilograms. Sparse — not every check-in includes weight.                 |

### 1.1 Weight canonical flag

`workout_sets.is_weight_canonical` (boolean, default `true`):

| Value   | Meaning                                                                             |
| ------- | ----------------------------------------------------------------------------------- |
| `true`  | `weight_kg` was entered directly or was derived from a canonical kg input.          |
| `false` | `weight` was entered in a display unit (lbs) and `weight_kg` was computed at write. |
| `null`  | Legacy row; treat as `true` for computation purposes.                               |

### 1.2 Computation rule for weight

Always compute analytics from `weight_kg`:

```sql
COALESCE(ws.weight_kg, ws.weight)
```

- `weight_kg` is non-null for all rows written since migration-007.
- `weight` fallback applies only to legacy rows where `weight_kg` IS NULL. In those cases, treat `weight` as kilograms (best-effort; note the risk below).

**Mixed-unit history risk:** Pre-migration-007 rows may have `weight` stored in lbs with `weight_kg = NULL`. If such rows exist, the `COALESCE(weight_kg, weight)` path will treat lbs as kg, inflating volume. This cannot be corrected without per-row unit metadata. Document as known limitation; flag in UI if data spans the migration date.

---

## 2. Unit Preference

### 2.1 Contract Gap — no `preferred_unit` in `user_settings`

`user_settings` currently contains only:

- `user_id`
- `weekly_workouts_goal`
- `created_at` / `updated_at`

There is **no `preferred_unit` column** (it was dropped from `profiles` in migration-022 and was not added to `user_settings`).

**TODO:** Add `preferred_unit text NOT NULL DEFAULT 'metric' CHECK (preferred_unit IN ('metric', 'imperial'))` to `user_settings`.

### 2.2 MVP default

Until `preferred_unit` exists in `user_settings`, all display conversions use **metric** as the default:

| Metric domain | MVP display unit         |
| ------------- | ------------------------ |
| Weight        | kg                       |
| Distance      | km                       |
| Duration      | minutes (MM:SS or X min) |
| Body weight   | kg                       |

---

## 3. Display Conversion Rules

All conversions are applied **only at display time**. Analytics storage and computation always use canonical units.

### 3.1 Weight

| User preference | Conversion              | Formula              |
| --------------- | ----------------------- | -------------------- |
| `metric`        | kg → kg (no conversion) | `value_kg`           |
| `imperial`      | kg → lbs                | `value_kg * 2.20462` |

Rounding: **1 decimal place** (e.g., `102.5 kg`, `225.9 lbs`).

### 3.2 Distance

| User preference | Conversion | Formula              |
| --------------- | ---------- | -------------------- |
| `metric`        | m → km     | `value_m / 1000.0`   |
| `imperial`      | m → miles  | `value_m / 1609.344` |

Rounding: **2 decimal places** (e.g., `5.23 km`, `3.25 mi`).

### 3.3 Duration

Duration is always displayed in time format regardless of unit preference.

| Display context | Format      | Example      |
| --------------- | ----------- | ------------ |
| Per-set         | `MM:SS`     | `04:30`      |
| Summary totals  | `X h Y min` | `1 h 23 min` |
| Short totals    | `X min`     | `45 min`     |

Rounding: truncate seconds for summary display; do not round up.

### 3.4 Pace (K3)

Always displayed as `min/km` (metric) or `min/mi` (imperial):

```
pace_min_per_km = (total_duration_seconds / 60.0) / (total_distance_m / 1000.0)
```

Display as `MM:SS /km` (e.g., `5:12 /km`).

For imperial: `pace_min_per_mi = pace_min_per_km * 1.60934`.

### 3.5 e1RM

Always computed in kg internally. Displayed in user's weight unit.

Rounding: **1 decimal place** (e.g., `142.5 kg`, `314.2 lbs`).

### 3.6 Volume (S1)

Computed in kg. Displayed in user's weight unit.

Rounding: **1 decimal place** (e.g., `2,450.0 kg`, `5,401.3 lbs`).

---

## 4. Rounding Summary Table

| Metric            | Compute unit  | Display rounding   |
| ----------------- | ------------- | ------------------ |
| Volume (S1)       | kg            | 1 decimal          |
| e1RM (S3)         | kg            | 1 decimal          |
| Body weight (B2)  | kg            | 1 decimal          |
| Distance (K1)     | m → km/mi     | 2 decimals         |
| Pace (K3)         | s/m → min/km  | MM:SS format       |
| Duration (K2, M1) | seconds → min | 1 decimal (totals) |
| Counts (C1, S2…)  | integer       | whole number       |
| % delta           | —             | 1 decimal          |

---

## 5. References

- Weight canonical flag: `supabase/migrations/migration-007-canonical-weight-started-at-progress-meta.sql`
- `preferred_unit` history: `supabase/migrations/migration-022-settings-canonicalization.sql` (dropped from `profiles`)
- `user_settings` current schema: `supabase/schema.sql`
