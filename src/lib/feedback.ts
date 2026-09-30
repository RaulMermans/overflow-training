import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

// Gate all haptics: iOS only, respects reducedMotion
function canHaptic(reducedMotion = false): boolean {
  return !reducedMotion && Platform.OS === 'ios'
}

/**
 * Light impact — for primary CTA button presses.
 */
export function hapticImpactLight(reducedMotion = false): void {
  if (!canHaptic(reducedMotion)) return
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

/**
 * Light selection feedback — for filter pills, segmented controls, chip toggles.
 * Maps to iOS UIImpactFeedbackGenerator style light.
 */
export function hapticSelection(reducedMotion = false): void {
  if (!canHaptic(reducedMotion)) return
  void Haptics.selectionAsync().catch(() => {})
}

/**
 * Success notification — for finishing a workout or unlocking a trophy.
 */
export function hapticSuccess(reducedMotion = false): void {
  if (!canHaptic(reducedMotion)) return
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}

/**
 * Destructive feedback — for destructive confirmations (deleting a set, exercise).
 */
export function hapticDestructive(reducedMotion = false): void {
  if (!canHaptic(reducedMotion)) return
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
}

/**
 * Error notification — for validation failures or critical errors.
 */
export function hapticError(reducedMotion = false): void {
  hapticDestructive(reducedMotion)
}

// Legacy: kept for backward-compat, prefer the typed exports above.
interface GentleHapticOptions {
  reducedMotion?: boolean
  platformOS?: string
  vibrate?: (duration: number) => void
}

/** @deprecated Use hapticSelection() instead */
export function triggerGentleHaptic({
  reducedMotion = false,
  platformOS,
  vibrate,
}: GentleHapticOptions = {}): void {
  const os = platformOS ?? Platform.OS
  if (reducedMotion || os !== 'ios') return

  // Preserve legacy behavior when a custom vibration callback is supplied.
  if (vibrate) {
    vibrate(8)
    return
  }

  hapticSelection(false)
}

/** @deprecated Use hapticSelection() instead */
export function hapticLight(reducedMotion = false): void {
  hapticSelection(reducedMotion)
}

/** @deprecated Use hapticDestructive() instead */
export function hapticMedium(reducedMotion = false): void {
  hapticDestructive(reducedMotion)
}
