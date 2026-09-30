# Calendar Redesign Overview (PR0–PR5.1)

This document is the quick context reference for Calendar workstreams, test contracts, and rollout safety.

## Scope Snapshot

Calendar now supports:

- Stable E2E selectors for month navigation, day selection, day sheet actions, and plan actions.
- Deterministic custom month navigation with a single visible month-control affordance.
- One day-detail modal surface with in-place mode switching (`day` <-> `pickRoutine`).
- Routine picker ranking sections (pinned, recent, all) with debounced search.
- Planned start cohesion (`plan -> start -> workout-session`) with regression flow coverage.
- Optional agenda mode and optional consistency strip behind independent feature flags.

## PR Contracts (PR0–PR5.1)

- **PR0 — Baseline & Safety Net**
  - Stable Calendar selectors for month navigation, day selection, and day sheet actions.
  - Golden Flow 1 hardened to selector-based day targeting.
- **PR1 — Deterministic Month Navigation**
  - Single visible month navigation affordance (custom arrows).
  - Programmatic month shift with `scrollToMonth` and safe fallback behavior.
- **PR2 — Single Day Detail Surface**
  - One modal with mode switching (`day` and `pickRoutine`), no modal ping-pong.
- **PR3 — Routine Picker v2**
  - Pinned/recent/all section model with debounced search and deterministic ordering.
- **PR4 — Plan Start Cohesion**
  - Planned day start flows to workout session reliably; plan remains unless user clears.
  - `calendar_plan_start` analytics contract on start tap (`source`, `date_key`, `routine_id`).
- **PR5 — Optional Innovations Behind Flags**
  - Agenda mode and consistency strip are optional and independently gated.
- **PR5.1 — Hardening Closeout**
  - Deterministic timebase for consistency summary via injected `now`.
  - Centralized consistency load/show helper gates.

## Feature Flags

Defined in `src/config/featureFlags.ts`:

- `ENABLE_CALENDAR_AGENDA`
  - `false`: month-only experience (default/safe baseline)
  - `true`: month/agenda toggle enabled
- `ENABLE_CALENDAR_CONSISTENCY_STRIP`
  - `false`: no consistency strip (default)
  - `true`: consistency strip may render in agenda view

Consistency load/render decisions are centralized in:

- `src/features/calendar/consistencySummary.ts`
  - `shouldLoadCalendarConsistency(...)`
  - `shouldShowCalendarConsistencyStrip(...)`

### Flag Matrix

| `ENABLE_CALENDAR_AGENDA` | `ENABLE_CALENDAR_CONSISTENCY_STRIP` | Agenda Toggle/Mode  | Consistency Strip      | Weekly Goal Fetch (`loadWeeklyWorkoutsGoal`) |
| ------------------------ | ----------------------------------- | ------------------- | ---------------------- | -------------------------------------------- |
| `false`                  | `false`                             | hidden (month only) | hidden                 | no                                           |
| `true`                   | `false`                             | enabled             | hidden                 | no                                           |
| `true`                   | `true`                              | enabled             | visible in agenda view | yes                                          |
| `false`                  | `true`                              | hidden (month only) | hidden                 | no                                           |

## Core UI State Model

Calendar tab (`app/(app)/(tabs)/calendar.tsx`):

- Month state:
  - `currentMonthKey`, `visibleMonthKey`
  - `calendarRef.scrollToMonth` with remount fallback
- View state:
  - `calendarView = 'month' | 'agenda'`
- Sheet state:
  - `SheetState` from `src/features/calendar/sheetStateMachine.ts`
  - Single modal with mode switch (`day` / `pickRoutine`)

## Agenda Window Contract

Agenda windows are inclusive and deterministic:

- Upcoming: `today .. today+13` (14 days)
- Recent: `today-14 .. today-1` (14 days)

Windows are intentionally non-overlapping so each date appears in only one section.

Helper:

- `buildAgendaWindowKeys(todayDateKey, 14)`

## Consistency Strip Contract

Computed via:

- `buildCalendarConsistencySummary({ workouts, weeklyGoal, now })`

Output:

- `sessionsThisWeek`
- `currentStreak`
- `weeklyGoal`

Sources:

- `countSessionsThisWeek` (Today compute module)
- `computeStreakAtDate` (Progress compute module)

## E2E Contracts

Stable selectors:

- `calendar:monthPrev`
- `calendar:monthNext`
- `calendar:monthLabel`
- `calendar:day:<YYYY-MM-DD>`
- `calendar:daySheet`
- `calendar:routinePicker`
- `calendar:routineRow:<routineId>`
- `calendar:addPlanButton`
- `calendar:startWorkoutButton`
- `calendar:clearPlanButton`
- `workoutSession:root`

Maestro guardrail flows:

- `golden-login-routine-schedule-workout-progress.yaml`
- `calendar-month-navigation-determinism.yaml`
- `calendar-day-detail-single-surface.yaml`
- `e2e/maestro/calendar_start_planned_workout.yaml`
- `calendar-plan-start-cohesion.yaml`

Workflow orchestration:

- `.github/workflows/e2e.yml`

### E2E Order + Env Contracts

Flow order in CI:

1. `golden-login-routine-schedule-workout-progress.yaml` (Flow 1)
2. `calendar-month-navigation-determinism.yaml`
3. `calendar-day-detail-single-surface.yaml`
4. `e2e/maestro/calendar_start_planned_workout.yaml`
5. `calendar-plan-start-cohesion.yaml`
6. `golden-offline-workout-sync.yaml` (Flow 2)
7. `golden-logout-login-state-integrity.yaml` (Flow 3)

Core env vars:

| Variable               | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `E2E_EMAIL`            | E2E account email created per run                           |
| `E2E_PASSWORD`         | E2E account password                                        |
| `E2E_DATE`             | Day selector key (`YYYY-MM-DD`) for calendar-targeted flows |
| `E2E_MONTH_START`      | Baseline month-start key (`YYYY-MM-01`)                     |
| `E2E_NEXT_MONTH_START` | Next month-start key (`YYYY-MM-01`)                         |

Date values are intentionally staggered across flows in CI to reduce collisions.

PR opt-in flow gate:

- Trigger: `pull_request` with label `e2e-calendar-start`
- Restriction: non-fork PRs only
- Job: `e2e-pr-calendar-start` runs only `e2e/maestro/calendar_start_planned_workout.yaml`

## Test Map

Key regression suites:

- `__tests__/calendar-testid-contract.test.ts`
- `__tests__/calendar-month-navigation.test.ts`
- `__tests__/calendar-sheet-state-machine.test.ts`
- `__tests__/routine-picker-model.test.ts`
- `__tests__/calendar-plan-start-analytics.test.ts`
- `__tests__/calendar-consistency-summary.test.ts`

## Rollback Guidance

Fast rollback (no code revert) for optional innovations:

1. Set `ENABLE_CALENDAR_AGENDA=false`
2. Set `ENABLE_CALENDAR_CONSISTENCY_STRIP=false`
3. Ship OTA/update

For deeper rollback, revert only PR5+ files and keep PR0–PR4 guardrails intact.

PR5.1-specific rollback:

1. Revert deterministic `now` usage callsites in consistency summary if needed.
2. Revert helper-gated weekly-goal loading and strip visibility wiring.
3. Keep flags off as immediate runtime safety switch.
