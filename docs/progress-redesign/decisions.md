# Progress Redesign Decisions

## Hero Redesign

Decision:

- Replace the equal-weight hero grid with one dominant consistency story.

Why:

- The old first viewport required users to parse several metrics before understanding how training was going.
- Workouts-per-week versus goal is understandable in seconds and matches the product request to lead with consistency.

## Overview / Strength / Body Structure

Decision:

- Use a shared lens selector instead of a long single-scroll dashboard.

Why:

- It reduces first-viewport overload.
- It lets each lens answer one question cleanly:
  - Overview: am I showing up?
  - Strength: am I getting stronger?
  - Body: am I training evenly?

## Metric Hierarchy

Decision:

- Prioritize consistency, streak/goal-hit context, one win, and one coaching note over raw totals.

Why:

- Totals like volume or PR count are useful, but they are secondary interpretation aids rather than the fastest summary signal.

## Wins Strip

Decision:

- Put wins directly under the hero and make it horizontally scrollable.

Why:

- Early reward increases clarity and motivation without forcing more height above the fold.
- A strip allows multiple milestone types without turning them into another dense card grid.

## Chart Simplification

Decision:

- Use bars, a single lift line chart, and grouped body-region bars only.

Why:

- These match the kinds of comparisons users already understand.
- The goal is faster comprehension, not richer chart novelty.

## Sparse Data Handling

Decision:

- Keep each module independently resilient.

Why:

- Progress data density differs by user and by lens.
- A user can still get a useful hero and overview even when strength or body data is sparse.
