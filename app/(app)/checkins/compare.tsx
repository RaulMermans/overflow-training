import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActionSheetIOS, Image, PanResponder, StyleSheet, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  AppHeader,
  Box,
  Card,
  EmptyState,
  ListRow,
  Metric,
  Screen,
  SectionHeader,
  Text,
} from '../../../src/components/ui'
import { useAuth } from '../../../src/auth/useAuth'
import { useI18n } from '../../../src/i18n/useI18n'
import { formatDateTimeByLanguage } from '../../../src/i18n/formatters'
import { listCheckins, type CheckinEntry } from '../../../src/features/checkins/storage'
import { resolveCheckinImageUri, syncCheckinsCloud } from '../../../src/features/checkins/cloudSync'
import { fetchProgressWorkouts, type ProgressWorkout } from '../../../src/db/progress'
import {
  buildModeAwareSetPoints,
  computeStrengthModeStats,
} from '../../../src/features/progress/compute'
import { buildWeeklySessionCounts } from '../../../src/features/progress/weeklySessions'
import { colors } from '../../../src/theme'

const DAY_MS = 24 * 60 * 60 * 1000

type SummaryState = {
  workoutsCount: number
  totalVolumeKg: number
  weeklySessionCounts: number[]
  bodyweightDeltaKg: number | null
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function formatDateLabel(iso: string, language: 'en' | 'es', unknownLabel: string): string {
  return (
    formatDateTimeByLanguage(
      iso,
      language,
      {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      },
      {
        hour: 'numeric',
        minute: '2-digit',
      },
    ) ?? unknownLabel
  )
}

function toEpoch(iso: string): number {
  const epoch = new Date(iso).getTime()
  return Number.isFinite(epoch) ? epoch : 0
}

function WeeklySessionsChart({ data }: { data: number[] }) {
  if (data.length === 0) return null

  const maxValue = Math.max(...data, 1)

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 88 }}>
      {data.map((count, index) => {
        const normalizedHeight = count <= 0 ? 6 : Math.max(12, Math.round((count / maxValue) * 76))
        return (
          <View
            key={`compare-week-${index}`}
            style={{
              flex: 1,
              justifyContent: 'flex-end',
              marginRight: index === data.length - 1 ? 0 : 6,
            }}
          >
            <View
              style={{
                height: normalizedHeight,
                borderRadius: 4,
                backgroundColor: count > 0 ? colors.accent.secondary : colors.border.subtle,
              }}
            />
          </View>
        )
      })}
    </View>
  )
}

export default function CheckinsCompareScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    beforeId?: string | string[]
    afterId?: string | string[]
  }>()
  const beforeIdParam = Array.isArray(params.beforeId) ? params.beforeId[0] : params.beforeId
  const afterIdParam = Array.isArray(params.afterId) ? params.afterId[0] : params.afterId

  const { user } = useAuth()
  const { t, language } = useI18n()

  const [entries, setEntries] = useState<CheckinEntry[]>([])
  const [isLoadingEntries, setIsLoadingEntries] = useState(true)
  const [beforeId, setBeforeId] = useState<string | null>(null)
  const [afterId, setAfterId] = useState<string | null>(null)
  const [sliderRatio, setSliderRatio] = useState(0.5)
  const [sliderWidth, setSliderWidth] = useState(0)
  const [summary, setSummary] = useState<SummaryState | null>(null)
  const [isSummaryLoading, setIsSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [entriesError, setEntriesError] = useState<string | null>(null)
  const [beforeImageUri, setBeforeImageUri] = useState<string | null>(null)
  const [afterImageUri, setAfterImageUri] = useState<string | null>(null)

  const handleBackWithFallback = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }

    router.replace('/(app)/checkins')
  }, [router])

  const loadEntries = useCallback(async () => {
    if (!user?.id) {
      setEntries([])
      setIsLoadingEntries(false)
      return
    }
    const userId = user.id

    setIsLoadingEntries(true)
    setEntriesError(null)

    try {
      const nextEntries = await listCheckins(userId)
      setEntries(nextEntries)

      const beforeFromParams = nextEntries.find((entry) => entry.id === beforeIdParam) ?? null
      const afterFromParams = nextEntries.find((entry) => entry.id === afterIdParam) ?? null

      if (beforeFromParams && afterFromParams && beforeFromParams.id !== afterFromParams.id) {
        setBeforeId(beforeFromParams.id)
        setAfterId(afterFromParams.id)
        return
      }

      const latest = nextEntries[0] ?? null
      const previous = nextEntries[1] ?? null

      setAfterId(latest?.id ?? null)
      setBeforeId(previous?.id ?? null)
    } catch {
      setEntries([])
      setEntriesError(t('checkins.compare.errorLoad'))
    } finally {
      setIsLoadingEntries(false)
    }
  }, [afterIdParam, beforeIdParam, t, user?.id])

  useFocusEffect(
    useCallback(() => {
      let isCancelled = false

      void loadEntries().then(() => {
        if (!user?.id || isCancelled) return
        void syncCheckinsCloud(user.id, { pullRemote: true })
          .then(() => {
            if (isCancelled) return
            void loadEntries()
          })
          .catch(() => {
            // Keep compare usable with local check-ins when sync fails.
          })
      })

      return () => {
        isCancelled = true
      }
    }, [loadEntries, user?.id]),
  )

  const beforeCheckin = useMemo(
    () => entries.find((entry) => entry.id === beforeId) ?? null,
    [beforeId, entries],
  )
  const afterCheckin = useMemo(
    () => entries.find((entry) => entry.id === afterId) ?? null,
    [afterId, entries],
  )

  useEffect(() => {
    if (!user?.id || !beforeCheckin || !afterCheckin) {
      setSummary(null)
      setSummaryError(null)
      setIsSummaryLoading(false)
      return
    }
    const userId = user.id

    const startEpoch = Math.min(toEpoch(beforeCheckin.takenAtISO), toEpoch(afterCheckin.takenAtISO))
    const endEpoch = Math.max(toEpoch(beforeCheckin.takenAtISO), toEpoch(afterCheckin.takenAtISO))

    if (!Number.isFinite(startEpoch) || !Number.isFinite(endEpoch)) {
      setSummary(null)
      setSummaryError(t('checkins.compare.errorRange'))
      setIsSummaryLoading(false)
      return
    }

    const fromISO = new Date(startEpoch).toISOString()
    const toISO = new Date(endEpoch).toISOString()

    let isCancelled = false
    setIsSummaryLoading(true)
    setSummaryError(null)

    void (async () => {
      try {
        const response = await fetchProgressWorkouts(fromISO, toISO, userId)

        if (isCancelled) return

        if (response.error) {
          setSummary(null)
          setSummaryError(t('checkins.compare.errorSummary'))
          return
        }

        const workouts = (response.data ?? []) as ProgressWorkout[]
        const modeAwareSets = buildModeAwareSetPoints(workouts)
        const strengthStats = computeStrengthModeStats(modeAwareSets, fromISO, toISO, 3)

        const rangeDays = Math.max(1, Math.ceil((endEpoch - startEpoch) / DAY_MS))
        const barsCount = Math.max(1, Math.ceil(rangeDays / 7))

        const sortedPair = [beforeCheckin, afterCheckin].sort(
          (a, b) => toEpoch(a.takenAtISO) - toEpoch(b.takenAtISO),
        )
        const startWeight = sortedPair[0]?.weightKg
        const endWeight = sortedPair[1]?.weightKg
        const bodyweightDeltaKg =
          Number.isFinite(startWeight) && Number.isFinite(endWeight)
            ? Number(endWeight) - Number(startWeight)
            : null

        setSummary({
          workoutsCount: workouts.length,
          totalVolumeKg: strengthStats.totalVolumeKg,
          weeklySessionCounts: buildWeeklySessionCounts(workouts, barsCount, toISO),
          bodyweightDeltaKg,
        })
      } catch {
        if (isCancelled) return
        setSummary(null)
        setSummaryError(t('checkins.compare.errorSummary'))
      } finally {
        if (isCancelled) return
        setIsSummaryLoading(false)
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [afterCheckin, beforeCheckin, t, user?.id])

  useEffect(() => {
    if (!user?.id || !beforeCheckin || !afterCheckin) {
      setBeforeImageUri(null)
      setAfterImageUri(null)
      return
    }
    const userId = user.id
    let isCancelled = false

    void Promise.all([
      resolveCheckinImageUri(userId, beforeCheckin),
      resolveCheckinImageUri(userId, afterCheckin),
    ])
      .then(([beforeUri, afterUri]) => {
        if (isCancelled) return
        setBeforeImageUri(beforeUri)
        setAfterImageUri(afterUri)
      })
      .catch(() => {
        if (isCancelled) return
        setBeforeImageUri(beforeCheckin.photoUri ?? null)
        setAfterImageUri(afterCheckin.photoUri ?? null)
      })

    return () => {
      isCancelled = true
    }
  }, [afterCheckin, beforeCheckin, user?.id])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          if (sliderWidth <= 0) return
          setSliderRatio(clamp(event.nativeEvent.locationX / sliderWidth))
        },
        onPanResponderMove: (event) => {
          if (sliderWidth <= 0) return
          setSliderRatio(clamp(event.nativeEvent.locationX / sliderWidth))
        },
      }),
    [sliderWidth],
  )

  const selectCheckin = useCallback(
    (target: 'before' | 'after') => {
      if (entries.length === 0) return

      const options = entries.map((entry) =>
        formatDateLabel(entry.takenAtISO, language, t('checkins.unknownDate')),
      )
      options.push(t('common.cancel'))

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
        },
        (buttonIndex) => {
          if (buttonIndex < 0 || buttonIndex >= entries.length) return

          const selected = entries[buttonIndex]
          if (!selected) return

          if (target === 'before') {
            if (selected.id === afterId) return
            setBeforeId(selected.id)
            return
          }

          if (selected.id === beforeId) return
          setAfterId(selected.id)
        },
      )
    },
    [afterId, beforeId, entries, language, t],
  )

  const sliderOverlayWidth = sliderWidth * sliderRatio

  return (
    <Screen scroll>
      <AppHeader
        title={t('checkins.compare.title')}
        subtitle={t('checkins.compare.subtitle')}
        leftActionLabel={t('common.back')}
        onLeftActionPress={handleBackWithFallback}
        rightActionLabel={t('checkins.compare.allCheckins')}
        onRightActionPress={() => router.push('/(app)/checkins')}
      />

      {entriesError ? (
        <Card marginBottom="md">
          <Text variant="bodySm" color="error">
            {entriesError}
          </Text>
        </Card>
      ) : null}

      {isLoadingEntries ? (
        <Card>
          <Text variant="bodySm" color="textMuted">
            {t('checkins.loading')}
          </Text>
        </Card>
      ) : entries.length < 2 ? (
        <EmptyState
          title={t('checkins.compare.needTwoTitle')}
          body={t('checkins.compare.needTwoBody')}
          ctaLabel={t('checkins.compare.addCheckins')}
          onCtaPress={() => router.push('/(app)/checkins')}
        />
      ) : beforeCheckin && afterCheckin ? (
        <>
          <Card padding="none" marginBottom="md">
            <ListRow
              label={t('checkins.compare.before')}
              subtitle={formatDateLabel(
                beforeCheckin.takenAtISO,
                language,
                t('checkins.unknownDate'),
              )}
              value={t('checkins.compare.select')}
              onPress={() => selectCheckin('before')}
            />
            <ListRow
              label={t('checkins.compare.after')}
              subtitle={formatDateLabel(
                afterCheckin.takenAtISO,
                language,
                t('checkins.unknownDate'),
              )}
              value={t('checkins.compare.select')}
              onPress={() => selectCheckin('after')}
            />
          </Card>

          <Card marginBottom="md" padding="md">
            {beforeImageUri && afterImageUri ? (
              <View
                style={styles.compareContainer}
                onLayout={(event) => {
                  setSliderWidth(event.nativeEvent.layout.width)
                }}
                {...panResponder.panHandlers}
              >
                <Image
                  source={{ uri: beforeImageUri }}
                  resizeMode="cover"
                  style={styles.compareImage}
                />

                <View style={[styles.compareOverlay, { width: sliderOverlayWidth }]}>
                  <Image
                    source={{ uri: afterImageUri }}
                    resizeMode="cover"
                    style={styles.compareImage}
                  />
                </View>

                <View style={[styles.sliderTrack, { left: sliderOverlayWidth - 1 }]}>
                  <View style={styles.sliderKnob} />
                </View>
              </View>
            ) : (
              <Text variant="bodySm" color="textMuted">
                {t('checkins.compare.photoLoadError')}
              </Text>
            )}

            <Box marginTop="sm" flexDirection="row" justifyContent="space-between">
              <Text variant="labelSm" color="textMuted">
                {t('checkins.compare.before')}
              </Text>
              <Text variant="labelSm" color="textMuted">
                {t('checkins.compare.after')}
              </Text>
            </Box>
          </Card>

          <Card marginBottom="md">
            <SectionHeader title={t('checkins.compare.summaryTitle')} variant="dense" />

            {isSummaryLoading ? (
              <Text variant="bodySm" color="textMuted">
                {t('checkins.compare.loadingSummary')}
              </Text>
            ) : summaryError ? (
              <Text variant="bodySm" color="error">
                {summaryError}
              </Text>
            ) : summary ? (
              <>
                <Box flexDirection="row" flexWrap="wrap" gap="sm">
                  <Box width="48%">
                    <Metric
                      value={summary.workoutsCount}
                      label={t('checkins.compare.metricWorkouts')}
                      variant="compact"
                    />
                  </Box>
                  <Box width="48%">
                    <Metric
                      value={summary.totalVolumeKg}
                      label={t('checkins.compare.metricTotalVolumeKg')}
                      variant="compact"
                    />
                  </Box>
                  <Box width="48%">
                    <Metric
                      value={
                        summary.bodyweightDeltaKg === null
                          ? '--'
                          : `${summary.bodyweightDeltaKg > 0 ? '+' : ''}${Math.round(summary.bodyweightDeltaKg * 10) / 10}`
                      }
                      label={t('checkins.compare.metricBodyweightDeltaKg')}
                      variant="compact"
                    />
                  </Box>
                </Box>

                <Box marginTop="lg">
                  <Text variant="labelSm" color="textMuted">
                    {t('checkins.compare.weeklySessions')}
                  </Text>
                  <Box marginTop="sm">
                    <WeeklySessionsChart data={summary.weeklySessionCounts} />
                  </Box>
                  {summary.weeklySessionCounts.some((count) => count > 0) ? null : (
                    <Text marginTop="sm" variant="bodySm" color="textMuted">
                      {t('checkins.compare.noWorkoutsInRange')}
                    </Text>
                  )}
                </Box>
              </>
            ) : null}
          </Card>
        </>
      ) : (
        <Card>
          <Text variant="bodySm" color="textMuted">
            {t('checkins.compare.selectTwoDifferent')}
          </Text>
        </Card>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  compareContainer: {
    height: 360,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.bg.secondary,
    position: 'relative',
  },
  compareImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  compareOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  sliderTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.bg.surface,
    backgroundColor: colors.accent.secondary,
  },
})
