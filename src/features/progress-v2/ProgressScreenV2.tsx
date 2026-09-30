import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Line } from 'react-native-svg'
import { Text } from '../../components/ui/Text'
import { SunriseWash } from '../../components/ui/SunriseWash'
import { useAuth } from '../../auth/useAuth'
import { capture, screen } from '../../analytics/posthogClient'
import ExerciseSearch from '../../components/ui/ExerciseSearch'
import { SyncStatusBanner } from '../../components/sync/SyncStatusBanner'
import { useSyncStatus } from '../sync/useSyncStatus'
import type { ExerciseDefinitionRow } from '../../db/workouts'
import type { TranslationKey } from '../../i18n'
import { useI18n } from '../../i18n/useI18n'
import { loadProfilePreferences, type UnitsPreference } from '../../lib/profilePreferences'
import { fromWeightKg } from '../../lib/units'
import { colors, elevation, radii, space, type } from '../../theme/tokens'
import type { TrendPoint, WeekPoint } from '../analytics/analyticsTypes'
import { EmptyStateCard } from './components/EmptyStateCard'
import { ProgressHeader } from './components/ProgressHeader'
import { HeroSkeleton, ModuleSkeleton } from './components/Skeletons'
import {
  formatRegionDelta,
  type BodyRegionKey,
  type HeroStatus,
  type ProgressLens,
  type TimeRange,
} from './progressModel'
import { buildProgressWins } from './winsModel'
import { useProgressDashboard } from './useProgressDashboard'

const WIN_ICON: Record<
  ReturnType<typeof buildProgressWins>['wins'][number]['icon'],
  keyof typeof Ionicons.glyphMap
> = {
  trophy: 'trophy-outline',
  trend: 'trending-up-outline',
  consistency: 'flame-outline',
  return: 'refresh-outline',
}

const BODY_REGION_KEYS: BodyRegionKey[] = ['upperPush', 'upperPull', 'lowerBody', 'core']

function statusColor(status: HeroStatus) {
  switch (status) {
    case 'onTrack':
      return {
        bg: colors.semantic.successMuted,
        text: colors.semantic.success,
      }
    case 'building':
      return {
        bg: colors.accent.secondaryMuted,
        text: colors.accent.secondary,
      }
    default:
      return {
        bg: colors.accent.primaryMuted,
        text: colors.accent.primary,
      }
  }
}

function regionLabelKey(region: BodyRegionKey) {
  switch (region) {
    case 'upperPush':
      return 'progress.v2.body.region.upperPush' as const
    case 'upperPull':
      return 'progress.v2.body.region.upperPull' as const
    case 'lowerBody':
      return 'progress.v2.body.region.lowerBody' as const
    default:
      return 'progress.v2.body.region.core' as const
  }
}

function comparisonLabel(deltaLabel: string, fallback: string) {
  return deltaLabel === '—' ? fallback : deltaLabel
}

function MiniBarTrend({ series }: { series: WeekPoint[] }) {
  const maxValue = Math.max(...series.map((point) => point.value), 1)

  return (
    <View style={styles.miniBars}>
      {series.map((point, index) => (
        <View key={point.weekStart} style={styles.miniBarTrack}>
          <View
            style={[
              styles.miniBarFill,
              {
                height: `${Math.max((point.value / maxValue) * 100, point.value > 0 ? 18 : 6)}%`,
                backgroundColor:
                  index === series.length - 1
                    ? colors.accent.primary
                    : point.isFilled
                      ? colors.border.subtle
                      : colors.accent.tertiary,
              },
            ]}
          />
        </View>
      ))}
    </View>
  )
}

function WeeklyBars({ series }: { series: WeekPoint[] }) {
  const maxValue = Math.max(...series.map((point) => point.value), 1)

  return (
    <View style={styles.weeklyBars}>
      {series.map((point) => (
        <View key={point.weekStart} style={styles.weeklyBarColumn}>
          <View style={styles.weeklyBarTrack}>
            <View
              style={[
                styles.weeklyBarFill,
                {
                  height: `${Math.max((point.value / maxValue) * 100, point.value > 0 ? 14 : 0)}%`,
                  backgroundColor: point.isFilled ? colors.border.subtle : colors.accent.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.weeklyBarLabel}>{point.weekStart.slice(5)}</Text>
        </View>
      ))}
    </View>
  )
}

function StrengthLineChart({
  points,
  units,
}: {
  points: Array<TrendPoint & { isPr: boolean }>
  units: UnitsPreference
}) {
  const chartPoints = points
    .map((point, index) => ({
      index,
      weekStart: point.weekStart,
      value: point.value === null ? null : fromWeightKg(point.value, units),
      isPr: point.isPr,
    }))
    .filter((point) => point.value !== null)

  if (chartPoints.length === 0) return null

  const width = 280
  const height = 120
  const minValue = Math.min(...chartPoints.map((point) => point.value as number))
  const maxValue = Math.max(...chartPoints.map((point) => point.value as number))
  const valueRange = maxValue - minValue || 1
  const horizontalStep = chartPoints.length > 1 ? width / (chartPoints.length - 1) : width / 2

  const coordinates = chartPoints.map((point, index) => ({
    ...point,
    x: chartPoints.length > 1 ? index * horizontalStep : width / 2,
    y: height - (((point.value as number) - minValue) / valueRange) * (height - 14) - 7,
  }))

  return (
    <View style={styles.lineChart}>
      <Svg width={width} height={height}>
        {coordinates.slice(0, -1).map((point, index) => (
          <Line
            key={`${point.weekStart}-segment`}
            x1={point.x}
            y1={point.y}
            x2={coordinates[index + 1].x}
            y2={coordinates[index + 1].y}
            stroke={colors.accent.primary}
            strokeWidth={2}
          />
        ))}
        {coordinates.map((point) => (
          <Circle
            key={point.weekStart}
            cx={point.x}
            cy={point.y}
            r={point.isPr ? 6 : 5}
            fill={point.isPr ? colors.accent.secondary : colors.accent.primary}
            stroke={colors.bg.surface}
            strokeWidth={2}
          />
        ))}
      </Svg>
    </View>
  )
}

function RetryCard({
  message,
  buttonLabel,
  onRetry,
}: {
  message: string
  buttonLabel: string
  onRetry: () => void
}) {
  return (
    <View style={styles.retryCard}>
      <Text style={styles.retryText}>{message}</Text>
      <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryButtonText}>{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  )
}

function StrengthPicker({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.pickerButton}>
      <Text style={styles.pickerLabel} numberOfLines={2}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
    </TouchableOpacity>
  )
}

export default function ProgressScreenV2() {
  const { user } = useAuth()
  const { t } = useI18n()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const sync = useSyncStatus()
  const [timeRange, setTimeRange] = useState<TimeRange>('3M')
  const [selectedLens, setSelectedLens] = useState<ProgressLens>('overview')
  const [units, setUnits] = useState<UnitsPreference>('kg')
  const [selectedExercise, setSelectedExercise] = useState<ExerciseDefinitionRow | null>(null)
  const [showExercisePicker, setShowExercisePicker] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const reportedErrors = useRef(new Set<string>())

  const {
    dashboard,
    weeklyGoal,
    volumeComparison,
    overviewState,
    strengthState,
    bodyState,
    overviewError,
    strengthError,
    bodyError,
    refetchAll,
  } = useProgressDashboard(timeRange, selectedExercise)

  const shouldGateInsight = sync.pendingCount > 0 || sync.pausedByAuth

  useEffect(() => {
    let cancelled = false

    void loadProfilePreferences(user?.id)
      .then((preferences) => {
        if (!cancelled) {
          setUnits(preferences.units)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    screen('Progress')
    capture('progress_v2_screen_view', { range: timeRange, lens: selectedLens })
  }, [])

  useEffect(() => {
    const checks: Array<{ key: string; state: string }> = [
      { key: 'overview', state: overviewState },
      { key: 'strength', state: strengthState },
      { key: 'body', state: bodyState },
    ]

    for (const check of checks) {
      if (check.state === 'error' && !reportedErrors.current.has(check.key)) {
        reportedErrors.current.add(check.key)
        capture('progress_v2_load_error', {
          module: check.key,
          range: timeRange,
          lens: selectedLens,
        })
      }
    }
  }, [bodyState, overviewState, selectedLens, strengthState, timeRange])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetchAll()
    setRefreshing(false)
  }, [refetchAll])

  const winsViewModel = useMemo(() => {
    if (!dashboard) return { wins: [] }
    return buildProgressWins(dashboard.winsInput)
  }, [dashboard])

  const handleRangeChange = useCallback((range: TimeRange) => {
    setTimeRange(range)
    capture('progress_v2_range_changed', { range })
  }, [])

  const handleLensChange = useCallback((lens: ProgressLens) => {
    setSelectedLens(lens)
    capture('progress_v2_lens_changed', { lens })
  }, [])

  const handleSelectExercise = useCallback((exercise: ExerciseDefinitionRow) => {
    setSelectedExercise(exercise)
    setShowExercisePicker(false)
  }, [])

  const statusKey = dashboard
    ? (`progress.v2.hero.status.${dashboard.hero.status}` as TranslationKey)
    : null

  function renderHero() {
    if (overviewState === 'loading') return <HeroSkeleton />
    if (overviewState === 'error') {
      return (
        <RetryCard
          message={overviewError?.message ?? t('progress.v2.errorSummary')}
          buttonLabel={t('progress.v2.retry')}
          onRetry={() => {
            void refetchAll()
          }}
        />
      )
    }

    if (!dashboard || overviewState === 'empty') {
      return (
        <EmptyStateCard
          title={t('progress.v2.heroEmpty.title')}
          body={t('progress.v2.heroEmpty.body')}
        />
      )
    }

    const hero = dashboard.hero
    const chipColors = statusColor(hero.status)

    return (
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroEyebrow}>{t('progress.v2.hero.heading')}</Text>
          {statusKey ? (
            <View style={[styles.statusChip, { backgroundColor: chipColors.bg }]}>
              <Text style={[styles.statusChipText, { color: chipColors.text }]}>
                {t(statusKey)}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.heroValue}>{hero.workoutsPerWeek.toFixed(1)}</Text>
        <Text style={styles.heroSubhead}>
          {t('progress.v2.hero.subhead', { goal: weeklyGoal })}
        </Text>

        <View style={styles.heroComparisonRow}>
          <Text style={styles.heroComparisonValue}>
            {comparisonLabel(hero.delta.label, t('progress.v2.compare.noPrevious'))}
          </Text>
          <Text style={styles.heroComparisonText}>{t('progress.v2.compare.previousPeriod')}</Text>
        </View>

        <MiniBarTrend series={hero.trendSeries} />

        <Text style={styles.heroSummary}>{t(hero.summaryKey)}</Text>
      </View>
    )
  }

  function renderWinsStrip() {
    if (winsViewModel.wins.length === 0) return null

    return (
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('progress.v2.wins.title')}</Text>
          <TouchableOpacity
            accessibilityRole="link"
            onPress={() => router.push('/(app)/trophies')}
            style={styles.inlineLink}
          >
            <Text style={styles.inlineLinkText} numberOfLines={2} ellipsizeMode="tail">
              {t('progress.v2.wins.viewAll')}
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.winsStrip}
        >
          {winsViewModel.wins.map((win) => (
            <View key={win.id} style={styles.winCard}>
              <View style={styles.winIconWrap}>
                <Ionicons
                  name={WIN_ICON[win.icon]}
                  size={16}
                  color={
                    win.variant === 'positive' ? colors.accent.secondary : colors.accent.primary
                  }
                />
              </View>
              <Text style={styles.winTitle}>{t(win.title.key, win.title.params)}</Text>
              <Text style={styles.winBody}>{t(win.body.key, win.body.params)}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    )
  }

  function renderOverviewLens() {
    if (!dashboard) return null

    const consistency = dashboard.consistency
    const volumeDeltaLabel = volumeComparison
      ? comparisonLabel(volumeComparison.delta.label, t('progress.v2.compare.noPrevious'))
      : t('progress.v2.metricNoValue')

    return (
      <View style={styles.lensStack}>
        {overviewState === 'loading' ? (
          <ModuleSkeleton />
        ) : overviewState === 'error' ? null : consistency.isEmpty ? (
          <EmptyStateCard
            title={t('progress.v2.consistency.empty.title')}
            body={t('progress.v2.consistency.empty.body')}
          />
        ) : (
          <View style={styles.moduleCard}>
            <Text style={styles.moduleEyebrow}>{t('progress.v2.consistency.headline')}</Text>
            <View style={styles.metricRow}>
              <View style={styles.metricPrimaryBlock}>
                <Text style={styles.moduleValue}>{consistency.workoutsPerWeek.toFixed(1)}</Text>
                <Text style={styles.moduleValueLabel}>
                  {t('progress.v2.consistency.valueLabel')}
                </Text>
              </View>
              <View style={styles.metricSecondaryBlock}>
                <Text style={styles.moduleComparisonValue}>
                  {comparisonLabel(consistency.delta.label, t('progress.v2.compare.noPrevious'))}
                </Text>
                <Text style={styles.moduleComparisonText}>
                  {t('progress.v2.compare.previousPeriod')}
                </Text>
              </View>
            </View>

            <View style={styles.overviewStatsRow}>
              <View style={styles.statPill}>
                <Text style={styles.statPillValue} numberOfLines={1}>
                  {Math.round(consistency.minutesTrained)}
                </Text>
                <Text style={styles.statPillLabel} numberOfLines={2}>
                  {t('progress.v2.consistency.minutes')}
                </Text>
              </View>
              <View style={styles.statPill}>
                <Text style={styles.statPillValue} numberOfLines={1}>
                  {volumeDeltaLabel}
                </Text>
                <Text style={styles.statPillLabel} numberOfLines={2}>
                  {t('progress.v2.consistency.volumeDelta')}
                </Text>
              </View>
              <View style={styles.statPill}>
                <Text style={styles.statPillValue} numberOfLines={1}>
                  {consistency.goalHitWeeks}
                </Text>
                <Text style={styles.statPillLabel} numberOfLines={2}>
                  {t('progress.v2.consistency.goalHitWeeks')}
                </Text>
              </View>
            </View>

            <WeeklyBars series={consistency.weeklySeries} />

            <Text style={styles.takeawayText}>
              {t(consistency.takeawayKey, consistency.takeawayParams)}
            </Text>
          </View>
        )}

        <View style={[styles.moduleCard, shouldGateInsight ? styles.syncInsightCard : null]}>
          <Text style={styles.moduleEyebrow}>{t('progress.v2.coaching.title')}</Text>
          <Text style={styles.coachingBody}>
            {shouldGateInsight
              ? t('progress.v2.insightsAfterSync')
              : t(dashboard.coaching.bodyKey, dashboard.coaching.bodyParams)}
          </Text>
        </View>
      </View>
    )
  }

  function renderStrengthLens() {
    return (
      <View style={styles.lensStack}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('progress.v2.lens.strength')}</Text>
          <StrengthPicker
            label={selectedExercise?.name ?? t('progress.v2.selectLift')}
            onPress={() => setShowExercisePicker(true)}
          />
        </View>

        {strengthState === 'loading' ? (
          <ModuleSkeleton />
        ) : strengthState === 'error' ? (
          <RetryCard
            message={strengthError?.message ?? t('progress.v2.errorTrend')}
            buttonLabel={t('progress.v2.retry')}
            onRetry={() => {
              void refetchAll()
            }}
          />
        ) : !selectedExercise ? (
          <EmptyStateCard
            title={t('progress.v2.strength.emptyPick.title')}
            body={t('progress.v2.strength.emptyPick.body')}
          />
        ) : !dashboard || dashboard.strength.isEmpty ? (
          <EmptyStateCard
            title={t('progress.v2.strength.empty.title', { lift: selectedExercise.name })}
            body={t('progress.v2.strength.empty.body')}
          />
        ) : (
          <View style={styles.moduleCard}>
            <Text style={styles.moduleEyebrow}>{t('progress.v2.strength.headline')}</Text>
            <View style={styles.metricRow}>
              <View style={styles.metricPrimaryBlock}>
                <Text style={styles.moduleValue}>
                  {fromWeightKg(dashboard.strength.currentBestKg ?? 0, units).toFixed(1)}
                </Text>
                <Text style={styles.moduleValueLabel}>
                  {t('progress.v2.strength.valueLabel', { units })}
                </Text>
              </View>
              <View style={styles.metricSecondaryBlock}>
                <Text style={styles.moduleComparisonValue}>
                  {dashboard.strength.delta
                    ? comparisonLabel(
                        dashboard.strength.delta.label,
                        t('progress.v2.compare.noPrevious'),
                      )
                    : t('progress.v2.compare.noPrevious')}
                </Text>
                <Text style={styles.moduleComparisonText}>
                  {t('progress.v2.compare.previousPeriod')}
                </Text>
              </View>
            </View>

            <StrengthLineChart points={dashboard.strength.points} units={units} />

            <View style={styles.inlineStatsRow}>
              <View style={styles.inlineStat}>
                <Text style={styles.inlineStatValue}>{dashboard.strength.prCount}</Text>
                <Text style={styles.inlineStatLabel}>{t('progress.v2.strength.prMarkers')}</Text>
              </View>
              <TouchableOpacity
                style={styles.inlineCta}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/progress/exercise/[exerciseId]',
                    params: {
                      exerciseId: selectedExercise.id,
                      exerciseName: selectedExercise.name,
                    },
                  })
                }
              >
                <Text style={styles.inlineCtaText}>{t('progress.v2.strength.cta')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.takeawayText}>{t(dashboard.strength.takeawayKey)}</Text>
          </View>
        )}
      </View>
    )
  }

  function renderBodyLens() {
    if (bodyState === 'loading') {
      return (
        <View style={styles.lensStack}>
          <ModuleSkeleton />
        </View>
      )
    }

    if (bodyState === 'error') {
      return (
        <View style={styles.lensStack}>
          <RetryCard
            message={bodyError?.message ?? t('progress.v2.errorBalance')}
            buttonLabel={t('progress.v2.retry')}
            onRetry={() => {
              void refetchAll()
            }}
          />
        </View>
      )
    }

    if (!dashboard || dashboard.body.isEmpty) {
      return (
        <View style={styles.lensStack}>
          <EmptyStateCard
            title={t('progress.v2.body.empty.title')}
            body={t('progress.v2.body.empty.body')}
          />
        </View>
      )
    }

    return (
      <View style={styles.lensStack}>
        <View style={styles.moduleCard}>
          <Text style={styles.moduleEyebrow}>{t('progress.v2.body.headline')}</Text>
          <View style={styles.metricRow}>
            <View style={styles.metricPrimaryBlock}>
              <Text style={styles.moduleValue}>
                {dashboard.body.leadingRegion?.currentPct ?? 0}%
              </Text>
              <Text style={styles.moduleValueLabel}>
                {dashboard.body.leadingRegion
                  ? t(regionLabelKey(dashboard.body.leadingRegion.key))
                  : t('progress.v2.metricNoValue')}
              </Text>
            </View>
            <View style={styles.metricSecondaryBlock}>
              <Text style={styles.moduleComparisonValue}>
                {dashboard.body.trailingRegion
                  ? `${formatRegionDelta(dashboard.body.trailingRegion.deltaPct)} pts`
                  : t('progress.v2.compare.noPrevious')}
              </Text>
              <Text style={styles.moduleComparisonText}>{t('progress.v2.body.shiftLabel')}</Text>
            </View>
          </View>

          <View style={styles.bodyRows}>
            {BODY_REGION_KEYS.map((regionKey) => {
              const region = dashboard.body.regions.find((entry) => entry.key === regionKey)
              if (!region) return null

              return (
                <View key={region.key} style={styles.bodyRow}>
                  <View style={styles.bodyRowHeader}>
                    <Text style={styles.bodyRowLabel} numberOfLines={2}>
                      {t(regionLabelKey(region.key))}
                    </Text>
                    <Text style={styles.bodyRowMeta} numberOfLines={2}>
                      {region.currentPct}% · {t('progress.v2.body.previousLabel')}{' '}
                      {region.previousPct}%
                    </Text>
                  </View>
                  <View style={styles.bodyBarTrack}>
                    <View style={[styles.bodyBarPrevious, { width: `${region.previousPct}%` }]} />
                    <View style={[styles.bodyBarCurrent, { width: `${region.currentPct}%` }]} />
                  </View>
                </View>
              )
            })}
          </View>

          <Text style={styles.takeawayText}>
            {t(dashboard.body.takeawayKey, {
              ...dashboard.body.takeawayParams,
              ...(dashboard.body.takeawayParams?.['region']
                ? {
                    region: t(
                      regionLabelKey(dashboard.body.takeawayParams['region'] as BodyRegionKey),
                    ),
                  }
                : {}),
            })}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <SunriseWash height={220} />
      <ProgressHeader
        selectedRange={timeRange}
        onRangeChange={handleRangeChange}
        selectedLens={selectedLens}
        onLensChange={handleLensChange}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + space[10] }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <SyncStatusBanner
          pendingCount={sync.pendingCount}
          pausedByAuth={sync.pausedByAuth}
          onRetry={() => {
            void sync.refresh()
          }}
        />

        {renderHero()}
        {renderWinsStrip()}
        {selectedLens === 'overview'
          ? renderOverviewLens()
          : selectedLens === 'strength'
            ? renderStrengthLens()
            : renderBodyLens()}
      </ScrollView>

      <Modal
        visible={showExercisePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowExercisePicker(false)}
      >
        <ExerciseSearch
          onSelectExercise={handleSelectExercise}
          onClose={() => setShowExercisePicker(false)}
          userId={user?.id}
          allowedCategories={['strength']}
        />
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: space[4],
    paddingTop: space[2],
  },
  heroCard: {
    marginHorizontal: space[4],
    borderRadius: radii.lg,
    paddingHorizontal: space[5],
    paddingVertical: space[5],
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: space[3],
    ...elevation.sm,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space[2],
    flexWrap: 'wrap',
  },
  heroEyebrow: {
    ...type.micro,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statusChip: {
    borderRadius: radii.full,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
  },
  statusChipText: {
    ...type.micro,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroValue: {
    ...type.display,
    color: colors.text.primary,
  },
  heroSubhead: {
    ...type.body,
    color: colors.text.secondary,
    marginTop: -space[2],
  },
  heroComparisonRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space[2],
    flexWrap: 'wrap',
  },
  heroComparisonValue: {
    ...type.label,
    color: colors.accent.primary,
  },
  heroComparisonText: {
    ...type.bodySm,
    color: colors.text.muted,
  },
  heroSummary: {
    ...type.bodySm,
    color: colors.text.secondary,
  },
  miniBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 54,
    gap: 6,
  },
  miniBarTrack: {
    flex: 1,
    justifyContent: 'flex-end',
    height: '100%',
  },
  miniBarFill: {
    width: '100%',
    borderRadius: 999,
    minHeight: 4,
  },
  sectionBlock: {
    gap: space[3],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginHorizontal: space[4],
    gap: space[3],
  },
  sectionTitle: {
    ...type.label,
    color: colors.text.primary,
    flex: 1,
    flexShrink: 1,
  },
  inlineLink: {
    paddingVertical: space[1],
    maxWidth: '50%',
  },
  inlineLinkText: {
    ...type.labelSm,
    color: colors.accent.primary,
    textAlign: 'right',
  },
  winsStrip: {
    paddingHorizontal: space[4],
    gap: space[3],
  },
  winCard: {
    minWidth: 180,
    maxWidth: 280,
    borderRadius: radii.md,
    padding: space[4],
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: space[2],
    ...elevation.sm,
  },
  winIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.secondary,
  },
  winTitle: {
    ...type.labelSm,
    color: colors.text.primary,
  },
  winBody: {
    ...type.bodySm,
    color: colors.text.secondary,
  },
  lensStack: {
    gap: space[4],
  },
  moduleCard: {
    marginHorizontal: space[4],
    borderRadius: radii.lg,
    padding: space[4],
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: space[3],
    ...elevation.sm,
  },
  moduleEyebrow: {
    ...type.micro,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space[3],
    flexWrap: 'wrap',
  },
  metricPrimaryBlock: {
    flex: 1,
    gap: 2,
  },
  metricSecondaryBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    flexShrink: 1,
    flexBasis: 136,
    maxWidth: '100%',
  },
  moduleValue: {
    ...type.display,
    color: colors.text.primary,
  },
  moduleValueLabel: {
    ...type.bodySm,
    color: colors.text.secondary,
  },
  moduleComparisonValue: {
    ...type.label,
    color: colors.accent.primary,
  },
  moduleComparisonText: {
    ...type.bodySm,
    color: colors.text.muted,
    textAlign: 'right',
  },
  overviewStatsRow: {
    flexDirection: 'row',
    gap: space[2],
    flexWrap: 'wrap',
  },
  statPill: {
    flex: 1,
    minWidth: 92,
    borderRadius: radii.md,
    backgroundColor: colors.bg.secondary,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: 2,
  },
  statPillValue: {
    ...type.label,
    color: colors.text.primary,
  },
  statPillLabel: {
    ...type.micro,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weeklyBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    minHeight: 132,
  },
  weeklyBarColumn: {
    flex: 1,
    gap: space[2],
    alignItems: 'center',
  },
  weeklyBarTrack: {
    width: '100%',
    height: 110,
    justifyContent: 'flex-end',
    borderRadius: radii.md,
    backgroundColor: colors.bg.secondary,
    padding: 4,
  },
  weeklyBarFill: {
    width: '100%',
    borderRadius: radii.sm,
    minHeight: 4,
  },
  weeklyBarLabel: {
    ...type.micro,
    color: colors.text.muted,
  },
  takeawayText: {
    ...type.bodySm,
    color: colors.text.secondary,
  },
  syncInsightCard: {
    backgroundColor: colors.bg.secondary,
  },
  coachingBody: {
    ...type.body,
    color: colors.text.secondary,
  },
  retryCard: {
    marginHorizontal: space[4],
    borderRadius: radii.md,
    padding: space[4],
    backgroundColor: colors.semantic.errorMuted,
    borderWidth: 1,
    borderColor: colors.semantic.errorMuted,
    gap: space[3],
  },
  retryText: {
    ...type.bodySm,
    color: colors.text.primary,
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    backgroundColor: colors.accent.primary,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  retryButtonText: {
    ...type.labelSm,
    color: colors.text.inverse,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.full,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    maxWidth: '52%',
  },
  pickerLabel: {
    ...type.labelSm,
    color: colors.text.secondary,
    flexShrink: 1,
    flexGrow: 1,
  },
  lineChart: {
    paddingTop: space[2],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  inlineStatsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space[3],
    flexWrap: 'wrap',
  },
  inlineStat: {
    gap: 2,
  },
  inlineStatValue: {
    ...type.label,
    color: colors.text.primary,
  },
  inlineStatLabel: {
    ...type.bodySm,
    color: colors.text.muted,
  },
  inlineCta: {
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.full,
    backgroundColor: colors.bg.secondary,
    alignSelf: 'flex-start',
  },
  inlineCtaText: {
    ...type.labelSm,
    color: colors.accent.primary,
  },
  bodyRows: {
    gap: space[3],
  },
  bodyRow: {
    gap: space[2],
  },
  bodyRowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space[2],
    flexWrap: 'wrap',
  },
  bodyRowLabel: {
    ...type.labelSm,
    color: colors.text.primary,
    flex: 1,
    flexShrink: 1,
  },
  bodyRowMeta: {
    width: '100%',
    flexShrink: 1,
    ...type.bodySm,
    color: colors.text.muted,
    textAlign: 'left',
  },
  bodyBarTrack: {
    position: 'relative',
    height: 14,
    borderRadius: radii.full,
    backgroundColor: colors.bg.secondary,
    overflow: 'hidden',
  },
  bodyBarPrevious: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: radii.full,
    backgroundColor: colors.border.default,
  },
  bodyBarCurrent: {
    position: 'absolute',
    left: 0,
    top: 2,
    bottom: 2,
    borderRadius: radii.full,
    backgroundColor: colors.accent.primary,
  },
})
