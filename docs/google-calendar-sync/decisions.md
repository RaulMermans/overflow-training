# Decisions

## One-way sync over two-way sync

Decision:

- Keep v1 app → Google Calendar only.

Why:

- The user value is visibility of planned workouts in Google Calendar.
- Two-way sync would require webhook ingestion, conflict resolution, and schedule ownership rules that would put the workout flow at risk.

## App as source of truth

Decision:

- `scheduled_routines` remains authoritative.

Why:

- It preserves current auth, RLS, and scheduling behavior.
- Repair is simple because the app can recreate Google state from Supabase.

## Deeplink approach

Decision:

- Use a separate direct Google PKCE flow with the app callback from `authRedirects.ts`.

Why:

- Existing Supabase Google auth is for sign-in.
- Calendar access needs its own scopes and token lifecycle.
- Centralizing callback constants avoids fragmented redirect logic.

## Selected scopes

Decision:

- Request only:
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/calendar.readonly`

Why:

- `calendar.events` is required for create/update/delete.
- `calendar.readonly` is required for calendar selection.
- Wider account scopes are unnecessary for v1.

## Data model

Decision:

- Persist connection state and event links separately.

Why:

- Connection state changes more slowly than per-workout links.
- Per-workout link rows are the durable dedupe and repair anchor.

## Deferred v2 Items

Decision:

- Explicitly defer:
  - timed events
  - importing from Google Calendar
  - reacting to manual event edits
  - provider abstraction
  - background sync infrastructure

Why:

- Each one materially expands failure modes and support surface area without being required for v1 usefulness.

## Safe activation

Decision:

- Keep the feature flag off in repo by default.

Why:

- External Google Cloud setup and env configuration are required before the feature can succeed.
- This keeps the merge safe and activation explicit.
