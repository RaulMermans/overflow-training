import { useCallback } from 'react'
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  AccentRule,
  AppHeader,
  Box,
  ErrorCard,
  LoadingState,
  Screen,
} from '../../../src/components/ui'
import { SunriseWash } from '../../../src/components/ui/SunriseWash'
import { WeeklyShareCardSvg } from '../../../src/components/share/WeeklyShareCardSvg'
import { useAuth } from '../../../src/auth/useAuth'
import { useI18n } from '../../../src/i18n/useI18n'
import { CheckinDueCard } from '../../../src/features/today/components/CheckinDueCard'
import { NoRoutinesSetupCard } from '../../../src/features/today/components/NoRoutinesSetupCard'
import { PrimaryActionCard } from '../../../src/features/today/components/PrimaryActionCard'
import { WeekInsightsCard } from '../../../src/features/today/components/WeekInsightsCard'
import { useTodayScreenData } from '../../../src/features/today/useTodayScreenData'
import { useWeeklyShare } from '../../../src/features/share/useWeeklyShare'
import { useSyncStatus } from '../../../src/features/sync/useSyncStatus'
import { colors } from '../../../src/theme/tokens'

export default function WorkoutScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isTablet = width >= 768
  const sectionPadding: 'xl' | '2xl' = isTablet ? '2xl' : 'xl'
  const { user } = useAuth()
  const { t, language } = useI18n()
  const sync = useSyncStatus()

  const {
    isInitialLoading,
    isRefreshing,
    isMutating,
    isStartingRoutineId,
    hasInProgress,
    errorState,
    shouldShowBlockingError,
    errorTitle,
    errorMessage,
    greeting,
    motivationSubtitle,
    loadWorkouts,
    resumeWorkout,
    startQuickRoutine,
    hasRoutines,
    todayDateKey,
    scheduledToday,
    nextScheduled,
    nextScheduledDateLabel,
    todayCardActionDisabled,
    showCheckinDueCard,
    checkinDueDateLabel,
    sessionsThisWeek,
    weeklyGoal,
    cadence,
    currentStreak,
    weekRhythm,
    weekSummary,
    lastWorkoutRelative,
  } = useTodayScreenData({
    user,
    t,
    language,
    refresh: sync.refresh,
  })

  const {
    weeklyShareSvgRef,
    weeklyShareData,
    isWeeklySharing: _isWeeklySharing,
    handleShareWeek,
  } = useWeeklyShare({
    userId: user?.id ?? null,
    sessionsThisWeek,
    weeklyGoal,
    currentStreak,
    weekRhythm,
    language,
  })

  const handleResumeWorkout = async () => {
    const result = await resumeWorkout()
    if (!result.workoutId) {
      if (result.errorMessage) {
        Alert.alert(t('common.error'), result.errorMessage)
      }
      return
    }

    router.push({
      pathname: '/(app)/workout-session',
      params: { workoutId: result.workoutId },
    })
  }

  const handleStartQuickRoutine = (routineId: string, plannedDateKey: string) => {
    void (async () => {
      const tapStart = __DEV__ ? performance.now() : 0
      const result = await startQuickRoutine(routineId, plannedDateKey, {
        onWorkoutCreated: (workoutId) => {
          router.push({
            pathname: '/(app)/workout-session',
            params: { workoutId },
          })
        },
      })

      if (__DEV__) {
        console.warn(
          `[StartWorkoutDiag] tap to result: ${(performance.now() - tapStart).toFixed(0)}ms`,
        )
      }

      if (result.errorMessage || !result.workoutId) {
        if (result.errorMessage) {
          Alert.alert(t('today.errorStartRoutine'), result.errorMessage)
        }
        return
      }

      if (result.skippedExerciseDefinitionIds.length > 0) {
        Alert.alert(
          t('today.partialRoutine'),
          t('today.skippedExercises', {
            count: String(result.skippedExerciseDefinitionIds.length),
            plural: result.skippedExerciseDefinitionIds.length === 1 ? '' : 's',
          }),
        )
      }
    })()
  }

  const handleRefresh = useCallback(async () => {
    await loadWorkouts()
  }, [loadWorkouts])

  return (
    <Screen
      scroll={false}
      horizontalPadding="none"
      bottomPadding="none"
      contentAlign={isTablet ? 'center' : 'stretch'}
      maxContentWidth={isTablet ? 1160 : undefined}
    >
      <SunriseWash />
      <Box flex={1}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent.primary}
            />
          }
        >
          <Box paddingHorizontal={sectionPadding} marginBottom="sm">
            <AccentRule />
          </Box>
          <Box paddingHorizontal={sectionPadding}>
            <AppHeader
              title={greeting}
              subtitle={hasInProgress ? t('today.resumeSubtitle') : motivationSubtitle}
              subtitleNumberOfLines={2}
            />
          </Box>

          {isInitialLoading ? (
            <Box paddingHorizontal={sectionPadding}>
              <LoadingState message={t('today.loading')} />
            </Box>
          ) : shouldShowBlockingError ? (
            <Box paddingHorizontal={sectionPadding}>
              <ErrorCard
                title={errorTitle}
                message={errorMessage}
                primaryActionLabel={
                  errorState?.primaryAction === 'check_connection'
                    ? t('errors.action.checkConnection')
                    : t('common.tryAgain')
                }
                onPrimaryAction={loadWorkouts}
                detailsLabel={t('errors.action.details')}
                detailsTitle={t('errors.detailsTitle')}
                details={errorState?.rawMessage}
                closeLabel={t('common.close')}
              />
            </Box>
          ) : (
            <>
              <Box paddingHorizontal={sectionPadding} marginBottom="md">
                <WeekInsightsCard
                  isTablet={isTablet}
                  sessionsThisWeek={sessionsThisWeek}
                  weeklyGoal={weeklyGoal}
                  cadenceTone={cadence.tone}
                  currentStreak={currentStreak}
                  weekRhythm={weekRhythm}
                  weekSummary={weekSummary}
                  lastWorkoutRelative={lastWorkoutRelative}
                  onOpenCalendar={() => router.push('/(app)/(tabs)/calendar')}
                  onOpenRoutines={() => router.push('/(app)/routines')}
                  onShareWeek={() => {
                    void handleShareWeek()
                  }}
                  t={t}
                />
              </Box>

              {!hasRoutines ? (
                <Box paddingHorizontal={sectionPadding} marginBottom="md">
                  <NoRoutinesSetupCard
                    isTablet={isTablet}
                    onCreateRoutine={() => router.push('/(app)/routines/new')}
                    onScheduleRoutine={() =>
                      router.push({
                        pathname: '/(app)/(tabs)/calendar',
                        params: { dateKey: todayDateKey, openPicker: '1' },
                      })
                    }
                    t={t}
                  />
                </Box>
              ) : (
                <Box paddingHorizontal={sectionPadding} marginBottom="md">
                  <PrimaryActionCard
                    isTablet={isTablet}
                    hasInProgress={hasInProgress}
                    scheduledToday={scheduledToday}
                    nextScheduled={nextScheduled}
                    nextScheduledDateLabel={nextScheduledDateLabel}
                    isStarting={isMutating}
                    isStartingRoutineId={isStartingRoutineId}
                    todayCardActionDisabled={todayCardActionDisabled}
                    onResumeWorkout={() => {
                      void handleResumeWorkout()
                    }}
                    onStartQuickRoutine={(routineId, plannedDateKey) => {
                      void handleStartQuickRoutine(routineId, plannedDateKey)
                    }}
                    onOpenCalendar={() => router.push('/(app)/(tabs)/calendar')}
                    onBuildRoutine={() => router.push('/(app)/routines/new')}
                    t={t}
                  />
                </Box>
              )}

              {showCheckinDueCard ? (
                <Box paddingHorizontal={sectionPadding} marginBottom="md">
                  <CheckinDueCard
                    isTablet={isTablet}
                    checkinDueDateLabel={checkinDueDateLabel}
                    onPress={() => router.push('/(app)/checkins')}
                    t={t}
                  />
                </Box>
              ) : null}
            </>
          )}
        </ScrollView>
      </Box>

      {weeklyShareData ? (
        <View style={hiddenStyles.offscreen} pointerEvents="none">
          <WeeklyShareCardSvg
            data={weeklyShareData}
            labels={{
              title: t('share.weekTitle'),
              volume: t('share.volume'),
              streak: t('share.streak'),
              sessions: t('share.weekSessions'),
            }}
            svgRef={weeklyShareSvgRef}
          />
        </View>
      ) : null}
    </Screen>
  )
}

const hiddenStyles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    top: -3000,
    left: -3000,
    opacity: 0,
  },
})
