# Observability — Crash Reporting & Sync Telemetry

## Release Tagging

- **Format:** `${appVersion}+${buildNumber}-${gitShaShort}` (e.g. `1.0.0+42-a1b2c3d`)
- **Fallback:** `${version}-${shaShort}` or `${version}-dev` when build info unavailable
- **Environment:** `development` (**DEV**), `preview`, or `production` from EAS channel
- **Source:** `src/lib/observability/releaseId.ts` — uses `expo-constants` and `expo-application`

## Crash Reporting (Sentry)

- **Init:** `initCrashReporting({ release, env })` at app startup (`app/_layout.tsx`)
- **DSN:** `EXPO_PUBLIC_SENTRY_DSN` — no-op when unset
- **User:** `setUser(userId)` on auth; no email or PII
- **Boundary:** `RootErrorBoundary` calls `captureException(error, context)` in `componentDidCatch`

## Sync Error Taxonomy

- **Module:** `src/lib/sync/syncErrorTaxonomy.ts`
- **Codes:** AUTH, RLS, CONSTRAINT, VALIDATION, NETWORK, TIMEOUT, RATE_LIMIT, SERVER, CONFLICT, UNKNOWN
- **Classification:** Pure function `classifySyncError(err)` → `{ code, retryable, httpStatus?, pgCode?, constraint?, messageSafe? }`
- **Rules:** HTTP 401/419 → AUTH; 403/42501 → RLS; 23505/23503/23502 → CONSTRAINT; 429 → RATE_LIMIT; 5xx → SERVER; network/timeout patterns → NETWORK/TIMEOUT

## Structured Sync Events (PostHog)

All events include `schema_version: 1` for payload evolution.

| Event                          | Key properties                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `sync_start`                   | sync_id, env, release, started_at, entities, direction, local_queue_count?                                          |
| `sync_end`                     | sync_id, duration_ms, result, entity_success_count, entity_failure_count, retryable_failure_count, last_error_code? |
| `sync_entity_failure`          | sync_id, entity, operation, error_code, retryable, http_status?, pg_code?, constraint?                              |
| `programs_start_missing_slugs` | schema_version, error_code (VALIDATION), missing_count, missing_slugs (truncated to 50)                             |

## Privacy / PII Rules

- **Never include:** access tokens, raw SQL, full request bodies, user-generated free-text
- **Slug lists:** truncated to max 50, comma-joined
- **Payloads:** allowlisted fields only; no server payload dumps
- **User:** crash reporter gets `userId` only; analytics identify by UUID
