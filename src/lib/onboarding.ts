import * as SecureStore from 'expo-secure-store'
import { normalizeDbResult, requireSupabase } from './supabaseClient'
import { withTimeout } from './withTimeout'
import type { Database } from '../types/db'

type UserSettingsRow = Database['public']['Tables']['user_settings']['Row']

const ONBOARDING_KEY_PREFIX = 'onboarding.completed.v1'
const ONBOARDING_TIMEOUT_MS = 5000

function getOnboardingKey(userId: string): string {
  return `${ONBOARDING_KEY_PREFIX}.${userId}`
}

// ── Local cache helpers ───────────────────────────────────────────

async function loadLocalOnboardingCache(userId: string): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(getOnboardingKey(userId))
    return raw === 'true'
  } catch {
    return false
  }
}

async function setLocalOnboardingCache(userId: string, completed: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(getOnboardingKey(userId), completed ? 'true' : 'false')
  } catch {
    // Local cache failures should never crash the app.
  }
}

// ── Remote helpers ────────────────────────────────────────────────

async function loadRemoteOnboardingCompleted(
  userId: string,
): Promise<{ completed: boolean; found: boolean }> {
  const client = requireSupabase()
  const response = await withTimeout(
    client
      .from('user_settings')
      .select('onboarding_completed_at')
      .eq('user_id', userId)
      .maybeSingle(),
    ONBOARDING_TIMEOUT_MS,
  )

  const normalized = normalizeDbResult<Pick<UserSettingsRow, 'onboarding_completed_at'>>({
    data: response.data as Pick<UserSettingsRow, 'onboarding_completed_at'> | null,
    error: response.error,
  })

  if (normalized.error) {
    throw normalized.error
  }

  if (!normalized.data) {
    return { completed: false, found: false }
  }

  return {
    completed: normalized.data.onboarding_completed_at != null,
    found: true,
  }
}

async function markRemoteOnboardingCompleted(userId: string): Promise<void> {
  const client = requireSupabase()
  const now = new Date().toISOString()

  const response = await withTimeout(
    client
      .from('user_settings')
      .upsert(
        {
          user_id: userId,
          onboarding_completed_at: now,
        },
        { onConflict: 'user_id' },
      )
      .select('user_id')
      .maybeSingle(),
    ONBOARDING_TIMEOUT_MS,
  )

  const normalized = normalizeDbResult({
    data: response.data,
    error: response.error,
  })

  if (normalized.error) {
    throw normalized.error
  }
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Load onboarding completion status.
 *
 * Source of truth: `user_settings.onboarding_completed_at` in Supabase.
 * Local SecureStore cache is used for fast bootstrap and as a fallback
 * when the network is unavailable.
 *
 * Migration: if local cache says completed but remote has no record,
 * we backfill the remote state and return true (existing user on new device
 * or pre-migration user).
 */
export async function loadOnboardingCompleted(userId: string): Promise<boolean> {
  if (!userId) return false

  const localCompleted = await loadLocalOnboardingCache(userId)

  try {
    const remote = await loadRemoteOnboardingCompleted(userId)

    if (remote.completed) {
      // Remote says completed — update local cache if stale and return true.
      if (!localCompleted) {
        await setLocalOnboardingCache(userId, true)
      }
      return true
    }

    if (localCompleted) {
      // Local says completed but remote doesn't know yet — backfill remote.
      // This handles pre-migration users and cross-device scenarios where
      // the user completed onboarding before this migration was deployed.
      try {
        await markRemoteOnboardingCompleted(userId)
      } catch {
        // Backfill failed (offline, etc.) — will retry next bootstrap.
      }
      return true
    }

    // Neither local nor remote says completed.
    return false
  } catch {
    // Network/Supabase unavailable — fall back to local cache.
    return localCompleted
  }
}

/**
 * Mark onboarding as completed.
 *
 * Writes to Supabase (durable) and local cache (fast bootstrap).
 * If Supabase write fails, local cache is still set and remote
 * will be backfilled on next `loadOnboardingCompleted` call.
 */
export async function setOnboardingCompleted(
  userId: string,
  completed: boolean = true,
): Promise<void> {
  if (!userId) return

  // Always set local cache first for immediate routing correctness.
  await setLocalOnboardingCache(userId, completed)

  // Then persist to Supabase for durability.
  if (completed) {
    try {
      await markRemoteOnboardingCompleted(userId)
    } catch {
      // Remote write failed — will be backfilled on next bootstrap.
    }
  }
}
