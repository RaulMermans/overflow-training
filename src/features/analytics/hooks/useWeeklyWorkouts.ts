import { useQuery } from '@tanstack/react-query'
import { fetchWeeklyWorkouts } from '../analyticsClient'
import { ANALYTICS_GC_TIME, ANALYTICS_STALE_TIME, analyticsKeys } from '../analyticsCache'
import { deriveLoadState, shapeWeeklyWorkouts } from '../analyticsService'
import type { AnalyticsQuery, LoadState, WeeklyWorkoutsModel } from '../analyticsTypes'

const DEFAULT_RANGE_DAYS = 28

export type UseWeeklyWorkoutsResult = {
  data: WeeklyWorkoutsModel | undefined
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  loadState: LoadState
}

/**
 * Returns a shaped WeeklyWorkoutsModel for the given rangeDays window.
 * Data is fetched from analytics.weekly_workouts (Phase 1 view).
 * Series is contiguous and zero-filled for weeks with no workouts.
 */
export function useWeeklyWorkouts(
  query: Pick<AnalyticsQuery, 'rangeDays'> = {},
): UseWeeklyWorkoutsResult {
  const rangeDays = query.rangeDays ?? DEFAULT_RANGE_DAYS

  const result = useQuery({
    queryKey: analyticsKeys.weeklyWorkouts(rangeDays),
    queryFn: () => fetchWeeklyWorkouts(rangeDays),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    retry: 2,
    select: shapeWeeklyWorkouts,
  })

  const loadState = deriveLoadState({
    isLoading: result.isLoading,
    isError: result.isError,
    isEmpty: result.data?.isEmpty ?? false,
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
