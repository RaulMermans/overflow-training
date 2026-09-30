// Phase 5: when false, routines-plans sync runs routines-only (no plan push/pull).
// Set to false to decommission plans/plan_days; push_plan_atomic is not called.
export const ENABLE_ROUTINE_PLAN_SYNC = false
export const ENABLE_WORKOUT_OUTBOX = true
export const ENABLE_FAIL_OPEN_ROUTINE_PLAN_SYNC = true
export const ENABLE_ACCOUNT_UPGRADE = true
export const ENABLE_CALENDAR_AGENDA = false
export const ENABLE_CALENDAR_CONSISTENCY_STRIP = false
export const ENABLE_SMART_SUGGESTIONS = false

// Phase 2: atomic routine save. When true, sync uses RPC upsert_routine_with_items_atomic
// instead of multi-step REST upsert → delete items → insert items. Set to false to roll back.
export const ENABLE_ATOMIC_ROUTINE_UPSERT = true

// Phase 4: new schedule source. When true, Calendar and Today read from scheduled_routines
// instead of loadPlans (SecureStore). Set to false to roll back to legacy plans.
export const useNewScheduleSource = true

// Phase 4: start flow uses start_scheduled_workout RPC. When true, start validates by date
// only and calls start_scheduled_workout(date). Set to false to use loadPlans + start_workout_from_routine.
export const useStartScheduledWorkoutRPC = true

// ── Progress v2 ────────────────────────────────────────────────
//
// Kill switch for the analytics-powered Progress tab (Phase 5).
//
// Set to `false` and push an OTA update (expo-updates) to roll
// back to the placeholder screen if a production issue is found.
// DO NOT remove this flag until Progress v2 has been stable for
// at least 2 full release cycles.
//
// Rollback SOP: docs/progress_v2_release_checklist.md § Rollback
export const ENABLE_PROGRESS_V2 = true

// ── Notifications ──────────────────────────────────────────
//
// Enables local notification scheduling (workout reminders).
// Requires EAS build with expo-notifications native module.
// Set to false to disable all notification features.
export const ENABLE_NOTIFICATIONS = false

// ── Google Calendar Sync ────────────────────────────────────
//
// Enables one-way sync of scheduled workouts to Google Calendar.
// App is source of truth; Google Calendar edits do not flow back.
// Requires EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID env var and Google
// Cloud Console: Calendar API enabled + iOS OAuth client configured.
// Set to false to disable the integration entry point entirely.
export const ENABLE_GOOGLE_CALENDAR_SYNC = true
