# ADR-AN-001 — Training Load Definition

| Field        | Value                        |
| ------------ | ---------------------------- |
| **ID**       | ADR-AN-001                   |
| **Status**   | Accepted                     |
| **Date**     | 2026-02-25                   |
| **Deciders** | Engineering, Product         |
| **Area**     | Analytics — Metric semantics |

---

## Context

The analytics system must summarize a user's training across modalities (strength, cardio, mobility). A common approach in fitness apps is to compute a single "training load" score that collapses all activity into one number (e.g., Training Stress Score, arbitrary unit load). The alternative is to present **per-modality cards** that surface volume separately for each modality.

Additionally, the schema uses two discriminator fields on `exercise_definitions`:

- `tracking_mode` — `'weight_reps' | 'reps_only' | 'time' | 'distance_time'`
- `category` — `'strength' | 'warmup' | 'stretch' | 'mobility' | 'yoga' | 'pilates' | 'cardio' | 'other'`

These two fields partially overlap and produce ambiguous cases (e.g., a `time`-tracked exercise can be either cardio or mobility). A classification rule must be defined.

The workout timestamp anchor also needs to be specified since `workouts.started_at` is nullable.

---

## Decision

### 1. Separate modality cards — no unified training load score

Training load is presented as **three independent metric groups**: Strength, Cardio, Mobility. There is no composite "total load" number in Phase 0 MVP.

**Rationale:**

- A unified score requires calibrated coefficients across modalities (e.g., how many kg of lifting equals 1 km of running). These coefficients are contentious, not scientifically settled, and differ by individual.
- Users with a primary sport are harmed by a composite that dilutes their main modality.
- A mixed workout containing both strength and cardio contributes separately to each modality's metrics — this is strictly additive and requires no cross-modal weighting.
- Separate cards require no new schema columns, no user preference for load coefficient, and no algorithm to maintain.

### 2. Modality classification rule (G7)

Classification is determined by `tracking_mode` (primary discriminator) with `category` used only to disambiguate the `'time'` tracking mode:

| Modality     | Classification rule                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| **Strength** | `ed.tracking_mode IN ('weight_reps', 'reps_only')`                                                           |
| **Cardio**   | `ed.tracking_mode = 'distance_time'` OR `(ed.tracking_mode = 'time' AND ed.category = 'cardio')`             |
| **Mobility** | `ed.tracking_mode = 'time' AND ed.category IN ('warmup', 'stretch', 'mobility', 'yoga', 'pilates', 'other')` |

An exercise with `tracking_mode = 'time'` and `category = 'strength'` is an invalid combination under current schema constraints. If encountered, it falls through to the Mobility bucket as a safe default (time-tracked = non-strength metric path). Log a warning.

**Rationale for `tracking_mode` as primary:** `tracking_mode` is enforced by `workout_sets` metric presence constraints (migration-010); `category` is a softer label. `distance_time` unambiguously means cardio. `time`-only exercises can be either yoga/stretch (mobility) or rowing/cycling (cardio), so `category` is the correct secondary discriminator for that case.

### 3. Mixed workout policy

A workout containing exercises from multiple modalities is a "mixed workout." Each exercise contributes to the metric group of its own modality. **No workout-level modality label is assigned.**

Example: a workout with Bench Press (`weight_reps`) + 5 km Run (`distance_time`) + Hip Flexor Stretch (`time/stretch`) contributes to S1/S2 volume, K1/K2 distance+duration, and M1 mobility time simultaneously.

### 4. Workout timestamp anchor (`workout_ts`)

The canonical timestamp for date-bucketing a workout into user-local days is:

```sql
COALESCE(w.started_at, w.ended_at, w.created_at)
```

Abbreviated `workout_ts` in all metric formulas.

**Priority rationale:**

- `started_at` — most accurate; set when the user taps "Start Workout"
- `ended_at` — fallback; set when the user taps "Finish"; reflects actual completion time
- `created_at` — last resort for legacy rows created before `started_at` was tracked; always non-null

A workout spanning user-local midnight is assigned to the day of `workout_ts` (i.e., the day it _started_, not ended).

---

## Alternatives Considered

### Alt A — Unified training load score (e.g., Arbitrary Load Units)

Assign each exercise type a metabolic equivalent coefficient (e.g., 1 set of 10 reps = N load units; 1 km run = M load units) and sum across modalities.

**Rejected:** Requires hardcoded cross-modal coefficients with no scientific consensus. Creates maintenance burden when exercise library expands. Obscures modality-specific trends the user cares about.

### Alt B — `category` as primary discriminator

Use `category` alone to classify exercises, ignoring `tracking_mode`.

**Rejected:** `category` is not enforced by DB constraints in the same way as `tracking_mode`. `exercise_definitions` may have `category = 'strength'` but `tracking_mode = 'time'` (invalid but possible until migration-010 triggers fire). `tracking_mode` is the authoritative field for determining which set-level metrics are present.

### Alt C — Workout-level modality tag

Add a `modality` column to `workouts` that the app sets at session-start.

**Rejected:** Requires schema change (outside Phase 0 scope). Creates staleness risk if the user adds cross-modality exercises mid-session. Exercise-level classification is more accurate and requires no new data.

---

## Consequences

- All metric formulas use the G7 classification table verbatim (see `docs/analytics/metrics.md §G7`).
- No cross-modal aggregation queries are needed in Phase 0.
- If a future "Training Load Score" metric (e.g., H1) is added, it must reference this ADR and document its coefficient table explicitly.
- The `workout_ts` anchor must be applied consistently; any metric that omits the `COALESCE` pattern is a bug.

---

## Cross-references

- `docs/analytics/metrics.md` — G7 classification table, all metric formulas
- `docs/analytics/time_windows.md` — period window definitions
- `supabase/migrations/migration-008-hybrid-exercises-and-tracking-modes.sql` — tracking_mode and category values
- `supabase/migrations/migration-010-data-hygiene-contract-hardening.sql` — metric presence constraints
