# Feature Map

## Navigation and Entry Flow

- Root providers and auth guard: `app/_layout.tsx`.
- Initial redirect logic (auth + onboarding): `app/index.tsx`.
- Route groups:
  - `app/(auth)`: login, signup, forgot password, reset password, login callback.
  - `app/(app)`: authenticated app surface.
  - `app/(app)/(tabs)`: workout, calendar, progress, profile.
  - Additional app routes: onboarding, routines, workout-session, workout detail.

## Screen Responsibilities

### Workout Tab (`app/(app)/(tabs)/workout.tsx`)

- Daily home surface with greeting, cadence summary, week rhythm, and quick actions.
- Handles start/resume workout and repeat-last-session.
- Loads routines and routine usage for quick-start buttons.
- Data sources:
  - `fetchWorkouts`, `fetchInProgressWorkout`, `createWorkout`, `copyWorkoutExerciseDefinitions`
  - `loadRoutines`, `loadRoutineUsage`
  - `startRoutine`

### Workout Session (`app/(app)/workout-session.tsx`)

- Main active logging flow: add exercises, add/edit/delete sets, finish or cancel.
- Supports rest timer, set defaults, and workout meta (effort/session note).
- Data sources:
  - `fetchWorkoutDetail`, `addExerciseToWorkout`, `addSet`, `updateWorkoutSet`
  - `deleteWorkoutSet`, `deleteWorkoutExercise`, `finishWorkout`, `finishWorkoutWithMeta`
  - `searchExerciseDefinitions`, `fetchLastExercisePerformance`

### Calendar Tab (`app/(app)/(tabs)/calendar.tsx`)

- Two modes: history and weekly plan.
- History mode: heatmap, streak, recent activity.
- Plan mode: per-day routine assignment and plan management.
- Optional agenda toggle is gated by `ENABLE_CALENDAR_AGENDA`.
- Optional consistency strip is gated by `ENABLE_CALENDAR_CONSISTENCY_STRIP` and appears in Agenda view only.
- Data sources:
  - `fetchCompletedWorkoutDates`
  - `loadWeeklyWorkoutsGoal`
  - `loadRoutines`, `loadPlans`, `setPlan`, `clearPlan`
  - `startRoutine`

### Progress Tab (`app/(app)/(tabs)/progress.tsx`)

- Multi-segment analytics (overview/routines/exercises).
- Computes period stats, PRs, trends, and routine signals from normalized sets/workouts.
- Data sources:
  - `fetchProgressWorkouts`
  - `loadRoutines`, `loadRoutineUsage`, `loadWorkoutMeta`
  - `compute*` functions in `src/features/progress/compute.ts`

### Profile Tab (`app/(app)/(tabs)/profile.tsx`)

- Account summary, language, units, rest timer, and sign out.
- Data sources:
  - `useAuth().signOut`
  - `fetchWorkouts`, `fetchProgressWorkouts`
  - `loadProfilePreferences`, `saveProfilePreferences`

### Routines (`app/(app)/routines/*`)

- CRUD for local routines and routine details.
- Starts routine-driven workouts through `startRoutine`.
- Data source: `src/lib/routines.ts` + routine start feature.

### Onboarding (`app/(app)/onboarding.tsx`)

- First-run walkthrough for any authenticated user whose onboarding is incomplete,
  including newly created Google OAuth users.
- Data source: `src/lib/onboarding.ts`.
- Source of truth: `user_settings.onboarding_completed_at` with SecureStore cache/backfill.

### Login Callback (`app/(auth)/login-callback.tsx`)

- Handles the Google OAuth app callback.
- Exchanges PKCE `code` values or token fragments for a Supabase session.
- Sends users back into the normal authenticated flow after `login-callback` resolves.

## Cross-Cutting Feature Modules

- `src/features/today/compute.ts`: greeting, relative time, cadence, week rhythm helpers.
- `src/features/workoutSession/restTimer.ts`: timer state transitions.
- `src/features/workoutSession/workoutMeta.ts`: parse/compose effort + note metadata.
- `src/features/routines/startRoutine.ts`: creates workout and applies routine items safely.

## Event and Analytics Touchpoints

- Provider/bridge and screen tracking: `app/_layout.tsx`.
- Event capture calls in workout and session flows via `src/analytics/posthogClient.ts`.
- Analytics and observability: [OBSERVABILITY.md](../OBSERVABILITY.md).
