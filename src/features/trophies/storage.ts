import * as SecureStore from 'expo-secure-store'

export interface TrophyCounters {
  totalWorkouts: number
  activeDaysTotal: number
  /** Compact 'YYYYMMDD' strings, newest first, capped at 60 entries */
  recentActiveDays: string[]
  currentStreak: number
  longestStreak: number
  totalPRs: number
  totalRoutinesCreated: number
  totalFavoritesAdded: number
  totalVolumeKg: number
}

export interface TrophyState {
  version: 1
  unlocked: Record<string, { unlockedAt: string }>
  counters: TrophyCounters
  /** ISO string of the very first workout completion */
  firstWorkoutAt?: string
  lastUpdatedAt: string
}

const KEY_PREFIX = 'trophies.state.v1'

function getKey(userId: string): string {
  return `${KEY_PREFIX}.${userId}`
}

export const DEFAULT_TROPHY_STATE: TrophyState = {
  version: 1,
  unlocked: {},
  counters: {
    totalWorkouts: 0,
    activeDaysTotal: 0,
    recentActiveDays: [],
    currentStreak: 0,
    longestStreak: 0,
    totalPRs: 0,
    totalRoutinesCreated: 0,
    totalFavoritesAdded: 0,
    totalVolumeKg: 0,
  },
  lastUpdatedAt: new Date(0).toISOString(),
}

export async function loadTrophyState(userId: string): Promise<TrophyState> {
  if (!userId) return { ...DEFAULT_TROPHY_STATE }

  try {
    const raw = await SecureStore.getItemAsync(getKey(userId))
    if (!raw) return { ...DEFAULT_TROPHY_STATE }

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_TROPHY_STATE }

    const state = parsed as Partial<TrophyState>
    if (state.version !== 1) return { ...DEFAULT_TROPHY_STATE }

    // Merge with defaults to handle missing fields from older versions
    return {
      version: 1,
      unlocked: state.unlocked ?? {},
      counters: {
        ...DEFAULT_TROPHY_STATE.counters,
        ...(state.counters ?? {}),
      },
      firstWorkoutAt: state.firstWorkoutAt,
      lastUpdatedAt: state.lastUpdatedAt ?? DEFAULT_TROPHY_STATE.lastUpdatedAt,
    }
  } catch {
    return { ...DEFAULT_TROPHY_STATE }
  }
}

export async function saveTrophyState(userId: string, state: TrophyState): Promise<void> {
  if (!userId) return

  try {
    await SecureStore.setItemAsync(getKey(userId), JSON.stringify(state))
  } catch {
    // Persistence failures should never crash the app.
    if (__DEV__) {
      console.warn('[trophies] Failed to persist trophy state')
    }
  }
}
