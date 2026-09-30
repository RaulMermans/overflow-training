export { initializeNotifications } from './setup'
export {
  getNotificationPermissionStatus,
  requestNotificationPermissions,
  hasPromptedForPermissions,
} from './permissions'
export { loadNotificationPreferences, saveNotificationPreferences } from './preferences'
export { scheduleWorkoutReminder, cancelAllReminders } from './scheduler'
export type { NotificationCategory, NotificationPayload, NotificationPreferences } from './types'
export { DEFAULT_NOTIFICATION_PREFERENCES } from './types'
