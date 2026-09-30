import { TROPHY_CATALOG } from './catalog'
import type { TrophyEvent } from './engine'
import { evaluateTrophies } from './engine'
import { loadTrophyState, saveTrophyState } from './storage'

/**
 * Handle a trophy event for the given user.
 * Loads state, evaluates trophies, persists if needed, and returns newly unlocked IDs.
 * Never throws — returns [] on any error so callers never need try/catch.
 *
 * Note: The following trophies are defined in the catalog but have no event emitter in v1:
 *   - volume_1000kg: requires VOLUME_RECORDED (emitter not yet wired)
 *   - checkin_*: requires CHECKIN_SAVED (check-in feature not yet built)
 *   - routine_created, favorite_added: not wired in v1 to keep diffs minimal
 *   - first_pr, prs_*: not auto-detected from workout sets in v1
 * These will unlock automatically once their respective events are emitted.
 */
export async function handleTrophyEvent(event: TrophyEvent, userId: string): Promise<string[]> {
  if (!userId) return []

  try {
    const now = new Date().toISOString()
    const state = await loadTrophyState(userId)

    const { newlyUnlocked, updatedState } = evaluateTrophies({
      event,
      state,
      catalog: TROPHY_CATALOG,
      now,
    })

    // Always save on WORKOUT_COMPLETED to persist counter increments,
    // even when no trophies unlock. For other events, only save if needed.
    const shouldSave = newlyUnlocked.length > 0 || event.type === 'WORKOUT_COMPLETED'

    if (shouldSave) {
      await saveTrophyState(userId, updatedState)
    }

    return newlyUnlocked
  } catch {
    return []
  }
}
