import * as SecureStore from 'expo-secure-store'

export type UnitsPreference = 'lb' | 'kg'

export interface ProfilePreferences {
  units: UnitsPreference
  restTimerSeconds: number
  /** Stable archetype ID for training identity. Undefined = not yet chosen (defaults to 'builder' at display). */
  archetypeId?: string
}

// v2 is user-scoped to prevent cross-account settings leakage on sign-out/sign-in.
const PREFERENCES_KEY_V2_PREFIX = 'profile.preferences.v2'
// v1 global key retained read-only during migration window for existing installs.
const PREFERENCES_KEY_V1_LEGACY = 'profile.preferences.v1'

const DEFAULT_PREFERENCES: ProfilePreferences = {
  units: 'kg',
  restTimerSeconds: 90,
}

function getPreferencesKeyV2(userId: string): string {
  return `${PREFERENCES_KEY_V2_PREFIX}.${userId}`
}

function coercePreferences(value: unknown): ProfilePreferences {
  if (!value || typeof value !== 'object') return DEFAULT_PREFERENCES

  const record = value as Partial<ProfilePreferences>
  const units: UnitsPreference = record.units === 'lb' ? 'lb' : 'kg'
  const restTimerSeconds = Number(record.restTimerSeconds)
  const archetypeId =
    typeof record.archetypeId === 'string' && record.archetypeId.length > 0
      ? record.archetypeId
      : undefined

  return {
    units,
    restTimerSeconds:
      Number.isFinite(restTimerSeconds) && restTimerSeconds >= 15
        ? Math.round(restTimerSeconds)
        : DEFAULT_PREFERENCES.restTimerSeconds,
    archetypeId,
  }
}

/**
 * Load profile preferences for a specific user.
 *
 * Migration path: on first call for a given user, if no v2 key exists, reads
 * from the legacy global v1 key and transparently migrates to the v2 key.
 * Callers that do not yet pass userId receive DEFAULT_PREFERENCES (safe fallback
 * while the migration is in flight).
 */
export async function loadProfilePreferences(userId?: string): Promise<ProfilePreferences> {
  if (!userId) {
    // Legacy call-site fallback — read from global v1 key until all callers
    // are updated to pass userId.
    try {
      const raw = await SecureStore.getItemAsync(PREFERENCES_KEY_V1_LEGACY)
      if (!raw) return DEFAULT_PREFERENCES
      return coercePreferences(JSON.parse(raw))
    } catch {
      return DEFAULT_PREFERENCES
    }
  }

  try {
    const v2Key = getPreferencesKeyV2(userId)
    const v2Raw = await SecureStore.getItemAsync(v2Key)

    if (v2Raw !== null) {
      return coercePreferences(JSON.parse(v2Raw))
    }

    // Migration window: promote legacy global preferences to user-scoped key.
    const v1Raw = await SecureStore.getItemAsync(PREFERENCES_KEY_V1_LEGACY)
    if (v1Raw !== null) {
      const migrated = coercePreferences(JSON.parse(v1Raw))
      try {
        await SecureStore.setItemAsync(v2Key, JSON.stringify(migrated))
      } catch {
        // Persistence failures should not block profile usage.
      }
      return migrated
    }

    return DEFAULT_PREFERENCES
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export async function saveProfilePreferences(
  preferencesOrUserId: ProfilePreferences | string,
  maybePreferences?: ProfilePreferences,
): Promise<void> {
  // Overloaded signature:
  //   saveProfilePreferences(userId: string, preferences: ProfilePreferences)  ← new
  //   saveProfilePreferences(preferences: ProfilePreferences)                   ← legacy
  let userId: string | undefined
  let preferences: ProfilePreferences

  if (typeof preferencesOrUserId === 'string') {
    userId = preferencesOrUserId
    preferences = maybePreferences!
  } else {
    userId = undefined
    preferences = preferencesOrUserId
  }

  const key = userId ? getPreferencesKeyV2(userId) : PREFERENCES_KEY_V1_LEGACY

  try {
    await SecureStore.setItemAsync(key, JSON.stringify(preferences))
  } catch {
    // Persistence failures should not block profile usage.
  }
}
