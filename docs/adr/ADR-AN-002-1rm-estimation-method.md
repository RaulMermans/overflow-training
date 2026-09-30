# ADR-AN-002 — 1RM Estimation Method

| Field        | Value                           |
| ------------ | ------------------------------- |
| **ID**       | ADR-AN-002                      |
| **Status**   | Accepted                        |
| **Date**     | 2026-02-25                      |
| **Deciders** | Engineering, Product            |
| **Area**     | Analytics — Strength estimation |

---

## Context

Several strength metrics (S3, S4) require an estimated one-repetition maximum (e1RM) — the predicted maximum weight a user could lift for a single rep, derived from submaximal set data.

Multiple e1RM formulas exist in the literature. The project already ships two RPCs that compute e1RM:

- `get_progress_exercise_prs` — returns per-exercise all-time PR with `e1rm_kg`
- `get_progress_exercise_recent_occurrences` — returns recent e1RM history per exercise

Both RPCs use the **Epley formula** directly in SQL:

```sql
-- from migration-007-canonical-weight-started-at-progress-meta.sql
weight_kg * (1 + reps::numeric / 30.0)  AS e1rm_kg
```

A single formula must be adopted project-wide. Using different formulas in analytics vs. existing RPCs would produce inconsistent PR labels (the app could show a PR that doesn't match the analytics card).

---

## Decision

### 1. Formula: Epley

The canonical e1RM formula for this project is **Epley**:

```
e1rm_kg = weight_kg × (1 + reps / 30.0)
```

In SQL (using the canonical weight fallback):

```sql
COALESCE(ws.weight_kg, ws.weight) * (1 + ws.reps::numeric / 30.0)  AS e1rm_kg
```

**Always compute in kg.** Convert to the user's display unit only at the presentation layer (see `docs/analytics/units.md`).

### 2. Valid rep range: 1–36 (inclusive)

Only sets with `ws.reps BETWEEN 1 AND 36` are used for e1RM computation.

```sql
AND ws.reps BETWEEN 1 AND 36
AND COALESCE(ws.weight_kg, ws.weight) > 0
```

| Boundary                               | Rationale                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `reps < 1`                             | Zero or negative reps are invalid inputs                                                                     |
| `reps = 1`                             | Valid — e1RM = weight × 1.033; included                                                                      |
| `reps > 36`                            | Epley degrades above ~30 reps. At 37 reps, e1RM ≈ 2.23 × weight — wildly inflated. Cap at 36 to bound error. |
| `weight_kg = 0`                        | Bodyweight exercises with no added load produce e1RM = 0, which is meaningless                               |
| `weight_kg IS NULL AND weight IS NULL` | Cannot compute; exclude                                                                                      |

### 3. Aggregation: weekly best (not average)

For S3 trend (weekly e1RM series), take the **maximum** e1RM across all valid sets in the ISO week, per exercise:

```sql
MAX(e1rm_kg)  AS weekly_best_e1rm_kg
```

For S4 PR detection, use the all-time running maximum (window function, unbounded preceding).

**Rationale:** Best effort (peak set) is the standard for PR tracking. Averaging e1RM would undercount performance (warm-up sets drag the average down). Weekly best is the fairest comparison point across weeks.

### 4. Scope: strength modality only

e1RM is only computed for exercises where `ed.tracking_mode IN ('weight_reps', 'reps_only')`. Cardio and mobility exercises have no e1RM concept.

---

## Alternatives Considered

### Alt A — Brzycki formula

```
e1rm = weight / (1.0278 - 0.0278 × reps)
```

Produces a division-by-zero or negative result at `reps ≈ 37`. More accurate than Epley for reps 1–10 according to some studies, slightly less accurate at higher reps.

**Rejected:** Already diverges from the existing RPC implementation which uses Epley. Changing now would invalidate stored PR signals and create a discontinuity in trend charts.

### Alt B — Lombardi formula

```
e1rm = weight × reps^0.1
```

Simple power law; more stable at high reps.

**Rejected:** Not used anywhere in the current schema/RPC code. Unfamiliar to most gym-goers.

### Alt C — Lander formula

```
e1rm = (100 × weight) / (101.3 - 2.67123 × reps)
```

**Rejected:** Same reasons as Brzycki. Not already in use.

### Alt D — No cap on rep range

Allow any `reps > 0` without upper bound.

**Rejected:** At `reps = 100`, Epley yields `e1rm = weight × 4.33`. A user logging 3 sets of 100 bodyweight push-ups would appear to have a 433 kg bench press e1RM. The 36-rep cap bounds Epley's error to approximately +20% overestimation at the boundary.

### Alt E — Weekly average e1RM (not weekly best)

Average all valid-set e1RMs within the week.

**Rejected:** This undercounts performance (warm-up and fatigue sets have lower e1RM). The convention in strength tracking is to track peak performance per session/week. Weekly average would show a declining trend during a deload week even if the user set a peak PR mid-week.

---

## Consequences

- All e1RM computations anywhere in the codebase must use `weight * (1 + reps / 30.0)` with the 1–36 rep filter.
- The existing RPCs (`get_progress_exercise_prs`, `get_progress_exercise_recent_occurrences`) are already compliant.
- If a future formula change is needed (e.g., Brzycki becomes preferred), it must go through a new ADR; historical stored PRs would need recalculation.
- `reps_only` exercises (no weight, no `weight_kg`) cannot produce a meaningful e1RM even with `weight = 0`. These exercises are excluded from S3/S4 at the weight filter (`weight > 0`).

---

## Cross-references

- `docs/analytics/metrics.md` — S3 (e1RM trend), S4 (PR events) — formulas use Epley verbatim
- `supabase/migrations/migration-007-canonical-weight-started-at-progress-meta.sql` — original Epley implementation in RPCs
- `src/types/db.ts` — `get_progress_exercise_prs`, `get_progress_exercise_recent_occurrences` function signatures
- `docs/analytics/units.md` — weight unit display conversions (kg canonical, lb display)
