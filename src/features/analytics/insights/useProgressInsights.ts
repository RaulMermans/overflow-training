// ============================================================
// useProgressInsights — Phase 4 integration hook
// ============================================================
//
// Composites existing Phase 2 analytics hooks and feeds their
// shaped models into the insight engine. No raw table queries.
//
// PREVIOUS PERIOD COMPUTATION:
//   Phase 2 only covers the current window. To compare vs the
//   previous period, we call useProgressOverview with 2× rangeDays
//   then subtract the current period's values:
//     prevWorkouts = overview2x.workouts - overview.workouts
//     prevVolumeKg = overview2x.strengthVolumeKg - overview.strengthVolumeKg
//
//   This mirrors the pattern already used in ProgressScreenV2 and
//   avoids any additional network requests.
//
// BODY INSIGHTS:
//   No check-in data layer exists in Phase 4.
//   bodyInsight is always null.
//   @deferred TODO: Wire when a check-in analytics hook is available.
//
// LOADING STRATEGY:
//   isLoading is true only for the hooks that are required for a
//   visible module. Strength isLoading is excluded unless an exercise
//   is selected, to avoid blocking the screen on optional data.
//
// TFn BRIDGE:
//   The insight engine uses TFn (loose: key: string) to stay decoupled
//   from the TranslationKey union. Under strictFunctionTypes, the
//   useI18n t function (key: TranslationKey) is not directly assignable
//   to TFn. We bridge with a lambda wrapper at this boundary.
// ============================================================

import { useMemo } from 'react'
import type { TranslationKey } from '../../../i18n'
import { useI18n } from '../../../i18n/useI18n'
import { useExerciseTrend } from '../hooks/useExerciseTrend'
import { useMuscleBalance } from '../hooks/useMuscleBalance'
import { useProgressOverview } from '../hooks/useProgressOverview'
import { buildProgressInsights } from './insightEngine'
import type {
  BalanceInsightInput,
  Insight,
  OverviewInsightInput,
  StrengthInsightInput,
} from './insightTypes'

export type UseProgressInsightsParams = {
  rangeDays: number
  /** When provided, enables the strength insight for this lift */
  selectedExerciseDefinitionId?: string
}

export type UseProgressInsightsResult = {
  overviewInsight: Insight | null
  strengthInsight: Insight | null
  balanceInsight: Insight | null
  /** Always null — body data layer not yet available */
  bodyInsight: null
  isLoading: boolean
  error: unknown | null
  refetch: () => void
}

export function useProgressInsights(params: UseProgressInsightsParams): UseProgressInsightsResult {
  const { rangeDays, selectedExerciseDefinitionId } = params

  // ── Translator ───────────────────────────────────────────────
  const { t } = useI18n()
  // Bridge: TFn accepts (key: string) but useI18n's t requires TranslationKey.
  // The lambda wrapper satisfies strictFunctionTypes contravariance.
  const tFn = (key: string, p?: Record<string, string | number>) => t(key as TranslationKey, p)

  // ── Current period ──────────────────────────────────────────────
  const overview = useProgressOverview({ rangeDays })

  // ── 2× window for previous-period derivation ───────────────────
  // Doubling the window gives us the combined (prev + current) total.
  // prev = combined - current (clamped to 0 to guard against data anomalies).
  const overview2x = useProgressOverview({ rangeDays: rangeDays * 2 })

  // ── Balance ─────────────────────────────────────────────────────
  const muscleBalance = useMuscleBalance({ rangeDays })

  // ── Strength (conditional) ──────────────────────────────────────
  const exerciseTrend = useExerciseTrend({
    rangeDays,
    exerciseDefinitionId: selectedExerciseDefinitionId,
  })

  // ── Loading / error state ───────────────────────────────────────
  const isLoading = overview.isLoading || overview2x.isLoading || muscleBalance.isLoading

  const error: unknown | null = overview.error ?? overview2x.error ?? muscleBalance.error ?? null

  // ── Insight computation ─────────────────────────────────────────
  const insights = useMemo(() => {
    const generatedAt = new Date().toISOString()

    // Overview input: requires both current and 2× period data
    let overviewInput: OverviewInsightInput | null = null
    if (overview.data && overview2x.data) {
      const currentWorkouts = overview.data.workouts
      const currentVolumeKg = overview.data.strengthVolumeKg
      const combinedWorkouts = overview2x.data.workouts
      const combinedVolumeKg = overview2x.data.strengthVolumeKg
      overviewInput = {
        currentWorkouts,
        prevWorkouts: Math.max(combinedWorkouts - currentWorkouts, 0),
        currentVolumeKg,
        prevVolumeKg: Math.max(combinedVolumeKg - currentVolumeKg, 0),
        rangeDays,
      }
    }

    // Strength input: only when an exercise is selected and has non-empty data
    let strengthInput: StrengthInsightInput | null = null
    if (selectedExerciseDefinitionId && exerciseTrend.data && !exerciseTrend.data.isEmpty) {
      strengthInput = {
        trendPoints: exerciseTrend.data.points,
        currentBestKg: exerciseTrend.data.currentBestKg,
        rangeDays,
      }
    }

    // Balance input: only when muscle balance has non-empty data
    let balanceInput: BalanceInsightInput | null = null
    if (muscleBalance.data && !muscleBalance.data.isEmpty) {
      balanceInput = {
        distribution: muscleBalance.data.distribution,
        totalVolumeKg: muscleBalance.data.totalVolumeKg,
        rangeDays,
      }
    }

    return buildProgressInsights(
      {
        rangeDays,
        generatedAt,
        overviewInput,
        strengthInput,
        balanceInput,
        bodyInput: null, // No body data layer yet
      },
      tFn,
    )
  }, [
    overview.data,
    overview2x.data,
    exerciseTrend.data,
    muscleBalance.data,
    rangeDays,
    selectedExerciseDefinitionId,
    tFn,
  ])

  // ── refetch ─────────────────────────────────────────────────────
  const refetch = (): void => {
    overview.refetch()
    overview2x.refetch()
    muscleBalance.refetch()
    exerciseTrend.refetch()
  }

  return {
    overviewInsight: insights.overview,
    strengthInsight: insights.strength,
    balanceInsight: insights.balance,
    bodyInsight: null,
    isLoading,
    error,
    refetch,
  }
}
