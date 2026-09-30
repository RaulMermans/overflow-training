import { useQuery } from '@tanstack/react-query'
import { fetchExerciseE1RMTrend } from '../analyticsClient'
import { ANALYTICS_GC_TIME, ANALYTICS_STALE_TIME, analyticsKeys } from '../analyticsCache'
import { deriveLoadState, shapeExerciseTrend } from '../analyticsService'
import type { AnalyticsQuery, LoadState, TrendModel } from '../analyticsTypes'

const DEFAULT_RANGE_DAYS = 28

export type UseExerciseTrendResult = {
  data: TrendModel | undefined
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  loadState: LoadState
}

/**
 * Returns a shaped TrendModel for a specific exercise's e1RM progression.
 * Data is fetched from analytics.exercise_e1rm_weekly (Phase 1 view).
 *
 * Missing weeks in the training history are represented as null points
 * (not zero-filled) so that training gaps are visually distinct from zero strength.
 *
 * Requires exerciseDefinitionId. Returns an empty/loading placeholder if not provided.
 *
 * UNIT NOTE: currentBestKg and point values are in kg. Use fromWeightKg() at render time.
 */
export function useExerciseTrend(
  query: Pick<AnalyticsQuery, 'rangeDays' | 'exerciseDefinitionId'>,
): UseExerciseTrendResult {
  const rangeDays = query.rangeDays ?? DEFAULT_RANGE_DAYS
  const exerciseDefinitionId = query.exerciseDefinitionId ?? ''
  const enabled = exerciseDefinitionId.length > 0

  const result = useQuery({
    queryKey: analyticsKeys.exerciseTrend(exerciseDefinitionId, rangeDays),
    queryFn: () => fetchExerciseE1RMTrend(exerciseDefinitionId, rangeDays),
    enabled,
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    retry: 2,
    select: (rows) => shapeExerciseTrend(exerciseDefinitionId, rows),
  })

  const loadState = deriveLoadState({
    isLoading: result.isLoading || !enabled,
    isError: result.isError,
    isEmpty: result.data?.isEmpty ?? !enabled,
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error as Error | null,
    refetch: result.refetch,
    loadState,
  }
}
