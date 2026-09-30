# Known Issues

## Active

### 1. No time-of-day on events

**Type**: Intentional v1 limitation
**Detail**: `scheduled_routines.date` is `DATE` only. All calendar events are all-day. Users wanting time-specific events must wait for v2 (preferred workout time setting).

### 2. Tokens lost on reinstall

**Type**: Technical limitation
**Detail**: Google OAuth tokens stored in SecureStore are not backed up. Reinstalling the app requires reconnecting Google Calendar. This is acceptable behavior for v1 but should be documented in onboarding copy.

### 3. Backfill has no UI progress indicator

**Type**: UX gap
**Detail**: When a user enables sync with many future scheduled workouts, the backfill runs silently. There's no per-item progress feedback. The sync toggle returns to "On" and the sync completes asynchronously.

### 4. Google Calendar events not deleted on disconnect

**Type**: Intentional v1 behavior
**Detail**: When a user disconnects Google Calendar, existing events in Google Calendar are NOT automatically deleted. Users must clean them up manually. This is documented in the disconnect confirmation modal.

### 5. Release env dependency

**Type**: Release dependency
**Detail**: Because `ENABLE_GOOGLE_CALENDAR_SYNC` is enabled in repo, release builds now depend on `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` being present in the selected EAS environment. Missing this value blocks `npm run check:env:release`.

### 6. Device-local OAuth tokens

**Type**: Known limitation
**Detail**: Calendar sync connection metadata is shared in Supabase, but OAuth tokens remain device-local in SecureStore. A second device still needs to complete its own Google OAuth flow even when the connection row already exists.

---

## Rollout Cautions

1. **Google Cloud Console setup required** — Feature is inert until `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is set and the existing iOS OAuth client is confirmed in Google Cloud. Release preflight now blocks a flag-on build without that env var.

2. **Calendar API quota** — Google Calendar API has a per-user per-day quota. High-volume test runs could hit limits. Stay within safe testing thresholds.

3. **OAuth consent screen verification** — If using a Google Workspace account for testing, the OAuth app may need to be added to the approved list. For production, the app may need to go through Google's verification process for sensitive/restricted scopes.

4. **Sync failures are silent to users** — Errors are logged to Sentry but not surfaced in-app unless the user checks the integration settings screen. Consider adding a subtle sync error badge in a future iteration.

---

## Deferred to v2

- Two-way sync
- Importing Google Calendar events as scheduled workouts
- Time-of-day preference for events
- Server-side token refresh
- Webhook-based sync (push from Google to app)
- Non-Google calendar providers (Apple Calendar, Outlook)
- Bulk undo / "unsync all" option
- Multi-device token sharing via Supabase Vault
- Deep link from calendar event back to app workout
