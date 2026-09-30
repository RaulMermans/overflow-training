import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'

const PERMISSION_STATUS_KEY = 'notifications.permission.v1'

export type PermissionStatus = 'granted' | 'denied' | 'undetermined'

/**
 * Check current notification permission status without prompting the user.
 */
export async function getNotificationPermissionStatus(): Promise<PermissionStatus> {
  try {
    const { status } = await Notifications.getPermissionsAsync()
    return status as PermissionStatus
  } catch {
    return 'undetermined'
  }
}

/**
 * Request notification permissions from the user.
 * Returns the resulting permission status.
 */
export async function requestNotificationPermissions(): Promise<PermissionStatus> {
  try {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    })
    const result = status as PermissionStatus
    await savePermissionStatus(result)
    return result
  } catch {
    return 'denied'
  }
}

/**
 * Check if we've already asked the user about notifications.
 * Used for the soft-ask pattern: show an in-app explanation first.
 */
export async function hasPromptedForPermissions(): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(PERMISSION_STATUS_KEY)
    return raw !== null
  } catch {
    return false
  }
}

async function savePermissionStatus(status: PermissionStatus): Promise<void> {
  try {
    await SecureStore.setItemAsync(PERMISSION_STATUS_KEY, status)
  } catch {
    // Persistence failures should not block notification usage.
  }
}
