import * as SecureStore from 'expo-secure-store'
import { uuidFromString } from '../../../lib/ids'
import type { PlannedDay } from '../../../domain/schedule'

const PUSH_CHECKPOINT_KEY_PREFIX = 'sync.routinesPlans.pushCheckpoint.v1'

export interface PlansPushCheckpoint {
  lastPlansHash: string | null
  lastPlansPushedAt: string | null
  lastFailedPlanHash?: string | null
}

const EMPTY_CHECKPOINT: PlansPushCheckpoint = {
  lastPlansHash: null,
  lastPlansPushedAt: null,
  lastFailedPlanHash: null,
}

function getPushCheckpointKey(userId: string): string {
  return `${PUSH_CHECKPOINT_KEY_PREFIX}.${userId}`
}

function parsePushCheckpoint(raw: string | null): PlansPushCheckpoint {
  if (!raw) return EMPTY_CHECKPOINT

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return EMPTY_CHECKPOINT
    }

    return {
      lastPlansHash:
        typeof (parsed as PlansPushCheckpoint).lastPlansHash === 'string'
          ? (parsed as PlansPushCheckpoint).lastPlansHash
          : null,
      lastPlansPushedAt:
        typeof (parsed as PlansPushCheckpoint).lastPlansPushedAt === 'string'
          ? (parsed as PlansPushCheckpoint).lastPlansPushedAt
          : null,
      lastFailedPlanHash:
        typeof (parsed as PlansPushCheckpoint).lastFailedPlanHash === 'string'
          ? (parsed as PlansPushCheckpoint).lastFailedPlanHash
          : null,
    }
  } catch {
    return EMPTY_CHECKPOINT
  }
}

export function computePlansPushHash(plans: Record<string, PlannedDay>): string {
  const normalized = Object.entries(plans)
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, day]) => ({
      date,
      routineId: day.routineId.trim(),
      note: day.note ?? null,
      updatedAt: day.updatedAt ?? null,
      clientUuid: day.clientUuid ?? null,
    }))

  return uuidFromString(JSON.stringify(normalized))
}

export async function loadPlansPushCheckpoint(userId: string): Promise<PlansPushCheckpoint> {
  if (!userId) return EMPTY_CHECKPOINT

  try {
    const raw = await SecureStore.getItemAsync(getPushCheckpointKey(userId))
    return parsePushCheckpoint(raw)
  } catch {
    return EMPTY_CHECKPOINT
  }
}

export async function clearPlansPushCheckpoint(userId: string): Promise<void> {
  if (!userId) return

  try {
    await SecureStore.deleteItemAsync(getPushCheckpointKey(userId))
  } catch {
    // Persistence failures should not crash app usage.
  }
}

export async function savePlansPushCheckpoint(
  userId: string,
  checkpoint: PlansPushCheckpoint,
): Promise<void> {
  if (!userId) return

  const payload: PlansPushCheckpoint = {
    lastPlansHash: typeof checkpoint.lastPlansHash === 'string' ? checkpoint.lastPlansHash : null,
    lastPlansPushedAt:
      typeof checkpoint.lastPlansPushedAt === 'string' ? checkpoint.lastPlansPushedAt : null,
    lastFailedPlanHash:
      typeof checkpoint.lastFailedPlanHash === 'string' ? checkpoint.lastFailedPlanHash : null,
  }

  try {
    await SecureStore.setItemAsync(getPushCheckpointKey(userId), JSON.stringify(payload))
  } catch {
    // Persistence failures should not crash app usage.
  }
}
