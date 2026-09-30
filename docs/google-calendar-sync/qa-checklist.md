# QA Checklist

The feature flag is already enabled in repo. Make sure `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is present in the build you are testing before running this checklist.

## Connection

- Tap `Connect Google Calendar`
  - Google consent should open in the system browser
- Complete consent with an allowed Google test account
  - app returns to the integration screen
  - status shows connected
  - a calendar is selected
- Deny permission
  - the screen stays stable
  - a localized error is shown
- Disconnect
  - connection state clears
  - reconnect path remains available
- Restart the app after connecting
  - connection reloads
  - calendar list is available again without reconnecting

## Calendar Selection

- Connect with an account with multiple calendars
  - picker lists calendars
- Select a non-primary calendar
  - selected summary updates
  - new events go to that calendar
- Remove or revoke the previously selected calendar externally, then reload
  - the screen repairs to an available fallback calendar or surfaces reconnect state cleanly

## Sync Create / Update / Delete

- Schedule a workout
  - a Google Calendar event is created
- Replace or reschedule a scheduled workout
  - the linked Google event updates instead of duplicating
- Remove a scheduled workout
  - the linked Google event is deleted
- Try the same flows with sync disabled
  - app scheduling still works
  - no Google changes are created

## Backfill / Repair

- Enable sync when future workouts already exist
  - only future workouts are backfilled
- Include `completed` or `skipped` scheduled rows in test data
  - they are not backfilled
- Trigger repair / re-sync
  - stale future events are deleted and recreated from app state

## Failure Paths

- Missing `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`
  - connect stays disabled / fails gracefully with clear copy
- Token revoked after connecting
  - reconnect state is shown
- Calendar list request fails
  - screen does not crash
  - reload / reconnect options remain visible
- Network error during scheduling
  - workout scheduling still succeeds
  - sync failure does not break the main flow

## Final Internal Test Pass

- Verify the one-way sync copy is visible in the integration screen
- Verify Spanish strings on the integration path
- Verify feature disappears again if the flag is turned off
