/**
 * Legacy plans module stub.
 * Phase 5: Schedule lives in Supabase (scheduled_routines). This module is kept
 * as a stub so tests that mock it continue to resolve. No runtime code imports it.
 */
import type { PlannedDay } from '../domain/schedule'

export async function loadPlans(_userId: string): Promise<Record<string, PlannedDay>> {
  return {}
}

export async function replacePlansSnapshot(
  _userId: string,
  _plans: Record<string, PlannedDay>,
): Promise<void> {}
