# Progress Redesign

## Overview

This doc set is the source of truth for the coaching-oriented Progress redesign shipped on top of `ENABLE_PROGRESS_V2`.

The redesign changes Progress from a dense analytics dashboard into a faster training briefing that answers:

1. How am I doing?
2. What changed?
3. Why did it change?
4. What should I do next?

## Design Goals

- Lead with one dominant consistency story instead of equal-weight metric cards
- Split the screen into `Overview`, `Strength`, and `Body`
- Make every chart self-explanatory with a headline, main number, comparison, visual, and takeaway
- Keep sparse-data and empty states motivating instead of broken
- Preserve existing analytics infrastructure and drilldowns where possible

## Implemented Structure

- Shared range selector: `4W / 3M / 6M / 1Y`
- Shared lens selector: `Overview / Strength / Body`
- Hero story based on workouts-per-week versus `weekly_workouts_goal`
- Wins strip directly below the hero
- Overview lens:
  - consistency module
  - weekly bars
  - minutes trained / goal-hit context
  - coaching insight card
- Strength lens:
  - lift picker
  - current best e1RM
  - previous-period delta
  - simple line chart with PR markers
  - CTA into exercise history
- Body lens:
  - grouped training balance by body region
  - current vs previous period comparison
  - plain-language takeaway

## Current State

- Implemented in [`src/features/progress-v2/ProgressScreenV2.tsx`](src/features/progress-v2/ProgressScreenV2.tsx)
- View-model logic lives in [`src/features/progress-v2/progressModel.ts`](src/features/progress-v2/progressModel.ts) and [`src/features/progress-v2/useProgressDashboard.ts`](src/features/progress-v2/useProgressDashboard.ts)
- Existing analytics tables and hooks are reused; no schema change was introduced for this redesign

## Older Progress v2 Docs

The pre-redesign release docs still exist for historical context:

- [`docs/progress_v2_qa_manual.md`](docs/progress_v2_qa_manual.md)
- [`docs/progress_v2_release_checklist.md`](docs/progress_v2_release_checklist.md)
- [`docs/analytics/progress_v2_expected_outputs.md`](docs/analytics/progress_v2_expected_outputs.md)

Use this folder for the current UI direction, and the older docs for the original v2 rollout history.
