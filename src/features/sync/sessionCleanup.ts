import { clearFavoritesCache } from '../../db/favorites'
import { clearRoutinesCache } from '../../lib/routines'
import { clearRoutinesPlansMigrationMarker } from './routinesPlans/migrateLocalToCloud'
import { clearPlansPushCheckpoint } from './routinesPlans/pushCheckpoint'
import { clearRoutinesPlansQuarantine } from './routinesPlans/quarantineStore'
import { clearOutboxQueue, clearWorkoutProjectionForUser } from './outbox/fileStore'
import { clearAccountUpgradeMarker, runAccountUpgrade } from '../accountUpgrade/runAccountUpgrade'

export async function resetLocalSyncArtifactsForUser(userId: string): Promise<void> {
  if (!userId) return

  await Promise.all([
    clearOutboxQueue(userId),
    clearWorkoutProjectionForUser(userId),
    clearRoutinesPlansMigrationMarker(userId),
  ])
}

/**
 * Targeted repair for the schedule (routines + plans) sync pipeline.
 *
 * Clears the migration marker and push checkpoint so the next sync cycle
 * re-runs from a clean state, then immediately re-runs the account upgrade
 * (forced) so that legacy exercise refs are re-resolved with the current
 * exercise definition index.
 *
 * This is a non-destructive alternative to a full local sync reset — it does
 * not clear the workout outbox or workout projection.
 */
export async function repairScheduleDataForUser(userId: string): Promise<void> {
  if (!userId) return

  await Promise.all([
    clearRoutinesPlansMigrationMarker(userId),
    clearPlansPushCheckpoint(userId),
    clearRoutinesPlansQuarantine(userId),
    clearAccountUpgradeMarker(userId),
  ])

  await runAccountUpgrade(userId, { forced: true })
}

export async function cleanupUserSessionBeforeSignOut(userId: string): Promise<void> {
  if (!userId) return

  await resetLocalSyncArtifactsForUser(userId)
  const caches = [clearRoutinesCache(userId), clearFavoritesCache(userId)]
  await Promise.all(caches)
}
