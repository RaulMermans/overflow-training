# Notifications & Habit Loops

## Status: Installed, shipping dark (2026-03-16)

## Feature Flag

`ENABLE_NOTIFICATIONS = false` in `src/config/featureFlags.ts`. Set to `true` and do an EAS build to activate.

## What Was Built

### Infrastructure (`src/lib/notifications/`)

- **`types.ts`** — `NotificationCategory` (`workout_reminder`, `rest_day_encouragement`, `streak_protection`), `NotificationPayload`, `NotificationPreferences` with defaults (disabled, 8:00 AM).
- **`permissions.ts`** — `getNotificationPermissionStatus()`, `requestNotificationPermissions()` (soft-ask pattern), `hasPromptedForPermissions()`. Stores permission status in SecureStore.
- **`preferences.ts`** — `loadNotificationPreferences(userId)`, `saveNotificationPreferences(userId, prefs)`. User-scoped SecureStore key `notifications.prefs.v1.<userId>` with coerce pattern for safe deserialization.
- **`setup.ts`** — `initializeNotifications()`. Configures foreground notification handler. Called once at app startup (behind flag).
- **`scheduler.ts`** — `scheduleWorkoutReminder(userId)`, `cancelAllReminders()`. Schedules a daily local notification at the user's preferred time. Cancels existing reminders before scheduling.
- **`index.ts`** — Barrel export.

### Integration points

- **`app/_layout.tsx`** — Calls `initializeNotifications()` at startup.
- **`app/(app)/(tabs)/profile.tsx`** — Notification settings section with:
  - Permission request flow (undetermined → request → granted/denied)
  - Enable/disable reminders toggle (SegmentedControl ON/OFF)
  - Reminder time picker (ActionSheet with common hours)
  - Denied state with "Open Settings" link
- **`app.json`** — `expo-notifications` plugin is intentionally not registered while notifications ship dark. Add the native plugin config before turning the feature on for release builds.

### Translation keys

- `notifications.sectionTitle`, `notifications.reminders`, `notifications.reminderTime`
- `notifications.permissionNeeded`, `notifications.permissionBody`, `notifications.permissionAllow`, `notifications.permissionSkip`
- `notifications.permissionDenied`, `notifications.openSettings`

## Activation Checklist

1. Set `ENABLE_NOTIFICATIONS = true` in `src/config/featureFlags.ts`
2. Register the `expo-notifications` plugin in `app.json`
3. Run EAS build (native dependency requires rebuild)
4. Test permission flow on physical device (simulator has limited notification support)
5. Verify daily reminder fires at configured time

## Tests

- `__tests__/notification-scheduler.test.ts` — 5 tests covering scheduling, cancellation, and edge cases.

## Future Work

- Schedule notifications per `scheduled_routines` entries (not just daily)
- `rest_day_encouragement` and `streak_protection` notification categories
- Push notifications via Supabase Edge Functions (requires server-side setup)
