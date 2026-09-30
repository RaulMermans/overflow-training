import { useQuery } from '@tanstack/react-query'
import { fetchWeeklyStrengthVolume } from '../analyticsClient'
import { ANALYTICS_GC_TIME, ANALYTICS_STALE_TIME, analyticsKeys } from '../analyticsCache'
import { deriveLoadState, shapeWeeklyStrengthVolume } from '../analyticsService'
import type { AnalyticsQuery, LoadState, WeeklyStrengthVolumeModel } from '../analyticsTypes'

const DEFAULT_RANGE_DAYS = 28

export type UseWeeklyStrengthVolumeResult = {
  data: WeeklyStrengthVolumeModel | undefined
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  loadState: LoadState
}

/**
 * Returns a shaped WeeklyStrengthVolumeModel for the given rangeDays window.
 * Data is fetched from analytics.weekly_strength_volume (Phase 1 view).
 * Both volumeSeries and setsSeries are contiguous and zero-filled.
 *
 * UNIT NOTE: values are in kg. Use fromWeightKg() from analyticsService at render time.
 */
export function useWeeklyStrengthVolume(
  query: Pick<AnalyticsQuery, 'rangeDays'> = {},
): UseWeeklyStrengthVolumeResult {
  const rangeDays = query.rangeDays ?? DEFAULT_RANGE_DAYS

  const result = useQuery({
    queryKey: analyticsKeys.weeklyVolume(rangeDays),
    queryFn: () => fetchWeeklyStrengthVolume(rangeDays),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    retry: 2,
    select: shapeWeeklyStrengthVolume,
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
