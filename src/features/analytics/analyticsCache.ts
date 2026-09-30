// ============================================================
// Analytics Cache — Phase 2
// ============================================================
//
// RESPONSIBILITIES:
//   • Centralized TanStack Query key factory (stable, typed keys)
//   • Default staleTime / gcTime constants
//   • Invalidation helpers called from mutation sites
//
// KEY HIERARCHY:
//   ['analytics']                             — root, invalidate all
//   ['analytics', 'overview', rangeDays]      — progress overview
//   ['analytics', 'weekly-workouts', rangeDays]
//   ['analytics', 'weekly-volume', rangeDays]
//   ['analytics', 'muscle-balance', rangeDays]
//   ['analytics', 'exercise-trend', exerciseId, rangeDays]
//
// CACHE POLICY:
//   staleTime  = 5 min  — fresh enough for in-session use
//   gcTime     = 45 min — keep inactive queries warm between tab switches
//
// INVALIDATION TRIGGERS (wired in Phase 2.5b):
//   • workout completed / set edited → invalidate ALL analytics
//   • exercise swapped               → invalidate exercise-trend for old/new id
//   • check-in added                 → invalidate overview
// ============================================================

import { QueryClient } from '@tanstack/react-query'

// ──────────────────────────────────────────────────────────────
// Timing constants
// ──────────────────────────────────────────────────────────────

export const ANALYTICS_STALE_TIME = 5 * 60 * 1000 // 5 minutes
export const ANALYTICS_GC_TIME = 45 * 60 * 1000 // 45 minutes

// ──────────────────────────────────────────────────────────────
// Key factory (const-typed for TanStack Query v5 compatibility)
// ──────────────────────────────────────────────────────────────

export const analyticsKeys = {
  /** Root prefix — use to invalidate ALL analytics at once */
  all: ['analytics'] as const,

  overview: (rangeDays: number) => ['analytics', 'overview', rangeDays] as const,

  weeklyWorkouts: (rangeDays: number) => ['analytics', 'weekly-workouts', rangeDays] as const,

  weeklyVolume: (rangeDays: number) => ['analytics', 'weekly-volume', rangeDays] as const,

  muscleBalance: (rangeDays: number) => ['analytics', 'muscle-balance', rangeDays] as const,

  exerciseTrend: (exerciseDefinitionId: string, rangeDays: number) =>
    ['analytics', 'exercise-trend', exerciseDefinitionId, rangeDays] as const,
} as const

// ──────────────────────────────────────────────────────────────
// Invalidation helpers
// ──────────────────────────────────────────────────────────────

/**
 * Invalidates ALL analytics queries.
 * Call after any mutation that affects training data
 * (workout completed, sets edited, exercise swapped).
 */
export function invalidateAllAnalytics(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: analyticsKeys.all })
}

/**
 * Invalidates only the progress overview (e.g., after a check-in update
 * that does not change strength/volume data).
 */
export function invalidateProgressOverview(
  queryClient: QueryClient,
  rangeDays: number,
): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: analyticsKeys.overview(rangeDays) })
}

/**
 * Invalidates the e1RM trend for a specific exercise
 * (e.g., after the user swaps an exercise in their routine).
 */
export function invalidateExerciseTrend(
  queryClient: QueryClient,
  exerciseDefinitionId: string,
  rangeDays: number,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: analyticsKeys.exerciseTrend(exerciseDefinitionId, rangeDays),
  })
}
