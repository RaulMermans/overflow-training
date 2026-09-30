# Google Calendar Sync

## Feature Summary

Google Calendar sync v1 mirrors scheduled workouts from the app into a user-selected Google Calendar.

The app remains the **source of truth**:

- changes made in the app update Google Calendar
- changes made in Google Calendar do not update the workout schedule in this version

## Status

Implemented and merged. Repo behavior is controlled by two explicit gates:

1. **Entry-point visibility gate** — `ENABLE_GOOGLE_CALENDAR_SYNC` + `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`
   - The Google Calendar row in Profile → Integrations appears only when the feature flag is `true` and the build includes `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`
   - This prevents a visible-but-unusable Google Calendar feature from shipping in a misconfigured build
2. **Connection/runtime gate** — `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` (build-time env var)
   - Controls whether the connect flow can actually work
   - If someone reaches the screen directly without the client ID, it fails gracefully with the missing-config state and a disabled "Update to connect" action
   - Must be set in `.env` for local Calendar testing and in the exact EAS environment used for preview/production/TestFlight builds
   - Changing it requires a new EAS build and a fresh install of that build or TestFlight binary

Release safety:

- `npm run check:env:release` now fails when `ENABLE_GOOGLE_CALENDAR_SYNC` is `true` but `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is missing from the selected release environment
- The `Quality Gates` workflow on `main` / `release/*` no longer skips this requirement
- Local `npm run check:env` stays non-blocking for this variable so general app work is not blocked when Calendar sync is not being tested

Both gates must be satisfied for the feature to be fully functional. The feature flag can be `true` without the env var, but the normal UI entry point stays hidden until the build is configured.

Credential split:

- Google Calendar sync uses the existing **iOS OAuth client ID** via `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`
- No app-side Google client secret is used
- Supabase Google sign-in remains separate and keeps its **Web client secret** only in the Supabase Dashboard

## Supported Behavior

- In-app connect flow from Profile → Integrations → Google Calendar
- Calendar selection
- Per-user sync toggle
- Create event on schedule
- Update event on reschedule / routine replacement
- Delete event on unschedule / delete
- Bounded backfill for future workouts when sync is enabled
- Repair / reconnect UI
- Durable Supabase mapping between scheduled workouts and Google events

## Unsupported Behavior

- Two-way sync
- Importing Google Calendar events into the app
- Reacting to manual Google Calendar edits
- Background webhooks or provider push notifications
- Timed events
- Multi-provider abstraction

## Source-of-Truth Rule

```text
scheduled_routines (Supabase) -> Google Calendar
```

Never the reverse in v1.

## Primary Docs

- [`architecture.md`](docs/google-calendar-sync/architecture.md)
- [`decisions.md`](docs/google-calendar-sync/decisions.md)
- [`external-setup.md`](docs/google-calendar-sync/external-setup.md)
- [`qa-checklist.md`](docs/google-calendar-sync/qa-checklist.md)

## Key Files

- [`src/config/featureFlags.ts`](src/config/featureFlags.ts)
- [`src/config/authRedirects.ts`](src/config/authRedirects.ts)
- [`src/features/googleCalendar/googleCalendarConfig.ts`](src/features/googleCalendar/googleCalendarConfig.ts)
- [`src/features/googleCalendar/googleCalendarAuth.ts`](src/features/googleCalendar/googleCalendarAuth.ts)
- [`src/features/googleCalendar/googleCalendarClient.ts`](src/features/googleCalendar/googleCalendarClient.ts)
- [`src/features/googleCalendar/googleCalendarErrors.ts`](src/features/googleCalendar/googleCalendarErrors.ts)
- [`src/features/googleCalendar/syncService.ts`](src/features/googleCalendar/syncService.ts)
- [`src/features/googleCalendar/useGoogleCalendarSync.ts`](src/features/googleCalendar/useGoogleCalendarSync.ts)
- [`src/db/googleCalendarConnections.ts`](src/db/googleCalendarConnections.ts)
- [`src/db/scheduledWorkoutCalendarLinks.ts`](src/db/scheduledWorkoutCalendarLinks.ts)
- [`app/(app)/integrations/google-calendar.tsx`](<app/(app)/integrations/google-calendar.tsx>)
- [`supabase/migrations/migration-041-google-calendar-sync.sql`](supabase/migrations/migration-041-google-calendar-sync.sql)
