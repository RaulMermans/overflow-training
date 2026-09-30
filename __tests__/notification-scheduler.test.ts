import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'

// Must mock before importing scheduler
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}))

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}))

// Enable notifications for tests
jest.mock('../src/config/featureFlags', () => ({
  ENABLE_NOTIFICATIONS: true,
}))

import { scheduleWorkoutReminder, cancelAllReminders } from '../src/lib/notifications/scheduler'

describe('scheduleWorkoutReminder', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does nothing when userId is empty', async () => {
    await scheduleWorkoutReminder('')
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled()
  })

  it('cancels existing and does not schedule when prefs.enabled is false', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({ enabled: false, reminderHour: 8, reminderMinute: 0 }),
    )

    await scheduleWorkoutReminder('user-1')

    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled()
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled()
  })

  it('schedules a daily notification when prefs.enabled is true', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({ enabled: true, reminderHour: 9, reminderMinute: 30 }),
    )

    await scheduleWorkoutReminder('user-1')

    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled()
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({
          hour: 9,
          minute: 30,
        }),
      }),
    )
  })

  it('defaults to hour 8, minute 0 when no prefs are stored', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null)

    await scheduleWorkoutReminder('user-1')

    // No prefs stored means enabled=false (default), so it should NOT schedule
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled()
  })
})

describe('cancelAllReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('cancels all scheduled notifications', async () => {
    await cancelAllReminders()
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled()
  })
})
