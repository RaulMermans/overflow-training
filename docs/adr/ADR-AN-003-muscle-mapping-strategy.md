# ADR-AN-003 — Muscle Mapping Strategy

| Field        | Value                                |
| ------------ | ------------------------------------ |
| **ID**       | ADR-AN-003                           |
| **Status**   | Accepted                             |
| **Date**     | 2026-02-25                           |
| **Deciders** | Engineering, Product                 |
| **Area**     | Analytics — Muscle group attribution |

---

## Context

Metric B1 (Muscle Group Balance) requires distributing training volume across muscle groups to show a percentage breakdown (e.g., "Chest 22%, Back 18%, Legs 35%…").

`exercise_definitions` exposes three fields for this purpose:

| Field               | Type           | Description                               |
| ------------------- | -------------- | ----------------------------------------- |
| `primary_targets`   | `text[]`       | Muscle groups primarily worked            |
| `secondary_targets` | `text[]`       | Muscle groups secondarily worked          |
| `muscle_group`      | `text \| null` | Legacy single-group label (older entries) |

These are populated by `migrations/migration-007-exercise-targets-and-types.sql` and the exercise library expansions (004, 013).

Three design questions must be answered:

1. **Attribution weight** — how to split credit between primary and secondary targets
2. **Load unit** — should muscle group share be based on set count or volume (weight × reps)?
3. **Fallback** — what to do when both `primary_targets` and `secondary_targets` are empty arrays

---

## Decision

### 1. Attribution: 70% primary / 30% secondary, split equally within each tier

For a given set, the volume (`weight_kg × reps`) is attributed to muscle groups as:

```
primary contribution per muscle  = 0.70 × volume / COUNT(primary_targets)
secondary contribution per muscle = 0.30 × volume / COUNT(secondary_targets)
```

Implemented in SQL via `UNNEST` + per-array `CARDINALITY` normalization (see `docs/analytics/metrics.md §B1`).

If an exercise has **no secondary targets**, 100% of load goes to primary targets (the 30% secondary share is simply absent — it is not redistributed to primaries):

```sql
-- primary-only exercise: all load attributed to primary targets
primary contribution per muscle = volume / CARDINALITY(primary_targets)
-- (i.e., no 0.70 discount — load budget for secondaries goes unattributed)
```

> **Exception:** When no primary targets exist but secondary targets do, treat secondary targets as primary (100% split equally, no discount). This should not occur in a well-curated library but is a safe defensive rule.

**Rationale for 70/30:** Reflects the empirical convention that compound lifts (e.g., bench press) predominantly stress the primary mover (chest) while synergists (triceps, anterior deltoid) receive substantial but lesser stimulus. The 70/30 split is simple, defensible, and produces visually intuitive pie charts. No user-configurable weighting is needed for MVP.

### 2. Load unit: volume-based (weight × reps), not set-count-based

Muscle group shares are computed from `volume = COALESCE(weight_kg, weight) × reps`, not from raw set counts.

**Rationale:** A single set of Barbell Squat at 100 kg × 5 reps should contribute more to quad/glute load than a set of Bodyweight Lunge at 0 kg × 10 reps. Set-count weighting treats them equally, which misrepresents training stimulus. Volume is the standard proxy for mechanical tension in strength science.

**Edge case — zero-weight exercises (`reps_only` with `weight = 0`):** These contribute 0 volume and therefore 0 to the muscle group distribution. If the user trains primarily with bodyweight movements, B1 will undercount their true muscle stimulus. This is a known limitation acceptable for MVP. A set-count fallback column may be added as a future metric variant.

### 3. Fallback: `muscle_group` as sole primary target

If `primary_targets = '{}'` AND `secondary_targets = '{}'`, fall back to `exercise_definitions.muscle_group` as a single primary target with 100% of the volume credited to it.

```sql
-- In application logic or a computed CTE:
CASE
  WHEN CARDINALITY(primary_targets) > 0 OR CARDINALITY(secondary_targets) > 0
    THEN use 70/30 split from arrays
  WHEN muscle_group IS NOT NULL
    THEN attribute 100% of volume to muscle_group
  ELSE
    attribute to 'Unknown'
END
```

If `muscle_group IS NULL` and both arrays are empty, the exercise contributes to an **"Unknown"** bucket in the distribution. The UI should display this bucket at the bottom of the chart.

**Rationale:** `muscle_group` is a legacy field present on older exercise definitions that were seeded before `primary_targets` was added (migration-007). Discarding it would produce silent attribution gaps for those exercises. The fallback preserves continuity without requiring a data migration.

---

## Alternatives Considered

### Alt A — Primary targets only (ignore secondary)

Attribute 100% of volume to `primary_targets`, split equally. Ignore `secondary_targets`.

**Rejected:** Systematically underrepresents synergist muscles. Bench Press would show 0% for triceps and anterior deltoid. Users who do no dedicated tricep exercises would see 0 for triceps even though they've trained them heavily through compound pressing.

### Alt B — Equal split across all targets (primary + secondary combined)

Combine all targets into one pool and split volume equally.

```
per_muscle = volume / (COUNT(primary) + COUNT(secondary))
```

**Rejected:** Overstates secondary muscle contribution. On a Deadlift with 5 primary muscles and 6 secondary muscles, each secondary muscle gets ~9% credit vs. each primary's ~9% — treating glutes and calves identically. This produces a flat, misleading distribution.

### Alt C — Set-count-based attribution

Count sets per muscle group rather than volume.

**Rejected:** See §2 above. A 5-rep max set and a 20-rep backoff set receive the same credit, which misrepresents relative stimulus.

### Alt D — User-configurable weights (primary%, secondary%)

Expose a setting letting users choose their own primary/secondary weight split.

**Rejected:** Adds UX complexity with no clear user benefit at MVP scale. The 70/30 split is a reasonable universal default. Revisit in Phase 1 if power users request it.

### Alt E — No fallback; discard exercises with empty target arrays

Skip exercises without `primary_targets` in B1 entirely.

**Rejected:** Older system exercises seeded before migration-007 have empty arrays but valid `muscle_group` values. Silently dropping them would make B1 inaccurate for users who frequently perform those exercises.

---

## Consequences

- The B1 SQL formula in `docs/analytics/metrics.md` is the canonical implementation reference. Any future B1-adjacent metric must match this attribution logic or cite a new ADR.
- Zero-weight (`reps_only`) exercises correctly contribute 0 volume to B1. If this becomes a product problem (e.g., calisthenics-first users), a set-count variant metric (`B1_MUSCLE_DIST_SETS_PCT`) can be added without modifying this decision.
- The "Unknown" bucket must be surfaced in the UI when non-zero, not silently suppressed. Suppressing it would cause the pie chart percentages to not sum to 100%.
- When the exercise library is updated, `primary_targets` and `secondary_targets` must be populated for all new entries. Empty arrays are a data quality issue, not a feature.

---

## Cross-references

- `docs/analytics/metrics.md §B1` — full SQL implementation of muscle group distribution
- `supabase/migrations/migration-007-exercise-targets-and-types.sql` — schema addition of `primary_targets`, `secondary_targets`, `exercise_type` and initial backfills
- `supabase/migrations/migration-004-expand-exercise-library.sql` — exercise library expansion (210+ entries)
- `supabase/migrations/migration-013-exercise-library-v1.sql` — library reconciliation
- `src/types/db.ts` — `exercise_definitions` Row type (`primary_targets: string[]`, `secondary_targets: string[]`, `muscle_group: string | null`)
