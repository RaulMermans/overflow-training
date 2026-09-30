import { useCallback, useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useLocalSearchParams } from 'expo-router'
import {
  Box,
  Card,
  Chip,
  ErrorState,
  ListRow,
  LoadingState,
  Screen,
  SectionHeader,
  Text,
} from '../../../../src/components/ui'
import {
  fetchExerciseProgressMeta,
  fetchProgressExercisePRs,
  fetchProgressExerciseRecentOccurrences,
  type ProgressExerciseOccurrence,
} from '../../../../src/db/progress'
import {
  fetchLastExercisePerformance,
  type LastExercisePerformance,
} from '../../../../src/db/workouts'
import { useAuth } from '../../../../src/auth/useAuth'
import { useI18n } from '../../../../src/i18n/useI18n'
import type { TranslationKey } from '../../../../src/i18n'
import {
  loadProfilePreferences,
  type UnitsPreference,
} from '../../../../src/lib/profilePreferences'
import { resolveDisplayWeight } from '../../../../src/lib/units'
import { sanitizeErrorMessage } from '../../../../src/utils/errorMessages'
import { withTimeout } from '../../../../src/lib/withTimeout'
import { colors } from '../../../../src/theme'

type ExerciseTrackingMode = 'weight_reps' | 'reps_only' | 'time' | 'distance_time'

function formatDateLabel(iso: string | null): string {
  if (!iso) return '--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function resolveTrendValue(
  occurrence: ProgressExerciseOccurrence,
  mode: ExerciseTrackingMode | null,
): number | null {
  if (mode === 'weight_reps') {
    return Number.isFinite(occurrence.e1rmKg) && occurrence.e1rmKg > 0
      ? round(occurrence.e1rmKg)
      : null
  }
  if (mode === 'reps_only') {
    return Number.isFinite(occurrence.reps) && occurrence.reps > 0 ? occurrence.reps : null
  }
  return null
}

function TrendBars({ values }: { values: number[] }) {
  if (values.length === 0) return null
  const maxValue = Math.max(...values, 1)

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 86 }}>
      {values.map((value, index) => {
        const normalizedHeight = value <= 0 ? 6 : Math.max(12, Math.round((value / maxValue) * 74))
        return (
          <View
            key={`exercise-trend-${index}`}
            style={{
              flex: 1,
              justifyContent: 'flex-end',
              marginRight: index === values.length - 1 ? 0 : 6,
            }}
          >
            <View
              style={{
                height: normalizedHeight,
                borderRadius: 4,
                backgroundColor:
                  index === values.length - 1 ? colors.accent.secondary : colors.border.subtle,
              }}
            />
          </View>
        )
      })}
    </View>
  )
}

function formatOccurrenceSummary(
  occurrence: ProgressExerciseOccurrence,
  units: UnitsPreference,
  mode: ExerciseTrackingMode | null,
): string {
  if (mode === 'reps_only') {
    return `${occurrence.reps} reps`
  }
  const weight = resolveDisplayWeight(
    {
      weight: occurrence.weight,
      weight_kg: occurrence.weightKg,
      is_weight_canonical: occurrence.isWeightCanonical,
    },
    units,
  )
  return `${weight}×${occurrence.reps} · e1RM ${round(occurrence.e1rmKg)}`
}

function formatLastPerformanceSummary(
  performance: LastExercisePerformance | null,
  units: UnitsPreference,
  mode: ExerciseTrackingMode | null,
): string | null {
  if (!performance || performance.sets.length === 0) return null
  const firstSet = performance.sets[0]
  if (!firstSet) return null

  if (mode === 'reps_only') {
    return `${firstSet.reps} reps`
  }

  const weight = resolveDisplayWeight(firstSet, units)
  return `${weight}×${firstSet.reps}`
}

export default function ExerciseProgressScreen() {
  const { user } = useAuth()
  const { t } = useI18n()
  const params = useLocalSearchParams<{
    exerciseId?: string | string[]
    exerciseName?: string | string[]
  }>()

  const exerciseId = Array.isArray(params.exerciseId) ? params.exerciseId[0] : params.exerciseId
  const exerciseNameParam = Array.isArray(params.exerciseName)
    ? params.exerciseName[0]
    : params.exerciseName

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [units, setUnits] = useState<UnitsPreference>('kg')
  const [exerciseName, setExerciseName] = useState<string>(
    exerciseNameParam ?? t('progress.exerciseFallbackName'),
  )
  const [trackingMode, setTrackingMode] = useState<ExerciseTrackingMode | null>('weight_reps')
  const [lastPerformance, setLastPerformance] = useState<LastExercisePerformance | null>(null)
  const [occurrences, setOccurrences] = useState<ProgressExerciseOccurrence[]>([])
  const [exercisePrs, setExercisePrs] = useState<ProgressExerciseOccurrence[]>([])

  const loadData = useCallback(async () => {
    if (!user || !exerciseId) {
      setIsLoading(false)
      setError(t('common.tryAgain'))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const [preferences, metaResponse, lastResponse, occurrencesResponse, prsResponse] =
        await withTimeout(
          Promise.all([
            loadProfilePreferences(),
            fetchExerciseProgressMeta(exerciseId),
            fetchLastExercisePerformance(user.id, exerciseId),
            fetchProgressExerciseRecentOccurrences(exerciseId, 20),
            fetchProgressExercisePRs(),
          ]),
          7000,
        )

      if (
        metaResponse.error ||
        lastResponse.error ||
        occurrencesResponse.error ||
        prsResponse.error
      ) {
        setError(
          sanitizeErrorMessage(
            metaResponse.error?.message ??
              lastResponse.error?.message ??
              occurrencesResponse.error?.message ??
              prsResponse.error?.message ??
              t('common.tryAgain'),
          ),
        )
        setOccurrences([])
        setExercisePrs([])
        setLastPerformance(null)
        return
      }

      setUnits(preferences.units)
      setExerciseName(
        metaResponse.data?.name ?? exerciseNameParam ?? t('progress.exerciseFallbackName'),
      )
      setTrackingMode((metaResponse.data?.trackingMode as ExerciseTrackingMode) ?? null)
      setLastPerformance(lastResponse.data)
      setOccurrences(occurrencesResponse.data ?? [])
      setExercisePrs(
        (prsResponse.data ?? []).filter((entry) => entry.exerciseDefinitionId === exerciseId),
      )
    } catch (loadError) {
      if (__DEV__) {
        console.warn('Failed loading exercise progress:', loadError)
      }
      setError(
        sanitizeErrorMessage(loadError instanceof Error ? loadError.message : t('common.tryAgain')),
      )
      setOccurrences([])
      setExercisePrs([])
      setLastPerformance(null)
    } finally {
      setIsLoading(false)
    }
  }, [exerciseId, exerciseNameParam, t, user])

  useFocusEffect(
    useCallback(() => {
      void loadData()
    }, [loadData]),
  )

  const trendValues = useMemo(() => {
    return [...occurrences]
      .reverse()
      .map((occurrence) => resolveTrendValue(occurrence, trackingMode))
      .filter((value): value is number => value !== null)
      .slice(-20)
  }, [occurrences, trackingMode])
  const latestTrendValue = trendValues.length > 0 ? trendValues[trendValues.length - 1] : null
  const isStrengthSupported = trackingMode === 'weight_reps' || trackingMode === 'reps_only'
  const prWorkoutIds = useMemo(
    () => new Set(exercisePrs.map((entry) => entry.workoutId)),
    [exercisePrs],
  )
  const lastPerformanceSummary = useMemo(
    () => formatLastPerformanceSummary(lastPerformance, units, trackingMode),
    [lastPerformance, trackingMode, units],
  )

  return (
    <Screen scroll={false}>
      {error ? (
        <ErrorState
          message={error}
          retryLabel={t('common.reload')}
          onRetry={() => {
            void loadData()
          }}
        />
      ) : null}

      {isLoading ? (
        <LoadingState message={t('progress.loading')} />
      ) : (
        <ScrollView>
          <Card marginBottom="md">
            <Text variant="h3">{exerciseName}</Text>
            <Box
              marginTop="sm"
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Chip
                label={t(`progress.mode.${trackingMode ?? 'unknown'}` as TranslationKey)}
                variant="neutral"
              />
              <Text variant="bodySm" color="textMuted">
                {t('progress.lastTimePerformed')}:{' '}
                {formatDateLabel(lastPerformance?.performedAt ?? null)}
              </Text>
            </Box>
            <Box marginTop="md">
              <Text variant="labelSm" color="textMuted">
                {t('progress.lastPerformance')}
              </Text>
              <Text marginTop="xs" variant="label">
                {lastPerformanceSummary ?? t('progress.noExerciseData')}
              </Text>
            </Box>
          </Card>

          <Card marginBottom="md">
            <SectionHeader title={t('progress.trendLast8')} variant="dense" />
            {!isStrengthSupported ? (
              <Text variant="bodySm" color="textMuted">
                {t('progress.notEnoughData')}
              </Text>
            ) : trendValues.length < 2 ? (
              <Text variant="bodySm" color="textMuted">
                {t('progress.noTrendData')}
              </Text>
            ) : (
              <>
                <Text variant="labelSm" color="textMuted">
                  {trackingMode === 'reps_only'
                    ? t('progress.bestInPeriod')
                    : t('progress.bestSetAllTime')}
                </Text>
                <Box marginTop="md">
                  <TrendBars values={trendValues} />
                </Box>
                {latestTrendValue !== null ? (
                  <Text marginTop="sm" variant="bodySm" color="textMuted">
                    {t('progress.latestValue', { value: String(latestTrendValue) })}
                  </Text>
                ) : null}
              </>
            )}
          </Card>

          <Box marginBottom="md">
            <SectionHeader title={t('progress.recentOccurrences')} variant="dense" />
            {occurrences.length === 0 ? (
              <Card>
                <Text variant="bodySm" color="textMuted">
                  {t('progress.noExerciseDataBody')}
                </Text>
              </Card>
            ) : (
              <Card padding="none">
                {occurrences.slice(0, 10).map((occurrence) => (
                  <ListRow
                    key={`${occurrence.workoutId}-${occurrence.performedAt ?? 'na'}`}
                    label={formatDateLabel(occurrence.performedAt)}
                    subtitle={formatOccurrenceSummary(occurrence, units, trackingMode)}
                    rightContent={
                      prWorkoutIds.has(occurrence.workoutId) ? (
                        <Chip label={t('progress.prs')} variant="accent" />
                      ) : undefined
                    }
                    showChevron={false}
                  />
                ))}
              </Card>
            )}
          </Box>

          <Box marginBottom="lg">
            <SectionHeader title={t('progress.prs')} variant="dense" />
            {exercisePrs.length === 0 ? (
              <Card>
                <Text variant="bodySm" color="textMuted">
                  {t('progress.noPRsYet')}
                </Text>
              </Card>
            ) : (
              <Card padding="none">
                {exercisePrs.map((pr) => (
                  <ListRow
                    key={pr.workoutId}
                    label={formatDateLabel(pr.performedAt)}
                    subtitle={formatOccurrenceSummary(pr, units, trackingMode)}
                    showChevron={false}
                  />
                ))}
              </Card>
            )}
          </Box>
        </ScrollView>
      )}
    </Screen>
  )
}
