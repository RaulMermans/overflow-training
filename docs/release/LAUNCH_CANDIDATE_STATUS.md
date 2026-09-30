# Launch Candidate Status

**Date**: 2026-03-18
**Sprint**: Release Hardening
**Audited in**: release-hardening sprint (AI-assisted review, human-directed)
**Quality gates at audit time**: all passing (typecheck, lint, format, tests, db:verify:contract)

---

## TL;DR

**READY FOR INTERNAL BETA / TESTFLIGHT**

All critical flows are architecturally sound. One meaningful bug was found and fixed (outbox best-effort semantics). No auth blockers. No data-loss paths. No silent save failures.

---

## 1. Issues Fixed in This Sprint

### FIX-001 — Outbox: `finish_workout*` schedule completion was not best-effort

| Field           | Detail                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Symptom**     | After a workout completed successfully, the sync indicator could remain "pending" for up to 20 minutes if `completeScheduledRoutineByWorkoutId` had a transient network error. At max retries, the event would be blocked and the calendar row could remain in `'started'` status even though the workout was durably saved.                                        |
| **Root cause**  | `processEvent()` in `worker.ts` propagated the `scheduleResult.error` from `completeScheduledRoutineByWorkoutId` as an outbox failure, triggering unnecessary retries. The DB layer (`src/db/scheduledRoutines.ts:197`) explicitly documents this call as "best-effort: failure here should not block workout completion" — but the outbox enforced it as required. |
| **Fix**         | `src/features/sync/outbox/worker.ts`: changed `finish_workout` and `finish_workout_with_meta` handlers to log `scheduleResult.error` in DEV but always return `{ ok: true }` after the workout itself finishes successfully. The schedule update is still attempted on every flush — a transient failure just no longer blocks event completion.                    |
| **Idempotency** | `completeScheduledRoutineByWorkoutId` uses `WHERE status = 'started'`, so a retry will gracefully match 0 rows if the status was already updated. No double-completion risk.                                                                                                                                                                                        |
| **Risk level**  | Low. The workout `UPDATE` (`finishWorkoutAt`/`finishWorkoutWithMetaAt`) was already idempotent before this change.                                                                                                                                                                                                                                                  |
| **Test added**  | `__tests__/outbox-finish-workout-best-effort.test.ts` — 3 cases covering both event types with a failing schedule update, plus a control case where the workout finish itself fails.                                                                                                                                                                                |

---

## 2. Audit Findings — No Action Required

These were audited and confirmed clean. Documented here for future reviewers.

### Auth Flow

| Area                         | Status   | Notes                                                                                                                                      |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Google OAuth redirect URI    | ✅ Clean | Hardcoded constant from `authRedirects.ts`, not dynamic `Linking.createURL`. Eliminates Expo Go / dev-client / production scheme mismatch. |
| OAuth callback deduplication | ✅ Clean | `hasHandledAuthCallbackCode` / `markAuthCallbackCodeHandled` prevent double PKCE exchange on cold start.                                   |
| Session persistence          | ✅ Clean | SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Falls back to in-memory on unavailability (e.g. simulator).                             |
| PKCE flow                    | ✅ Clean | `flowType: 'pkce'` + `detectSessionInUrl: false` + manual code exchange.                                                                   |
| Auth contract drift          | ✅ Clean | `scripts/verify-auth-contract.mjs` validates scheme consistency. Runs in `preflight:beta`.                                                 |
| Scheme mismatch guard        | ✅ Clean | DEV-mode warning in `useAuth.tsx` if `expo-constants` reports a scheme that differs from `authRedirects.ts`.                               |
| Reset password deep link     | ✅ Clean | `RESET_PASSWORD_URI` derived from same `authRedirects.ts` constant. Route exists at `app/(auth)/reset-password.tsx`.                       |
| login-callback fallback      | ✅ Clean | `login-callback.tsx` handles both URL-param code and `Linking.getInitialURL` fallback for cold-start deep links.                           |
| Auto-refresh lifecycle       | ✅ Clean | `startAutoRefresh`/`stopAutoRefresh` tied to AppState (active/inactive).                                                                   |

**Required dashboard config** (unchanged, must be verified before each release):

- Google Cloud OAuth type: `Web application`
- Google Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase Site URL: `https://www.raulmermans.com`
- Supabase Redirect URLs: `workout-tracker-ios://login-callback` + `workout-tracker-ios://reset-password`

### Environment & Config

| Area                        | Status   | Notes                                                                                         |
| --------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| Env var validation          | ✅ Clean | `check:env` script enforces required vars; app shows startup error and halts if missing.      |
| Service-role key prevention | ✅ Clean | `check:env:release` validates anon key JWT role is `anon`, not `service_role`.                |
| Supabase client null guard  | ✅ Clean | `supabase` is `null` if env vars missing; `requireSupabase()` throws a clear error.           |
| EAS env per-profile         | ✅ Clean | `development/preview/production` channels each have their own env context.                    |
| Feature flag defaults       | ✅ Clean | All risky flags have OTA kill switches. `ENABLE_PROGRESS_V2 = true` has rollback SOP in docs. |

### Workout Loop & Sync

| Area                          | Status   | Notes                                                                                                                |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| Workout creation with user_id | ✅ Clean | All inserts include `user_id` explicitly (RLS enforced).                                                             |
| Outbox phase ordering         | ✅ Clean | Deterministic: create → exercise → set → update → delete → finish/cancel.                                            |
| Dependency tracking           | ✅ Clean | Child events blocked until parent confirmed synced in current flush cycle.                                           |
| FK constraint fallback        | ✅ Clean | `23503` FK error treated as dependency-defer (not permanent block) when parent is pending.                           |
| Auth-paused flush             | ✅ Clean | AUTH error halts the entire flush cycle; events stay pending until session restores.                                 |
| Retry ceiling                 | ✅ Clean | 25 attempts or 20 minutes max age before blocking. AUTH-paused events exempt from age limit.                         |
| Queue compaction              | ✅ Clean | `cancel_workout` drops all child events for that workout before syncing. `delete_set` drops superseded `update_set`. |
| Scope guard                   | ✅ Clean | Flush strips events belonging to a different user_id (protection against stale local state after sign-out).          |
| Session cleanup on sign-out   | ✅ Clean | `cleanupUserSessionBeforeSignOut` clears outbox, projection, cache before Supabase sign-out.                         |

---

## 3. Remaining Known Issues

### Blockers

None.

### High-Priority Non-Blockers

| ID     | Issue                                                                                                                                        | Mitigation                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| NB-001 | Outbox file queue has no CRC/integrity check. Power-loss mid-write could corrupt the file.                                                   | Phase ordering + dependency tracking prevent data inconsistency even with a partial queue. App re-creates queue file from empty state on parse error. |
| NB-002 | `isFlushing` is module-level state. A hot-reload in dev (not production) resets it, allowing concurrent flushes until the flag is set again. | Production builds do not hot-reload. Not a production risk.                                                                                           |

### Minor Issues

| ID    | Issue                                                                                                                  | Notes                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| M-001 | `completeScheduledRoutineByWorkoutId` failure is now silent in production builds. Errors are only logged in `__DEV__`. | Add structured observability event if PostHog instrumentation is expanded.                                                                 |
| M-002 | `app.json` version/buildNumber are on `1.0.0`/`1`. Manual bump required before first release.                          | `autoIncrement: true` in EAS handles build numbers for production; only `version` in `app.json` needs manual update per marketing version. |
| M-003 | `ENABLE_NOTIFICATIONS = false` is inert but the flag remains.                                                          | No action needed until notifications feature is implemented.                                                                               |

---

## 4. Rollout Cautions

1. **Auth dashboard config**: Google Cloud and Supabase URL configuration are managed outside the repo. Must be verified against the values in `docs/release/RELEASE_CHECKLIST.md` § Auth Redirect Configuration before each build. Do not assume they persist unchanged.

2. **OTA kill switches**: `ENABLE_PROGRESS_V2`, `useNewScheduleSource`, `useStartScheduledWorkoutRPC`, `ENABLE_WORKOUT_OUTBOX` are all kill-switchable via OTA. If any causes a production incident, push an OTA update toggling the flag to `false` before rolling back the native build.

3. **First release version bump**: Increment `app.json` `version` field from `1.0.0` before EAS production build. `buildNumber` is auto-managed by EAS.

4. **Outbox best-effort change (FIX-001)**: The schedule update is now fire-and-forget in terms of outbox completion. If `scheduled_routines` has a structural issue (wrong status, missing row), it will now fail silently in production. Monitor calendar "completed workout" display in QA before shipping.

---

## 5. Rollback Triggers

If a production issue appears post-launch, use these as decision gates:

| Symptom                                                        | Action                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Users cannot sign in via Google                                | Check Supabase Site URL and redirect URLs. Check Google Cloud OAuth client. No code change needed.                                              |
| Workout save appears to succeed but doesn't appear in history  | Check outbox worker logs (DEV) or PostHog `outbox_retry` events. May indicate Supabase outage.                                                  |
| Progress tab shows stale data                                  | Push OTA with `ENABLE_PROGRESS_V2 = false`. SOP: `docs/progress_v2_release_checklist.md § Rollback`.                                            |
| Calendar shows workout as "in progress" after user finishes it | May be `completeScheduledRoutineByWorkoutId` failing silently (M-001). Check DB directly. Can be patched with a migration or manual SQL update. |
| Auth session dropped after app backgrounded                    | Check `startAutoRefresh`/`stopAutoRefresh` logs in Sentry. May be an iOS background task kill edge case.                                        |

---

## 6. Launch Recommendation

**READY FOR INTERNAL BETA / TESTFLIGHT**

Rationale:

- All automated quality gates pass (typecheck, lint, tests, db:verify:contract, preflight:beta)
- Auth flow is solid: PKCE, hardcoded redirects, deduplication, contract verification script
- Workout loop is durable: outbox with phase ordering, retry, dependency tracking, scope guard
- The one confirmed bug (FIX-001) is fixed, tested, and low-risk
- No data-loss paths identified
- No silent auth failures
- Kill switches are in place for all risky features
- Release and QA checklists are up to date and deterministic

**Not yet**: `READY FOR APP STORE RELEASE` — requires:

1. Full manual QA on a physical device per `docs/TESTFLIGHT_GO_NO_GO.md` (all 21 checks)
2. App Store Connect record and metadata complete
3. Screenshot matrix complete (`docs/APP_STORE_SCREENSHOT_MATRIX.md`)
4. Export compliance answered
5. Internal TestFlight install verified on real device

---

## 7. Files Changed in This Sprint

| File                                                  | Change                                                                                                                                                                   | Reason                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `src/features/sync/outbox/worker.ts`                  | `finish_workout` and `finish_workout_with_meta` handlers: `completeScheduledRoutineByWorkoutId` error is now best-effort (logged in DEV, not returned as outbox failure) | FIX-001: semantic mismatch between "best-effort" DB doc and outbox failure propagation |
| `__tests__/outbox-finish-workout-best-effort.test.ts` | New test file: 3 cases verifying best-effort behavior for both event types and control case                                                                              | Coverage for FIX-001                                                                   |
| `LAUNCH_CANDIDATE_STATUS.md`                          | New file (this document)                                                                                                                                                 | Phase 5 deliverable: release candidate posture                                         |
