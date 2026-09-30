import { useQuery } from '@tanstack/react-query'
import { fetchProgressOverview } from '../analyticsClient'
import { ANALYTICS_GC_TIME, ANALYTICS_STALE_TIME, analyticsKeys } from '../analyticsCache'
import { deriveLoadState, shapeProgressOverview } from '../analyticsService'
import type { AnalyticsQuery, LoadState, ProgressOverviewModel } from '../analyticsTypes'

const DEFAULT_RANGE_DAYS = 28

export type UseProgressOverviewResult = {
  data: ProgressOverviewModel | undefined
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  loadState: LoadState
}

/**
 * Returns a shaped ProgressOverviewModel for the given rangeDays window.
 * Data is fetched from analytics.rpc_progress_overview (Phase 1 RPC).
 */
export function useProgressOverview(
  query: Pick<AnalyticsQuery, 'rangeDays'> = {},
): UseProgressOverviewResult {
  const rangeDays = query.rangeDays ?? DEFAULT_RANGE_DAYS

  const result = useQuery({
    queryKey: analyticsKeys.overview(rangeDays),
    queryFn: () => fetchProgressOverview(rangeDays),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    retry: 2,
    select: shapeProgressOverview,
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
