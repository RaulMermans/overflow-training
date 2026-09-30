import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ExerciseDefinitionRow } from '../../db/workouts'
import { loadWeeklyWorkoutsGoal } from '../../db/userSettings'
import { useAuth } from '../../auth/useAuth'
import { ANALYTICS_GC_TIME, ANALYTICS_STALE_TIME, analyticsKeys } from '../analytics/analyticsCache'
import {
  fetchExerciseE1RMTrend,
  fetchMuscleBalance,
  fetchWeeklyStrengthVolume,
  fetchWeeklyWorkouts,
} from '../analytics/analyticsClient'
import { useProgressOverview } from '../analytics/hooks/useProgressOverview'
import {
  buildProgressDashboardModel,
  groupWeeklyVolumeRows,
  PROGRESS_RANGE_CONFIG,
  type TimeRange,
} from './progressModel'

export type UseProgressDashboardResult = {
  weeklyGoal: number
  dashboard: ReturnType<typeof buildProgressDashboardModel> | null
  volumeComparison: ReturnType<typeof groupWeeklyVolumeRows> | null
  overviewState: 'loading' | 'ready' | 'error' | 'empty'
  strengthState: 'loading' | 'ready' | 'error' | 'empty'
  bodyState: 'loading' | 'ready' | 'error' | 'empty'
  overviewError: Error | null
  strengthError: Error | null
  bodyError: Error | null
  refetchAll: () => Promise<void>
}

export function useProgressDashboard(
  range: TimeRange,
  selectedExercise: ExerciseDefinitionRow | null,
): UseProgressDashboardResult {
  const { user } = useAuth()
  const rangeConfig = PROGRESS_RANGE_CONFIG[range]
  const comparisonRangeDays = rangeConfig.days * 2

  const overview = useProgressOverview({ rangeDays: rangeConfig.days })

  const goalQuery = useQuery({
    queryKey: ['user-settings', 'weekly-goal', user?.id],
    queryFn: () => loadWeeklyWorkoutsGoal(user!.id),
    enabled: Boolean(user?.id),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
  })

  const workoutRowsQuery = useQuery({
    queryKey: analyticsKeys.weeklyWorkouts(comparisonRangeDays),
    queryFn: () => fetchWeeklyWorkouts(comparisonRangeDays),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    retry: 2,
  })

  const volumeRowsQuery = useQuery({
    queryKey: analyticsKeys.weeklyVolume(comparisonRangeDays),
    queryFn: () => fetchWeeklyStrengthVolume(comparisonRangeDays),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    retry: 2,
  })

  const muscleRowsQuery = useQuery({
    queryKey: analyticsKeys.muscleBalance(comparisonRangeDays),
    queryFn: () => fetchMuscleBalance(comparisonRangeDays),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    retry: 2,
  })

  const strengthRowsQuery = useQuery({
    queryKey: analyticsKeys.exerciseTrend(selectedExercise?.id ?? '', comparisonRangeDays),
    queryFn: () => fetchExerciseE1RMTrend(selectedExercise!.id, comparisonRangeDays),
    enabled: Boolean(selectedExercise?.id),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    retry: 2,
  })

  const weeklyGoal = goalQuery.data ?? 4

  const dashboard = useMemo(() => {
    if (!overview.data || !workoutRowsQuery.data) {
      return null
    }

    return buildProgressDashboardModel({
      range,
      weeklyGoal,
      overview: overview.data,
      workoutRows: workoutRowsQuery.data,
      strengthRows: strengthRowsQuery.data ?? [],
      muscleRows: muscleRowsQuery.data ?? [],
      selectedExerciseName: selectedExercise?.name ?? null,
    })
  }, [
    overview.data,
    range,
    selectedExercise?.name,
    strengthRowsQuery.data,
    weeklyGoal,
    workoutRowsQuery.data,
    muscleRowsQuery.data,
  ])

  const volumeComparison = useMemo(() => {
    if (!volumeRowsQuery.data) return null
    return groupWeeklyVolumeRows(volumeRowsQuery.data, range)
  }, [range, volumeRowsQuery.data])

  const overviewState: UseProgressDashboardResult['overviewState'] =
    overview.loadState === 'error' || goalQuery.isError || workoutRowsQuery.isError
      ? 'error'
      : overview.loadState === 'loading' || goalQuery.isLoading || workoutRowsQuery.isLoading
        ? 'loading'
        : dashboard?.hero.isEmpty
          ? 'empty'
          : 'ready'

  const strengthState: UseProgressDashboardResult['strengthState'] = !selectedExercise?.id
    ? 'empty'
    : strengthRowsQuery.isError
      ? 'error'
      : strengthRowsQuery.isLoading || dashboard === null
        ? 'loading'
        : dashboard?.strength.isEmpty
          ? 'empty'
          : 'ready'

  const bodyState: UseProgressDashboardResult['bodyState'] = muscleRowsQuery.isError
    ? 'error'
    : muscleRowsQuery.isLoading || dashboard === null
      ? 'loading'
      : dashboard?.body.isEmpty
        ? 'empty'
        : 'ready'

  const refetchAll = async (): Promise<void> => {
    await Promise.allSettled([
      overview.refetch(),
      goalQuery.refetch(),
      workoutRowsQuery.refetch(),
      volumeRowsQuery.refetch(),
      muscleRowsQuery.refetch(),
      strengthRowsQuery.refetch(),
    ])
  }

  return {
    weeklyGoal,
    dashboard,
    volumeComparison,
    overviewState,
    strengthState,
    bodyState,
    overviewError: (overview.error ?? goalQuery.error ?? workoutRowsQuery.error) as Error | null,
    strengthError: strengthRowsQuery.error as Error | null,
    bodyError: muscleRowsQuery.error as Error | null,
    refetchAll,
  }
}
