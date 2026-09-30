# Progress v2 — Release Checklist

> Historical note: the current redesign is described in
> [`docs/progress-redesign/architecture.md`](docs/progress-redesign/architecture.md).
> This checklist remains useful for the original v2 rollout and release context.

> Phase 5 QA + Release Hardening — final gate before production.

---

## Scope

**Progress v2** replaces the legacy Progress tab with an analytics-powered screen backed by `migration-027-analytics-foundation.sql`. It is gated by `ENABLE_PROGRESS_V2` in `src/config/featureFlags.ts`.

---

## 1 — Pre-Release Gates (must all pass)

### 1.1 Automated CI

| Gate                                              | Command                                     | Expected                |
| ------------------------------------------------- | ------------------------------------------- | ----------------------- |
| Unit tests (incl. insight engine, DTO validators) | `npm test`                                  | ✅ All pass, 0 failures |
| TypeScript type check                             | `npx tsc --noEmit`                          | ✅ No errors            |
| Lint                                              | `npx eslint . --ext .ts,.tsx`               | ✅ 0 errors             |
| DB contract verification                          | `node scripts/verify-supabase-contract.mjs` | ✅ All checks pass      |
| E2E smoke (GitHub Actions `e2e.yml`)              | CI                                          | ✅ Green                |

### 1.2 Database Migration

- [ ] Migration `migration-027-analytics-foundation.sql` applied to **staging** database  
       `npx supabase db push` (staging)
- [ ] Postflight check passes:  
       `psql $STAGING_URL < supabase/migrations/postflight-027-analytics-verify.sql`
- [ ] Migration applied to **production** database  
       `npx supabase db push` (prod — requires explicit approval)
- [ ] Postflight check passes on production

### 1.2a Supabase API — Expose `analytics` Schema ⚠️ REQUIRED

> **Without this step every `.schema('analytics')` call in the client returns `PGRST106`
> and the entire Progress v2 UI shows error cards.**

- [ ] Supabase Dashboard → Settings → API → **"Exposed schemas"** includes `analytics`  
       _(applies to **both** staging and production projects)_

Verification (run against staging/prod DB via psql or the Supabase SQL editor):

```sql
-- PostgREST reads this GUC to determine allowed schemas.
-- 'analytics' must appear in the result.
SELECT current_setting('pgrst.db_schemas', true);
```

If `analytics` is absent: add it in the Dashboard, then click "Reload" (or restart
the PostgREST container for self-hosted deployments). No migration needed — this is
purely a runtime API-gateway configuration.

### 1.3 Performance Indexes

Verify these indexes exist in production (from migration-027):

```sql
-- Run on production DB to confirm
SELECT indexname FROM pg_indexes
WHERE tablename IN ('workout_sets', 'workouts')
  AND schemaname = 'public'
ORDER BY indexname;
```

Expected: `idx_workout_sets_workout_id_muscles`, `idx_workouts_user_completed_at` (or equivalent) present.

---

## 2 — Manual QA Checklist

Full manual QA flows are documented in `docs/progress_v2_qa_manual.md`.

Quick smoke checklist (minimum for any release candidate):

| Flow                                     | Device                  | Expected                                           |
| ---------------------------------------- | ----------------------- | -------------------------------------------------- |
| Open Progress tab → loads within 2s      | iPhone 15 Pro Simulator | ✅ Skeletons → data                                |
| Pull-to-refresh                          | Same                    | ✅ Refreshes without error                         |
| Switch time range 4W → 3M → 1Y → All     | Same                    | ✅ Each updates cleanly                            |
| Select a lift for e1RM trend             | Same                    | ✅ Chart appears or empty state                    |
| Force offline (Airplane Mode) → open tab | Same                    | ✅ Shows stale data or empty state (no crash)      |
| Account with 0 workouts                  | Fresh test account      | ✅ All sections show empty state cards             |
| Account with 1 workout                   | Test account            | ✅ Hero loads; trends show "unlocks after N" cards |
| Insight row visible when >3 workouts     | Seeded account          | ✅ At least one insight renders                    |

---

## 3 — Feature Flag Configuration

The flag lives in `src/config/featureFlags.ts`:

```typescript
export const ENABLE_PROGRESS_V2 = true // ← flip to false for OTA rollback
```

**To enable (default):** Flag is `true` — Progress v2 renders.

**To disable (kill-switch):** Set `ENABLE_PROGRESS_V2 = false`, commit, push OTA via expo-updates. Users will see a "Progress coming soon" placeholder until the next full release re-enables it.

---

## 4 — Telemetry Verification

After releasing to TestFlight, verify these events appear in PostHog within 30 minutes of first use:

| Event                       | Expected Properties             | What it proves                          |
| --------------------------- | ------------------------------- | --------------------------------------- |
| `progress_v2_screen_view`   | `range_days: 90` (default 3M)   | Screen mounted correctly                |
| `progress_v2_range_changed` | `range: '4W'`, `range_days: 28` | Range selector works                    |
| `progress_v2_load_error`    | `query: 'overview'`             | Error path fires (only if errors occur) |

If `progress_v2_screen_view` does NOT appear after confirmed app opens:

1. Verify PostHog env vars are set (`EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`)
2. Check `src/analytics/posthogClient.ts` — `posthogClient` may be null if keys are absent
3. This is non-blocking: the app still works; only observability is degraded

---

## 5 — Rollback Procedure

### 5.1 OTA Rollback (< 30 minutes to users)

If a critical bug is found after release but before a full build is deployed:

1. In `src/config/featureFlags.ts`, set `ENABLE_PROGRESS_V2 = false`
2. Commit: `git commit -m "fix: disable Progress v2 via feature flag (emergency OTA)"`
3. Push OTA update: `eas update --branch production --message "rollback progress v2"`
4. Users receive the update on next app foreground (expo-updates background fetch)

Users will see the "Progress coming soon" placeholder while the fix is being prepared.

### 5.2 Full Rollback (if OTA is not sufficient)

1. Revert the `progress.tsx` change to point to the legacy screen
2. Submit a new build to TestFlight / App Store
3. Keep `migration-027` in place — it is additive and backward-compatible

### 5.3 Database Rollback

`migration-027` creates an `analytics` schema with views and RPCs only. It does **not** modify existing `public` schema tables or data. It is safe to leave in place even if Progress v2 is disabled.

If rollback of the schema is required anyway:

```sql
DROP SCHEMA analytics CASCADE;
```

⚠️ This is destructive and irreversible. Only execute if explicitly approved.

---

## 6 — Monitoring Alerts (Post-Release)

Set up PostHog dashboard:

| Metric                                  | Alert threshold            | Action                                          |
| --------------------------------------- | -------------------------- | ----------------------------------------------- |
| `progress_v2_load_error` events         | > 5 unique users in 1 hour | Investigate; consider OTA rollback              |
| `progress_v2_screen_view` rate drop     | < 50% of previous day      | Check crash reports in EAS                      |
| DB query P95 latency (analytics schema) | > 2000 ms                  | Run `ANALYZE` on analytics views; check indexes |

---

## 7 — Sign-off

| Role     | Name | Date | Notes                            |
| -------- | ---- | ---- | -------------------------------- |
| Engineer |      |      | All automated gates passed       |
| QA       |      |      | Manual smoke checklist completed |
| Release  |      |      | Migration applied to production  |

---

_Document created: Phase 5 QA + Release Hardening_  
_Related: `docs/progress_v2_qa_manual.md`, `supabase/migrations/migration-027-analytics-foundation.sql`_
