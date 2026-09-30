# Architecture

## Auth / Deeplink Flow

1. User opens Profile → Integrations → Google Calendar.
2. [`useGoogleCalendarSync.ts`](src/features/googleCalendar/useGoogleCalendarSync.ts) validates config via [`googleCalendarConfig.ts`](src/features/googleCalendar/googleCalendarConfig.ts).
3. The app generates:
   - PKCE verifier/challenge
   - OAuth `state`
4. [`googleCalendarAuth.ts`](src/features/googleCalendar/googleCalendarAuth.ts) builds the Google OAuth URL using:
   - callback URI from [`src/config/authRedirects.ts`](src/config/authRedirects.ts), generated from `app.json` scheme
   - `calendar.events` and `calendar.readonly` scopes
5. `expo-web-browser` opens the system auth session.
6. Google redirects back to:

```text
workout-tracker-ios://google-calendar-callback
```

7. The callback parser verifies:
   - URL shape
   - consent denial
   - returned `state`
   - authorization code presence
8. Tokens are exchanged and stored in SecureStore.
9. Calendars are fetched immediately and persisted into the connection record.

## Connection Flow

- Connection metadata is stored in `google_calendar_connections`
- Tokens remain local in SecureStore
- The settings screen reloads calendars on mount if a connection exists
- Reconnect states are surfaced when token or calendar API errors imply a broken connection
- Selected calendar is repaired if the previously selected calendar disappears

## Sync Trigger Flow

Trusted schedule mutations stay in the data layer:

- [`scheduleRoutineForDate`](src/db/scheduledRoutines.ts)
  - create or update Google event
- [`clearScheduledRoutineForDate`](src/db/scheduledRoutines.ts)
  - delete Google event before the app row is removed

Manual and first-enable flows:

- `backfillFutureScheduledRoutines(userId)`
- `repairAllFutureLinks(userId)`

Backfill is bounded to workouts on or after today and skips rows already marked `completed` or `skipped`.

## Data Model

### `google_calendar_connections`

- user-scoped connection status
- selected calendar id + summary
- sync enabled state
- last error
- timestamps

### `scheduled_workout_calendar_links`

- user-scoped mapping between `scheduled_routines.id` and Google event id
- unique per scheduled routine
- sync status / last synced / last error

These tables are already created by [`migration-041-google-calendar-sync.sql`](supabase/migrations/migration-041-google-calendar-sync.sql).

## Failure Model

- Scheduling remains primary; Google sync is best-effort
- Connection/config errors stay in UI state and connection metadata
- Broken links can be repaired without changing the app schedule
- Missing config fails early and visibly
- Calendar API failures do not block workout scheduling

## Event Model

- all-day event
- title: `Workout — {routine name}`
- disclaimer in description explaining one-way sync
- `extendedProperties.private.scheduled_routine_id` for durable identity

## Feature Flag Model

`ENABLE_GOOGLE_CALENDAR_SYNC` is currently on in repo. The Profile entry point is shown only when that flag is on and `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is present in the build. If the screen is opened directly without the client ID, it fails gracefully with the missing-config state instead of attempting OAuth. Release preflight blocks a flag-on build if the client ID is missing from the release environment.
