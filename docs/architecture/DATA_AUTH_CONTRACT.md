# Data and Auth Contract

## Non-Negotiable Rules

- UI routes/components in `app/` do not call Supabase directly.
- Auth actions come from `src/auth/useAuth.tsx`.
- Workout data operations come from `src/db/workouts.ts` and `src/db/progress.ts`.
- RLS is enabled on all core tables and scopes to `auth.uid()`.
- Inserts into `workouts` must provide `user_id` explicitly.

## Auth Surface

`useAuth()` provides:

- `session`, `user`, `loading`, `startupError`, `missingSupabaseEnvVars`
- `signIn`, `signUp`, `signOut`, `signInWithGoogle`
- `resetPassword`, `exchangeCodeForSession`, `setSessionFromTokens`, `updatePassword`

Supabase client creation and storage adapter live in `src/lib/supabase.ts`. If required env vars are missing, client is `null` and startup error messaging is surfaced.

## Auth Redirect Configuration

- App scheme: `workout-tracker-ios`
- Google Cloud OAuth client type: `Web application`
- Google Cloud Authorized redirect URI:
  `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase Site URL: `https://www.raulmermans.com`
- Supabase Redirect URLs:
  - `workout-tracker-ios://login-callback`
  - `workout-tracker-ios://reset-password`
- `signInWithGoogle()` redirects to `login-callback`
- `resetPassword()` redirects to `reset-password`
- OAuth users are fully authenticated users. They follow the same onboarding gate
  as email/password users and do not need to create a password.

## Onboarding Completion

- Source of truth: `user_settings.onboarding_completed_at`
- Local cache/backfill: `src/lib/onboarding.ts`
- `app/index.tsx` routes any authenticated user, including Google OAuth users, to
  onboarding until completion is recorded

## Database Shape (MVP Core)

- `exercise_definitions`: canonical exercise library (`category` + `tracking_mode` + targets are canonical; `exercise_type` is legacy-derived from `category`).
- `workouts`: session header (`user_id`, `client_uuid`, `started_at`, `ended_at`, `status`, `notes`, `effort_rating`, `session_note`).
- `workout_exercises`: ordered exercises per workout (`client_uuid`, `order_index`).
- `workout_sets`: ordered sets per exercise (`client_uuid`, `set_index`, `reps`, `weight`, `weight_kg`, `is_weight_canonical`).
- `routines`: user-owned routine headers (`user_id`, `client_uuid`, `name`, `pinned`, `updated_at`).
- `routine_items`: ordered routine exercises (`client_uuid`, `order`, `exercise_id`, optional default targets/rest/notes).
- `scheduled_routines`: date-specific schedule (`user_id`, `date`, `routine_id`, `status`, optional `workout_id`); one row per user per date.
- Legacy/deprecated tables kept for compatibility only: `exercise_catalog`, `exercise_aliases`, `exercises`.
- Canonical sync identity is `client_uuid` (uuid); `exercise_definitions.client_id` is legacy-only and should not be used for new writes.

Canonical schema and policy source:

- `supabase/schema.sql`
- `supabase/policies.sql`

Types must stay aligned:

- `src/types/db.ts` mirrors SQL schema.

## RLS Contract Summary

- `workouts`: owner-only select/insert/update/delete.
- `workout_exercises`: owner access via parent workout ownership.
- `workout_sets`: owner access via workout_exercises -> workouts ownership chain.
- `exercise_definitions`: system read + owner CRUD (`scope='system'` rows readable by authenticated users; owner-scoped writes for `scope='user'` rows).
- `routines`: owner-only select/insert/update/delete.
- `routine_items`: owner access via parent routine ownership.
- `scheduled_routines`: owner-only select/insert/update/delete.

## Allowed Call Paths

- Auth flows:
  - Screens -> `useAuth()` -> Supabase auth client.
- Workout flows:
  - Screens -> `src/db/workouts.ts` -> Supabase tables.
- Progress flows:
  - Screens -> `src/db/progress.ts` -> Supabase tables -> feature compute functions.

## High-Risk Edits Checklist

When touching schema, policies, or DB types:

1. Update SQL first (`supabase/schema.sql`, `supabase/policies.sql`).
2. Sync TypeScript types (`src/types/db.ts`).
3. Verify DB function signatures and selected columns in `src/db/*.ts`.
4. Re-run Supabase verification docs before release if DB changed:
   - `docs/SUPABASE_VERIFY.md`

## Common Failure Signals

- Missing env vars: startup error with required names.
- Column mismatch: read/write failures in `src/db/workouts.ts`.
- RLS mismatch: queries fail for authenticated users despite valid session.
- Incorrect insert shape: workout creation rejected if `user_id` omitted.
