/** Notification categories used by the scheduler. */
export type NotificationCategory =
  | 'workout_reminder'
  | 'rest_day_encouragement'
  | 'streak_protection'

export interface NotificationPayload {
  category: NotificationCategory
  routineId?: string
  scheduledDate?: string
}

export interface NotificationPreferences {
  enabled: boolean
  /** Hour of day (0-23) to send workout reminders. Default 8. */
  reminderHour: number
  /** Minute of hour (0-59) to send workout reminders. Default 0. */
  reminderMinute: number
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  reminderHour: 8,
  reminderMinute: 0,
}
