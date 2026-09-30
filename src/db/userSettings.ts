import type { Database } from '../types/db'
import { loadOnboardingProfile, saveOnboardingProfile } from '../lib/onboardingProfile'
import { normalizeDbResult, requireSupabase } from '../lib/supabaseClient'
import { withTimeout } from '../lib/withTimeout'

type UserSettingsRow = Database['public']['Tables']['user_settings']['Row']

const DEFAULT_WEEKLY_WORKOUTS_GOAL = 4
const MIN_WEEKLY_WORKOUTS_GOAL = 0
const MAX_WEEKLY_WORKOUTS_GOAL = 14
const SETTINGS_TIMEOUT_MS = 5000

function clampWeeklyGoal(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WEEKLY_WORKOUTS_GOAL
  const rounded = Math.round(value)
  return Math.min(MAX_WEEKLY_WORKOUTS_GOAL, Math.max(MIN_WEEKLY_WORKOUTS_GOAL, rounded))
}

function normalizeIso(value: string | null | undefined): string {
  if (!value) return new Date(0).toISOString()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return new Date(0).toISOString()
  return parsed.toISOString()
}

async function upsertRemoteWeeklyGoal(
  userId: string,
  weeklyGoal: number,
  updatedAt: string,
): Promise<UserSettingsRow | null> {
  const client = requireSupabase()
  const response = await withTimeout(
    client
      .from('user_settings')
      .upsert(
        {
          user_id: userId,
          weekly_workouts_goal: clampWeeklyGoal(weeklyGoal),
          updated_at: updatedAt,
        },
        { onConflict: 'user_id' },
      )
      .select('*')
      .maybeSingle(),
    SETTINGS_TIMEOUT_MS,
  )

  const normalized = normalizeDbResult<UserSettingsRow>({
    data: response.data as UserSettingsRow | null,
    error: response.error,
  })

  if (normalized.error) {
    throw normalized.error
  }

  return normalized.data
}

export async function ensureUserSettingsRow(userId: string): Promise<{
  data: UserSettingsRow | null
  error: Error | null
}> {
  if (!userId) {
    return { data: null, error: new Error('Missing user id.') }
  }

  try {
    const client = requireSupabase()
    const response = await withTimeout(
      client
        .from('user_settings')
        .upsert(
          {
            user_id: userId,
          },
          { onConflict: 'user_id' },
        )
        .select('*')
        .maybeSingle(),
      SETTINGS_TIMEOUT_MS,
    )

    return normalizeDbResult<UserSettingsRow>({
      data: response.data as UserSettingsRow | null,
      error: response.error,
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Failed to ensure user settings.'),
    }
  }
}

export async function loadWeeklyWorkoutsGoal(userId: string): Promise<number> {
  if (!userId) return DEFAULT_WEEKLY_WORKOUTS_GOAL

  const localProfile = await loadOnboardingProfile(userId)
  const localGoal = clampWeeklyGoal(localProfile.weeklyGoal)
  const localUpdatedAt = localProfile.weeklyGoalUpdatedAt ?? null
  const localUpdatedAtIso = normalizeIso(localUpdatedAt)

  try {
    const client = requireSupabase()
    const response = await withTimeout(
      client.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
      SETTINGS_TIMEOUT_MS,
    )

    const normalized = normalizeDbResult<UserSettingsRow>({
      data: response.data as UserSettingsRow | null,
      error: response.error,
    })

    if (normalized.error) {
      return localGoal
    }

    const remote = normalized.data
    if (!remote) {
      const optimisticUpdatedAt = localUpdatedAt ?? new Date().toISOString()
      try {
        const remoteUpsert = await upsertRemoteWeeklyGoal(userId, localGoal, optimisticUpdatedAt)
        await saveOnboardingProfile(userId, {
          weeklyGoal: localGoal,
          weeklyGoalUpdatedAt: remoteUpsert?.updated_at ?? optimisticUpdatedAt,
        })
      } catch {
        await saveOnboardingProfile(userId, {
          weeklyGoal: localGoal,
          weeklyGoalUpdatedAt: optimisticUpdatedAt,
        })
      }
      return localGoal
    }

    const remoteGoal = clampWeeklyGoal(remote.weekly_workouts_goal)
    const remoteUpdatedAt = remote.updated_at ?? new Date().toISOString()
    const remoteUpdatedAtIso = normalizeIso(remoteUpdatedAt)

    if (!localUpdatedAt || remoteUpdatedAtIso > localUpdatedAtIso) {
      await saveOnboardingProfile(userId, {
        weeklyGoal: remoteGoal,
        weeklyGoalUpdatedAt: remoteUpdatedAt,
      })
      return remoteGoal
    }

    if (localGoal !== remoteGoal || localUpdatedAtIso > remoteUpdatedAtIso) {
      try {
        const remoteUpsert = await upsertRemoteWeeklyGoal(userId, localGoal, localUpdatedAt)
        await saveOnboardingProfile(userId, {
          weeklyGoal: localGoal,
          weeklyGoalUpdatedAt: remoteUpsert?.updated_at ?? localUpdatedAt,
        })
      } catch {
        await saveOnboardingProfile(userId, {
          weeklyGoal: localGoal,
          weeklyGoalUpdatedAt: localUpdatedAt,
        })
      }
      return localGoal
    }

    await saveOnboardingProfile(userId, {
      weeklyGoal: localGoal,
      weeklyGoalUpdatedAt: localUpdatedAt,
    })
    return localGoal
  } catch {
    return localGoal
  }
}

export async function saveWeeklyWorkoutsGoal(userId: string, weeklyGoal: number): Promise<number> {
  if (!userId) return clampWeeklyGoal(weeklyGoal)

  const normalizedGoal = clampWeeklyGoal(weeklyGoal)
  const optimisticUpdatedAt = new Date().toISOString()

  await saveOnboardingProfile(userId, {
    weeklyGoal: normalizedGoal,
    weeklyGoalUpdatedAt: optimisticUpdatedAt,
  })

  try {
    const remote = await upsertRemoteWeeklyGoal(userId, normalizedGoal, optimisticUpdatedAt)
    if (remote) {
      await saveOnboardingProfile(userId, {
        weeklyGoal: clampWeeklyGoal(remote.weekly_workouts_goal),
        weeklyGoalUpdatedAt: remote.updated_at ?? optimisticUpdatedAt,
      })
      return clampWeeklyGoal(remote.weekly_workouts_goal)
    }
  } catch {
    // Keep local cache and retry during future reads.
  }

  return normalizedGoal
}
