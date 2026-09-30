# Progress Redesign Architecture

## Screen Hierarchy

- Progress tab route:
  - [`app/(app)/(tabs)/progress.tsx`](<app/(app)/(tabs)/progress.tsx>)
- Screen:
  - [`src/features/progress-v2/ProgressScreenV2.tsx`](src/features/progress-v2/ProgressScreenV2.tsx)
- Header:
  - [`src/features/progress-v2/components/ProgressHeader.tsx`](src/features/progress-v2/components/ProgressHeader.tsx)
- View model:
  - [`src/features/progress-v2/progressModel.ts`](src/features/progress-v2/progressModel.ts)
- Data orchestration:
  - [`src/features/progress-v2/useProgressDashboard.ts`](src/features/progress-v2/useProgressDashboard.ts)
- Wins:
  - [`src/features/progress-v2/winsModel.ts`](src/features/progress-v2/winsModel.ts)

## Data Flow

1. The screen owns range, lens, selected exercise, and units state.
2. `useProgressDashboard` fetches the existing analytics slices needed for the selected range:
   - progress overview
   - weekly workouts
   - weekly strength volume
   - exercise e1RM trend
   - muscle balance
   - weekly workout goal
3. `progressModel.ts` converts raw rows into a prepared dashboard model:
   - current vs previous period comparisons
   - hero status
   - wins inputs
   - overview / strength / body lens models
   - coaching insight
4. The screen renders only interpreted modules. Raw analytics rows do not render directly.

## Module Structure

- Hero:
  - status chip
  - workouts/week main number
  - previous-period delta
  - compact weekly trend
  - summary sentence
- Wins strip:
  - deterministic ordering
  - highest emotional reward first
- Overview:
  - show-up / consistency answer
  - weekly bars
  - minutes trained and goal-hit context
  - coaching card
- Strength:
  - selected-lift answer
  - line trend with PR markers
  - CTA to exercise history
- Body:
  - grouped region balance
  - current vs previous period
  - over/under-emphasis takeaway

## Chart Strategy

- Bars for weekly consistency
- Minimal spark bars for the hero trend
- Simple line chart for lift progression
- Horizontal balance bars for body-region distribution

No chart renders without supporting text that explains what it means.

## Insight Generation Strategy

Insights are deterministic and local to the feature.

- Hero status is driven by workouts/week versus weekly goal and previous-period delta
- Wins are driven by PR count, best-week improvement, goal-hit streak, and comeback logic
- Coaching insight combines consistency and balance context
- Strength takeaway is derived from trend direction, sparse history, and PR count
- Body takeaway is derived from leading and trailing region deltas

This keeps copy stable, testable, and independent of remote LLM or heuristic services.
