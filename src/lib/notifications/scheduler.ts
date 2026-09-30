import * as Notifications from 'expo-notifications'
import { ENABLE_NOTIFICATIONS } from '../../config/featureFlags'
import { loadNotificationPreferences } from './preferences'
import type { NotificationPayload } from './types'

/**
 * Schedule a daily workout reminder based on user preferences.
 * Cancels any existing reminders before scheduling a new one.
 *
 * Call after:
 * - User changes reminder time in settings
 * - User enables notifications
 * - App comes to foreground (to keep schedule fresh)
 */
export async function scheduleWorkoutReminder(userId: string): Promise<void> {
  if (!ENABLE_NOTIFICATIONS || !userId) return

  await cancelAllReminders()

  const prefs = await loadNotificationPreferences(userId)
  if (!prefs.enabled) return

  const payload: NotificationPayload = {
    category: 'workout_reminder',
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Time to train',
      body: "You have a workout scheduled — let's go!",
      data: payload as unknown as Record<string, unknown>,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: prefs.reminderHour,
      minute: prefs.reminderMinute,
    },
  })
}

/**
 * Cancel all scheduled notification reminders.
 */
export async function cancelAllReminders(): Promise<void> {
  if (!ENABLE_NOTIFICATIONS) return

  try {
    await Notifications.cancelAllScheduledNotificationsAsync()
  } catch {
    // Best-effort: failure should not block app usage.
  }
}
