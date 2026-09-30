# E2E Golden Flows

End-to-end tests that lock the core product contract: auth, routine creation, scheduling, workout execution, sync, and state integrity.

## Overview

| Flow                 | Purpose                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Golden Flow 1**    | login → create routine → schedule day → start workout → finish → progress updates                              |
| **Month Nav Flow**   | custom calendar month arrows move visible month forward and backward deterministically                         |
| **Day Detail Flow**  | Add plan stays in one sheet surface and routine selection returns immediately to day detail                    |
| **Start Entry Flow** | planned day start entry reaches workout session root with selector-only checks                                 |
| **Plan Start Flow**  | planned day start follows plan → start → session and returns with completed activity + planned actions intact  |
| **Golden Flow 2**    | offline workout → reconnect → sync success (iOS Simulator: sync validation only; real offline requires device) |
| **Golden Flow 3**    | logout → login again → no corrupted local state                                                                |

## Running Locally

### Prerequisites

- macOS with Xcode and iOS Simulator
- [Maestro CLI](https://maestro.mobile.dev/docs/getting-started/installation)
- Dedicated E2E Supabase project (never run against production)

### 1. Create E2E Test User

```bash
SUPABASE_URL_E2E=https://YOUR_E2E_PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY_E2E=eyJ... \
E2E_TEST_PASSWORD='YourSecurePassword' \
npm run e2e:create-user
```

Output (JSON): `{ "email": "e2e+YYYYMMDD-xxxx@example.com", "password": "...", "userId": "..." }`

### 2. Build and Launch App (E2E Supabase)

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_E2E_PROJECT.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
npx expo run:ios
```

### 3. Run Maestro Flows

```bash
maestro test maestro/flows/golden-login-routine-schedule-workout-progress.yaml \
  --env E2E_EMAIL="e2e+YYYYMMDD-xxxx@example.com" \
  --env E2E_PASSWORD="YourSecurePassword" \
  --env E2E_DATE="$(xcrun simctl spawn booted date +%Y-%m-15)"
```

```bash
maestro test maestro/flows/calendar-month-navigation-determinism.yaml \
  --env E2E_EMAIL="e2e+YYYYMMDD-xxxx@example.com" \
  --env E2E_PASSWORD="YourSecurePassword" \
  --env E2E_MONTH_START="$(xcrun simctl spawn booted date +%Y-%m-01)" \
  --env E2E_NEXT_MONTH_START="$(xcrun simctl spawn booted date -v+1m +%Y-%m-01)"
```

```bash
maestro test maestro/flows/calendar-day-detail-single-surface.yaml \
  --env E2E_EMAIL="e2e+YYYYMMDD-xxxx@example.com" \
  --env E2E_PASSWORD="YourSecurePassword" \
  --env E2E_DATE="$(xcrun simctl spawn booted date -v+1d +%F)"
```

Run this after Golden Flow 1 so `E2E Golden Routine` exists.

```bash
maestro test e2e/maestro/calendar_start_planned_workout.yaml \
  --env E2E_EMAIL="e2e+YYYYMMDD-xxxx@example.com" \
  --env E2E_PASSWORD="YourSecurePassword" \
  --env E2E_DATE="$(xcrun simctl spawn booted date -v+2d +%F)"
```

Run this after Golden Flow 1 so `E2E Golden Routine` exists.

```bash
maestro test maestro/flows/calendar-plan-start-cohesion.yaml \
  --env E2E_EMAIL="e2e+YYYYMMDD-xxxx@example.com" \
  --env E2E_PASSWORD="YourSecurePassword" \
  --env E2E_DATE="$(xcrun simctl spawn booted date -v+3d +%F)"
```

Run this after Golden Flow 1 so `E2E Golden Routine` exists.

```bash
maestro test maestro/flows/golden-offline-workout-sync.yaml \
  --env E2E_EMAIL="e2e+YYYYMMDD-xxxx@example.com" \
  --env E2E_PASSWORD="YourSecurePassword" \
  --env E2E_DATE="$(xcrun simctl spawn booted date -v+4d +%F)"
```

Then run `golden-logout-login-state-integrity.yaml`.

### 4. Cleanup (Optional)

```bash
SUPABASE_URL_E2E=... SUPABASE_SERVICE_ROLE_KEY_E2E=... \
npm run e2e:cleanup -- <userId>
```

## Required Environment Variables

| Variable                        | Purpose                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL_E2E`              | E2E Supabase project URL                                                                                                                                                                                                                                                                 |
| `SUPABASE_ANON_KEY_E2E`         | E2E Supabase anon key (for app)                                                                                                                                                                                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY_E2E` | E2E service role (auth + cleanup only)                                                                                                                                                                                                                                                   |
| `E2E_TEST_PASSWORD`             | Password for test users                                                                                                                                                                                                                                                                  |
| `E2E_DATE`                      | Date key (`YYYY-MM-DD`) used by day selectors in Golden Flow 1, Day Detail Flow, Start Entry Flow, Plan Start Flow, and Golden Flow 2 (recommended: `+%Y-%m-15` for Flow 1, `-v+1d +%F` for Day Detail, `-v+2d +%F` for Start Entry, `-v+3d +%F` for Plan Start, `-v+4d +%F` for Flow 2) |
| `E2E_MONTH_START`               | Month-start key (`YYYY-MM-01`) for month-nav flow baseline assertion                                                                                                                                                                                                                     |
| `E2E_NEXT_MONTH_START`          | Next month-start key (`YYYY-MM-01`) for month-nav flow forward-shift assertion                                                                                                                                                                                                           |

## CI Integration

- **Workflow**: `.github/workflows/e2e.yml`
- **Triggers**:
  - Nightly (6am UTC) + `workflow_dispatch` for full suite
  - `pull_request` (opt-in by label)
- **Runner**: `macos-14`
- **Secrets**: `SUPABASE_URL_E2E`, `SUPABASE_ANON_KEY_E2E`, `SUPABASE_SERVICE_ROLE_KEY_E2E`, `E2E_TEST_PASSWORD`

Nightly/manual CI creates a unique user per run, runs Golden Flow 1, month-nav flow, day-detail flow, start-entry flow, plan-start cohesion flow, Golden Flow 2, Golden Flow 3, cleans up the user, and uploads artifacts on failure. Date keys are staggered across flows to reduce collisions.

PR opt-in behavior:

- Job: `e2e-pr-calendar-start`
- Runs only when label `e2e-calendar-start` is present and PR is not from a fork.
- Executes only `e2e/maestro/calendar_start_planned_workout.yaml` as a focused guardrail.

## How Cleanup Works

`e2e/helpers/cleanup.ts` deletes all user data for a given `userId` via service role:

- Tables (dependency order): `workout_sets`, `workout_exercises`, `workouts`, `plan_days`, `plans`, `routine_items`, `routines`, `user_settings`, `checkin_photos`, `checkins`, `routine_favorites`, `exercise_favorites`
- Auth user: deleted via `auth.admin.deleteUser`

## Artifacts on Failure

On flow failure, CI uploads `maestro-e2e-artifacts` containing:

- Screenshots
- Videos (if Maestro captured)
- Logs

Download from the Actions run → Artifacts.

## Flake Triage

1. **Check artifacts**: Screenshots show where the flow failed.
2. **Timing**: Increase `timeout` in `extendedWaitFor` if network or sync is slow.
3. **Selectors**: Verify `testID` values match `e2e/selectors.ts` and the app.
4. **Locale**: Flows assume English; ensure simulator locale is `en`.
5. **Offline flow**: iOS Simulator cannot disable network; Flow 2 validates sync after workout completion. For real offline testing, use a device with airplane mode.

## TestIDs Reference

See `e2e/selectors.ts` for the canonical list. Key IDs:

- `login:emailInput`, `login:passwordInput`, `login:submitButton`
- `routines:newRoutineButton`, `routineNew:nameInput`, `routineNew:saveButton`
- `exerciseSearch:exerciseRow`
- `calendar:monthLabel`, `calendar:day:<YYYY-MM-DD>`, `calendar:daySheet`, `calendar:routinePicker`, `calendar:routineRow:<routineId>`, `calendar:addPlanButton`, `calendar:startWorkoutButton`
- `workout:primaryActionCard`, `workoutSession:root`, `workoutSession:finishButton`, `workoutSession:finishSubmitButton`, `workoutSession:addSetButton`
- `syncPill:chip`, `profile:signOutButton`, `profile:workoutsCount`
