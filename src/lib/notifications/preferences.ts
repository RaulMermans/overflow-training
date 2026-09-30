import * as SecureStore from 'expo-secure-store'
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from './types'

const KEY_PREFIX = 'notifications.prefs.v1'

function getKey(userId: string): string {
  return `${KEY_PREFIX}.${userId}`
}

function coerce(value: unknown): NotificationPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_NOTIFICATION_PREFERENCES }

  const record = value as Partial<NotificationPreferences>
  const enabled = record.enabled === true
  const hour = Number(record.reminderHour)
  const minute = Number(record.reminderMinute)

  return {
    enabled,
    reminderHour:
      Number.isFinite(hour) && hour >= 0 && hour <= 23
        ? Math.round(hour)
        : DEFAULT_NOTIFICATION_PREFERENCES.reminderHour,
    reminderMinute:
      Number.isFinite(minute) && minute >= 0 && minute <= 59
        ? Math.round(minute)
        : DEFAULT_NOTIFICATION_PREFERENCES.reminderMinute,
  }
}

export async function loadNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  if (!userId) return { ...DEFAULT_NOTIFICATION_PREFERENCES }

  try {
    const raw = await SecureStore.getItemAsync(getKey(userId))
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFERENCES }
    return coerce(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  }
}

export async function saveNotificationPreferences(
  userId: string,
  prefs: NotificationPreferences,
): Promise<void> {
  if (!userId) return

  try {
    await SecureStore.setItemAsync(getKey(userId), JSON.stringify(coerce(prefs)))
  } catch {
    // Persistence failures should not block notification usage.
  }
}
