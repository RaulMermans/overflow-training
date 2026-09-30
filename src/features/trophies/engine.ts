import type { TrophyDefinition } from './catalog'
import type { TrophyState, TrophyCounters } from './storage'
import { DEFAULT_TROPHY_STATE } from './storage'

export type TrophyEvent =
  | { type: 'WORKOUT_COMPLETED'; at: string }
  | {
      type: 'CHECKIN_SAVED'
      period: 'day1' | 'month1' | 'month3' | 'month6' | 'month12'
      at: string
    }
  | { type: 'PR_ACHIEVED'; at: string }
  | { type: 'ROUTINE_CREATED'; at: string }
  | { type: 'FAVORITE_ADDED'; at: string }
  | { type: 'VOLUME_RECORDED'; volumeKg: number; at: string }

export interface EvaluationResult {
  newlyUnlocked: string[]
  updatedState: TrophyState
}

// ── Date utilities ────────────────────────────────────────────────────────────

/** Convert an ISO string to compact 'YYYYMMDD' format */
function toCompactDate(isoOrNow: string): string {
  const d = new Date(isoOrNow)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** Parse a compact 'YYYYMMDD' string to a Date (local time midnight) */
function parseCompact(compact: string): Date {
  const y = parseInt(compact.slice(0, 4), 10)
  const m = parseInt(compact.slice(4, 6), 10) - 1
  const d = parseInt(compact.slice(6, 8), 10)
  return new Date(y, m, d)
}

/** Return the compact date string for the day before the given compact date */
function prevCompactDay(compact: string): string {
  const d = parseCompact(compact)
  d.setDate(d.getDate() - 1)
  return toCompactDate(d.toISOString())
}

/** Milliseconds per day */
const MS_PER_DAY = 86_400_000

/** Number of full days between two ISO strings (rounded down) */
function daysBetween(fromISO: string, toISO: string): number {
  return Math.floor((new Date(toISO).getTime() - new Date(fromISO).getTime()) / MS_PER_DAY)
}

// ── Streak computation ────────────────────────────────────────────────────────

/**
 * Compute the current streak from a list of compact active-day strings.
 * The list must be sorted newest-first (index 0 = most recent).
 * A streak is valid if it includes today or yesterday.
 */
function computeStreakFromRecentDays(days: string[], todayCompact: string): number {
  if (days.length === 0) return 0

  const yesterday = prevCompactDay(todayCompact)

  // Streak must start from today or yesterday
  if (days[0] !== todayCompact && days[0] !== yesterday) return 0

  let streak = 1
  for (let i = 1; i < days.length; i++) {
    const expected = prevCompactDay(days[i - 1])
    if (days[i] === expected) {
      streak++
    } else {
      break
    }
  }
  return streak
}

// ── State cloning ─────────────────────────────────────────────────────────────

function cloneState(state: TrophyState): TrophyState {
  return {
    version: 1,
    unlocked: { ...state.unlocked },
    counters: {
      ...state.counters,
      recentActiveDays: [...state.counters.recentActiveDays],
    },
    firstWorkoutAt: state.firstWorkoutAt,
    lastUpdatedAt: state.lastUpdatedAt,
  }
}

// ── Trophy evaluation ─────────────────────────────────────────────────────────

function canUnlock(
  def: TrophyDefinition,
  event: TrophyEvent,
  counters: TrophyCounters,
  unlocked: Record<string, { unlockedAt: string }>,
  now: string,
  firstWorkoutAt?: string,
): boolean {
  // prerequisite-based trophies
  if (def.prerequisiteIds && def.prerequisiteIds.length > 0) {
    return def.prerequisiteIds.every((pid) => pid in unlocked)
  }

  // first_year: special time-based check
  if (def.id === 'first_year') {
    if (!firstWorkoutAt) return false
    return daysBetween(firstWorkoutAt, now) >= 365
  }

  // threshold-based trophies
  if (def.thresholdMetric !== undefined && def.thresholdValue !== undefined) {
    const current = counters[def.thresholdMetric]
    if (typeof current === 'number') {
      return current >= def.thresholdValue
    }
    return false
  }

  // event-triggered trophies
  if (def.triggerEvent) {
    if (event.type !== def.triggerEvent) return false
    if (def.triggerEventPeriod) {
      return 'period' in event && event.period === def.triggerEventPeriod
    }
    return true
  }

  return false
}

// ── Main exported function ────────────────────────────────────────────────────

export function evaluateTrophies(input: {
  event: TrophyEvent
  state: TrophyState
  catalog: readonly TrophyDefinition[]
  now?: string
}): EvaluationResult {
  const { event, state, catalog } = input
  const now = input.now ?? new Date().toISOString()
  const todayCompact = toCompactDate(now)

  const nextState = cloneState(state)
  const newlyUnlocked: string[] = []

  // ── Step 1: Update counters ────────────────────────────────────────

  if (event.type === 'WORKOUT_COMPLETED') {
    nextState.counters.totalWorkouts += 1

    // Track active day (de-duplicate same-day workouts)
    if (!nextState.counters.recentActiveDays.includes(todayCompact)) {
      nextState.counters.recentActiveDays.unshift(todayCompact)
      // Cap at 60 entries to stay within SecureStore size limits
      if (nextState.counters.recentActiveDays.length > 60) {
        nextState.counters.recentActiveDays.pop()
      }
      nextState.counters.activeDaysTotal += 1
    }

    // Recompute streak
    nextState.counters.currentStreak = computeStreakFromRecentDays(
      nextState.counters.recentActiveDays,
      todayCompact,
    )
    nextState.counters.longestStreak = Math.max(
      nextState.counters.longestStreak,
      nextState.counters.currentStreak,
    )

    // Record first workout timestamp
    if (!nextState.firstWorkoutAt) {
      nextState.firstWorkoutAt = event.at
    }
  } else if (event.type === 'PR_ACHIEVED') {
    nextState.counters.totalPRs += 1
  } else if (event.type === 'ROUTINE_CREATED') {
    nextState.counters.totalRoutinesCreated += 1
  } else if (event.type === 'FAVORITE_ADDED') {
    nextState.counters.totalFavoritesAdded += 1
  } else if (event.type === 'VOLUME_RECORDED') {
    nextState.counters.totalVolumeKg += event.volumeKg
  }
  // CHECKIN_SAVED: no counter update — the specific period drives the event-triggered trophy

  // ── Step 2: Two-pass trophy evaluation ────────────────────────────

  // Pass 1: trophies without prerequisiteIds (and not first_year)
  for (const def of catalog) {
    if (def.id in nextState.unlocked) continue
    if (def.prerequisiteIds) continue
    if (def.id === 'first_year') continue

    if (
      canUnlock(def, event, nextState.counters, nextState.unlocked, now, nextState.firstWorkoutAt)
    ) {
      nextState.unlocked[def.id] = { unlockedAt: now }
      newlyUnlocked.push(def.id)
    }
  }

  // Pass 2: prerequisite + first_year trophies (can now reference trophies unlocked in pass 1)
  for (const def of catalog) {
    if (def.id in nextState.unlocked) continue
    if (!def.prerequisiteIds && def.id !== 'first_year') continue

    if (
      canUnlock(def, event, nextState.counters, nextState.unlocked, now, nextState.firstWorkoutAt)
    ) {
      nextState.unlocked[def.id] = { unlockedAt: now }
      newlyUnlocked.push(def.id)
    }
  }

  nextState.lastUpdatedAt = now

  return { newlyUnlocked, updatedState: nextState }
}

// Export for tests
export { toCompactDate, computeStreakFromRecentDays, daysBetween, DEFAULT_TROPHY_STATE }
