import { useQuery } from '@tanstack/react-query'
import { fetchMuscleBalance } from '../analyticsClient'
import { ANALYTICS_GC_TIME, ANALYTICS_STALE_TIME, analyticsKeys } from '../analyticsCache'
import { deriveLoadState, shapeMuscleBalance } from '../analyticsService'
import type { AnalyticsQuery, LoadState, MuscleBalanceModel } from '../analyticsTypes'

const DEFAULT_RANGE_DAYS = 28

export type UseMuscleBalanceResult = {
  data: MuscleBalanceModel | undefined
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  loadState: LoadState
}

/**
 * Returns a shaped MuscleBalanceModel aggregated across the given rangeDays window.
 * Data is fetched from analytics.weekly_muscle_balance (Phase 1 view).
 *
 * The model includes:
 *   • topMuscles — up to 6 highest-volume muscles, sorted descending
 *   • distribution — full list sorted descending
 *   • totalVolumeKg — sum across all muscles and all weeks in the range
 *
 * Volume attribution follows ADR-AN-003: 70% primary / 30% secondary per set.
 */
export function useMuscleBalance(
  query: Pick<AnalyticsQuery, 'rangeDays'> = {},
): UseMuscleBalanceResult {
  const rangeDays = query.rangeDays ?? DEFAULT_RANGE_DAYS

  const result = useQuery({
    queryKey: analyticsKeys.muscleBalance(rangeDays),
    queryFn: () => fetchMuscleBalance(rangeDays),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    retry: 2,
    select: shapeMuscleBalance,
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
