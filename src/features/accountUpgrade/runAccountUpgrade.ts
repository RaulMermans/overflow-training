import * as SecureStore from 'expo-secure-store'
import { ENABLE_ACCOUNT_UPGRADE } from '../../config/featureFlags'
import { loadRoutines, replaceRoutinesSnapshot } from '../../lib/routines'
import { fetchExerciseDefinitionSyncIndex } from '../../db/workouts'
import { migrateLocalRoutinesAndPlansForSync } from '../sync/routinesPlans/migrateLocalToCloud'
import { repairRoutineExerciseRefs } from './repairRoutineExerciseRefs'
import type { AccountUpgradeResult, AccountUpgradeStepResult } from './types'

const UPGRADE_VERSION_KEY_PREFIX = 'account.upgrade.v2'
const CURRENT_UPGRADE_VERSION = '2'

function getUpgradeKey(userId: string): string {
  return `${UPGRADE_VERSION_KEY_PREFIX}.${userId}`
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message
    if (typeof msg === 'string') return msg
  }
  return String(error ?? 'unknown error')
}

export async function clearAccountUpgradeMarker(userId: string): Promise<void> {
  if (!userId) return
  try {
    await SecureStore.deleteItemAsync(getUpgradeKey(userId))
  } catch {
    // Persistence failures should not crash app usage.
  }
}

export async function runAccountUpgrade(
  userId: string,
  options: { forced?: boolean } = {},
): Promise<AccountUpgradeResult> {
  if (!userId) {
    return {
      userId: '',
      steps: [],
      legacyItemsScanned: 0,
      legacyItemsResolved: 0,
      legacyItemsUnresolved: 0,
      routinesDropped: 0,
      repairForced: false,
    }
  }

  if (!ENABLE_ACCOUNT_UPGRADE) {
    return {
      userId,
      steps: [],
      legacyItemsScanned: 0,
      legacyItemsResolved: 0,
      legacyItemsUnresolved: 0,
      routinesDropped: 0,
      repairForced: false,
    }
  }

  if (!options.forced) {
    try {
      const existing = await SecureStore.getItemAsync(getUpgradeKey(userId))
      if (existing === CURRENT_UPGRADE_VERSION) {
        return {
          userId,
          steps: [],
          legacyItemsScanned: 0,
          legacyItemsResolved: 0,
          legacyItemsUnresolved: 0,
          routinesDropped: 0,
          repairForced: false,
        }
      }
    } catch {
      // If we can't read the marker, proceed with upgrade.
    }
  }

  const steps: AccountUpgradeStepResult[] = []
  let legacyItemsScanned = 0
  let legacyItemsResolved = 0
  let legacyItemsUnresolved = 0
  let routinesDropped = 0

  // Step 1: migrate_v2 — re-run deduplication with new v2 marker so legacy
  // accounts that already completed v1 get the updated normalization pass.
  const migrateStep = await runStep('migrate_v2', async () => {
    const result = await migrateLocalRoutinesAndPlansForSync(userId)
    return { applied: result.applied }
  })
  steps.push(migrateStep)

  // Step 2: repair_exercise_refs — canonicalize legacy exercise IDs using the
  // remote exercise definition index.
  const repairStep = await runStep('repair_exercise_refs', async () => {
    const { data: exerciseIndex, error: indexError } = await fetchExerciseDefinitionSyncIndex()
    if (indexError) throw indexError

    if (!exerciseIndex || exerciseIndex.length === 0) {
      return { applied: false, skipped: true }
    }

    const routines = await loadRoutines(userId)
    if (routines.length === 0) {
      return { applied: false, skipped: true }
    }

    const repairResult = repairRoutineExerciseRefs(routines, exerciseIndex)

    await replaceRoutinesSnapshot(userId, repairResult.routines)

    legacyItemsScanned = repairResult.itemsScanned
    legacyItemsResolved = repairResult.itemsResolved + repairResult.itemsRewritten
    legacyItemsUnresolved = repairResult.itemsUnresolved
    routinesDropped = repairResult.droppedRoutineIds.length

    return { applied: true }
  })
  steps.push(repairStep)

  // Write the upgrade marker regardless of step errors so we don't retry an
  // expensive network fetch on every session start. Users can trigger a forced
  // repair via the SyncStatusPill CTA.
  try {
    await SecureStore.setItemAsync(getUpgradeKey(userId), CURRENT_UPGRADE_VERSION)
  } catch {
    // Persistence failures should not crash app usage.
  }

  return {
    userId,
    steps,
    legacyItemsScanned,
    legacyItemsResolved,
    legacyItemsUnresolved,
    routinesDropped,
    repairForced: options.forced === true,
  }
}

async function runStep(
  stepId: string,
  fn: () => Promise<{ applied: boolean; skipped?: boolean }>,
): Promise<AccountUpgradeStepResult> {
  try {
    const { applied, skipped = false } = await fn()
    return { stepId, applied, skipped, error: null }
  } catch (err) {
    return { stepId, applied: false, skipped: false, error: readErrorMessage(err) }
  }
}
