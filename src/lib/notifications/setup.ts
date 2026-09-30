import * as Notifications from 'expo-notifications'
import { ENABLE_NOTIFICATIONS } from '../../config/featureFlags'

/**
 * Configure notification handler for foreground behavior.
 * Call once at app startup (behind ENABLE_NOTIFICATIONS flag).
 */
export function initializeNotifications(): void {
  if (!ENABLE_NOTIFICATIONS) return

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}
