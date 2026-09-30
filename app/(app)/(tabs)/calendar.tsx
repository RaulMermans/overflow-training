import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { CalendarList, type DateData } from 'react-native-calendars'
import type { DayProps as RNCalendarDayProps } from 'react-native-calendars/src/calendar/day'
import { useFocusEffect } from '@react-navigation/native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  AccentRule,
  AppHeader,
  Box,
  EmptyState,
  ErrorCard,
  LoadingState,
  Screen,
  Text,
} from '../../../src/components/ui'
import { useAuth } from '../../../src/auth/useAuth'
import { fetchCompletedWorkoutDates } from '../../../src/db/workouts'
import { loadWeeklyWorkoutsGoal } from '../../../src/db/userSettings'
import { startRoutine } from '../../../src/features/routines/startRoutine'
import {
  buildAgendaWindowKeys,
  buildCalendarConsistencySummary,
  shouldLoadCalendarConsistency,
  shouldShowCalendarConsistencyStrip,
} from '../../../src/features/calendar/consistencySummary'
import {
  buildMarkedDates,
  buildSelectedDayModel,
  groupWorkoutsByDate,
  toDateKeyFromIso,
} from '../../../src/features/calendar/monthCalendar'
import {
  addMonthsToDateKey,
  toMonthStartDateKey,
} from '../../../src/features/calendar/monthNavigation'
import type { PlannedDay } from '../../../src/features/schedule/types'
import {
  fetchScheduledRoutinesForDateRange,
  scheduleRoutineForDate,
  clearScheduledRoutineForDate,
} from '../../../src/db/scheduledRoutines'
import {
  loadRoutines,
  loadRoutineUsage,
  replaceRoutinesSnapshot,
  type Routine,
  type RoutineUsageMap,
} from '../../../src/lib/routines'
import { toCloudRoutinePayload } from '../../../src/db/routineCloudPayload'
import {
  fetchCloudRoutinesWithItems,
  upsertCloudRoutineWithItems,
} from '../../../src/db/routinesPlans'
import { colors, radius, spacing, type } from '../../../src/theme'
import { useI18n } from '../../../src/i18n/useI18n'
import { applyCalendarLocale } from '../../../src/lib/calendarLocale'
import { useSyncStatus } from '../../../src/features/sync/useSyncStatus'
import { buildActionableErrorState, sanitizeErrorMessage } from '../../../src/utils/errorMessages'
import { DayDetailSheet } from '../../../src/features/calendar/components/DayDetailSheet'
import { RoutinePickerSheet } from '../../../src/features/calendar/components/RoutinePickerSheet'
import { buildRoutinePickerSections } from '../../../src/features/calendar/routinePickerModel'
import { captureCalendarPlanStart } from '../../../src/features/calendar/planStartAnalytics'
import {
  resolveCalendarPlannerIntent,
  shouldAutoOpenPlanner,
} from '../../../src/features/calendar/plannerIntent'
import {
  closeSheet as closeSheetState,
  createInitialSheetState,
  openDaySheet,
  openRoutinePicker,
  returnToDaySheet,
  type SheetState,
} from '../../../src/features/calendar/sheetStateMachine'
import { mergeRoutines, type MergeRoutine } from '../../../src/features/sync/routinesPlans/merge'
import { toRoutineFromCloud } from '../../../src/features/sync/routinesPlans/syncEngine'
import {
  ENABLE_CALENDAR_AGENDA,
  ENABLE_CALENDAR_CONSISTENCY_STRIP,
  useNewScheduleSource,
} from '../../../src/config/featureFlags'
import { MonthlyShareCardSvg } from '../../../src/components/share/MonthlyShareCardSvg'
import { useMonthlyShare } from '../../../src/features/share/useMonthlyShare'

interface WorkoutDateRow {
  id: string
  started_at: string | null
  ended_at: string | null
  created_at?: string | null
}

type CalendarView = 'month' | 'agenda'

type AgendaItemKind = 'planned' | 'completed'

interface AgendaItem {
  key: string
  kind: AgendaItemKind
  dateKey: string
  startTime: string
  routineName: string
  id: string
  title: string
  subtitle: string
  workoutId?: string
}

interface AgendaSection {
  key: 'upcoming' | 'recent'
  title: string
  data: AgendaItem[]
}

const AGENDA_WINDOW_DAYS = 14
const DEFAULT_WEEKLY_GOAL = 4
const CALENDAR_DAY_TOUCH_SIZE = 46
const CALENDAR_DAY_BADGE_SIZE = 38
const CALENDAR_DAY_MARKER_SIZE = 5
const WEEKDAY_ROW_HEIGHT = 28

const WEEKDAY_LABEL_KEYS = [
  'weekday.sun',
  'weekday.mon',
  'weekday.tue',
  'weekday.wed',
  'weekday.thu',
  'weekday.fri',
  'weekday.sat',
] as const

const calendarTheme = {
  backgroundColor: colors.bg.primary,
  calendarBackground: colors.bg.primary,
  dayTextColor: colors.text.primary,
  monthTextColor: colors.text.primary,
  textSectionTitleColor: colors.text.muted,
  textDisabledColor: colors.text.disabled,
  textInactiveColor: colors.text.disabled,
  selectedDayBackgroundColor: colors.accent.primary,
  selectedDayTextColor: colors.text.inverse,
  todayTextColor: colors.accent.primary,
  dotColor: colors.accent.secondary,
  selectedDotColor: colors.accent.secondary,
  textDayFontFamily: type.label.fontFamily,
  textMonthFontFamily: type.h2.fontFamily,
  textDayHeaderFontFamily: type.labelSm.fontFamily,
  textDayFontWeight: '500',
  textMonthFontWeight: '600',
  textDayHeaderFontWeight: '500',
  textDayFontSize: 16,
  textDayHeaderFontSize: 11,
  weekVerticalMargin: 8,
  'stylesheet.calendar.main': {
    container: {
      paddingLeft: spacing[1],
      paddingRight: spacing[1],
      backgroundColor: colors.bg.primary,
    },
    week: {
      marginVertical: spacing[1],
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
  },
} as unknown as ComponentProps<typeof CalendarList>['theme']

type CalendarDayComponentProps = RNCalendarDayProps & { date?: DateData }

interface CalendarListHandle {
  scrollToMonth?: (date: string) => void
}

function formatCalendarDate(dateKey: string, locale: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatWorkoutTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  )
}

function compareAgendaItemsByDateAscending(a: AgendaItem, b: AgendaItem): number {
  const dateCompare = a.dateKey.localeCompare(b.dateKey)
  if (dateCompare !== 0) return dateCompare

  const timeCompare = a.startTime.localeCompare(b.startTime)
  if (timeCompare !== 0) return timeCompare

  const routineCompare = a.routineName.localeCompare(b.routineName)
  if (routineCompare !== 0) return routineCompare

  return a.id.localeCompare(b.id)
}

function compareAgendaItemsByDateDescending(a: AgendaItem, b: AgendaItem): number {
  const dateCompare = b.dateKey.localeCompare(a.dateKey)
  if (dateCompare !== 0) return dateCompare

  const timeCompare = b.startTime.localeCompare(a.startTime)
  if (timeCompare !== 0) return timeCompare

  const routineCompare = a.routineName.localeCompare(b.routineName)
  if (routineCompare !== 0) return routineCompare

  return a.id.localeCompare(b.id)
}

function isRoutineSyncFailureStatus(status: 'synced' | 'offline' | 'error' | 'skipped'): boolean {
  return status === 'offline' || status === 'error'
}

function formatMonthLabel(dateKey: string, locale: string): string {
  const raw = new Date(`${toMonthStartDateKey(dateKey)}T12:00:00`).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => {
      clearTimeout(timeout)
    }
  }, [delayMs, value])

  return debouncedValue
}

function DayLegendItem({ color, label }: { color: string; label: string }) {
  return (
    <Box flexDirection="row" alignItems="center" marginRight="md">
      <Box
        width={CALENDAR_DAY_MARKER_SIZE}
        height={CALENDAR_DAY_MARKER_SIZE}
        borderRadius="full"
        marginRight="xs"
        style={{ backgroundColor: color }}
      />
      <Text variant="micro" color="textMuted" style={styles.legendLabel}>
        {label}
      </Text>
    </Box>
  )
}

function CalendarDayCell({
  date,
  marking,
  state,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
  disableAllTouchEventsForDisabledDays,
  disableAllTouchEventsForInactiveDays,
}: CalendarDayComponentProps) {
  if (!date) {
    return <View style={styles.calendarDayEmpty} />
  }

  const stableTestID = date.dateString ? `calendar:day:${date.dateString}` : testID
  const isSelected = Boolean(marking?.selected || state === 'selected')
  const isDisabled =
    typeof marking?.disabled !== 'undefined' ? Boolean(marking.disabled) : state === 'disabled'
  const isInactive =
    typeof marking?.inactive !== 'undefined' ? Boolean(marking.inactive) : state === 'inactive'
  const isToday = typeof marking?.today !== 'undefined' ? Boolean(marking.today) : state === 'today'
  const dots = Array.isArray(marking?.dots) ? marking.dots : []
  const hasCompletedWorkout = dots.some((dot) => dot?.key === 'workout')
  const hasPlannedRoutine = dots.some((dot) => dot?.key === 'plan')

  let disableTouch = false
  if (typeof marking?.disableTouchEvent === 'boolean') {
    disableTouch = marking.disableTouchEvent
  } else if (disableAllTouchEventsForDisabledDays && isDisabled) {
    disableTouch = true
  } else if (disableAllTouchEventsForInactiveDays && isInactive) {
    disableTouch = true
  }

  return (
    <Pressable
      testID={stableTestID}
      accessibilityRole={disableTouch ? undefined : 'button'}
      accessibilityLabel={accessibilityLabel}
      disabled={disableTouch}
      onPress={!disableTouch ? () => onPress?.(date) : undefined}
      onLongPress={!disableTouch ? () => onLongPress?.(date) : undefined}
      style={({ pressed }) => [
        styles.calendarDayTouchTarget,
        pressed && !disableTouch ? styles.calendarDayTouchTargetPressed : null,
      ]}
    >
      <View style={styles.calendarDayContent}>
        <View
          style={[
            styles.calendarDayBadge,
            hasCompletedWorkout && !isSelected ? styles.calendarDayBadgeCompleted : null,
            isToday ? styles.calendarDayBadgeToday : null,
            isSelected ? styles.calendarDayBadgeSelected : null,
            isToday && isSelected ? styles.calendarDayBadgeTodaySelected : null,
          ]}
        >
          <NativeText
            allowFontScaling={false}
            style={[
              styles.calendarDayLabel,
              isToday ? styles.calendarDayLabelToday : null,
              isSelected ? styles.calendarDayLabelSelected : null,
              isDisabled || isInactive ? styles.calendarDayLabelMuted : null,
            ]}
          >
            {date.day}
          </NativeText>
        </View>

        <View style={styles.calendarDayMarkers}>
          {hasCompletedWorkout ? (
            <View style={[styles.calendarDayMarker, styles.calendarDayMarkerCompleted]} />
          ) : null}
          {hasPlannedRoutine ? (
            <View style={[styles.calendarDayMarker, styles.calendarDayMarkerPlanned]} />
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

export default function CalendarScreen() {
  const router = useRouter()
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const sync = useSyncStatus()
  const { t, language } = useI18n()
  applyCalendarLocale(language)
  const calendarLocale = language === 'es' ? 'es-ES' : 'en-US'
  const plannerIntentParams = useLocalSearchParams()
  const [initialDateKey] = useState(() => toDateKeyFromIso(new Date().toISOString()))
  const [dates, setDates] = useState<WorkoutDateRow[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routineUsage, setRoutineUsage] = useState<RoutineUsageMap>({})
  const [plans, setPlans] = useState<Record<string, PlannedDay>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown | null>(null)
  const [selectedDateKey, setSelectedDateKey] = useState<string>(initialDateKey)
  const [sheetState, setSheetState] = useState<SheetState>(() =>
    createInitialSheetState(initialDateKey),
  )
  const [currentMonthKey, setCurrentMonthKey] = useState<string>(
    toMonthStartDateKey(initialDateKey),
  )
  const [visibleMonthKey, setVisibleMonthKey] = useState<string>(
    toMonthStartDateKey(initialDateKey),
  )
  const [calendarView, setCalendarView] = useState<CalendarView>('month')
  const [weeklyGoal, setWeeklyGoal] = useState(DEFAULT_WEEKLY_GOAL)
  const [calendarMeasuredWidth, setCalendarMeasuredWidth] = useState(0)
  const [calendarKey, setCalendarKey] = useState(0)
  const [calendarReinitNonce, setCalendarReinitNonce] = useState(0)
  const [isStartingDateKey, setIsStartingDateKey] = useState<string | null>(null)
  const [isSchedulingDateKey, setIsSchedulingDateKey] = useState<string | null>(null)
  const [routineQuery, setRoutineQuery] = useState('')
  const [pickerSelectedRoutineId, setPickerSelectedRoutineId] = useState<string | null>(null)
  const [isLoadingRoutines, setIsLoadingRoutines] = useState(false)
  const [routinePickerLoadError, setRoutinePickerLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const calendarRef = useRef<CalendarListHandle | null>(null)
  const navMonthKeyRef = useRef<string>(toMonthStartDateKey(initialDateKey))
  const pendingProgrammaticMonthKeyRef = useRef<string | null>(null)
  const hasHandledAutoOpenIntentRef = useRef(false)
  const isAgendaView = ENABLE_CALENDAR_AGENDA && calendarView === 'agenda'
  const hasPlannerIntentParams =
    plannerIntentParams.dateKey !== undefined || plannerIntentParams.openPicker !== undefined
  const plannerIntent = useMemo(
    () => resolveCalendarPlannerIntent(plannerIntentParams, initialDateKey),
    [initialDateKey, plannerIntentParams.dateKey, plannerIntentParams.openPicker],
  )
  const shouldLoadConsistency = shouldLoadCalendarConsistency({
    isAgendaFeatureEnabled: ENABLE_CALENDAR_AGENDA,
    isConsistencyStripFeatureEnabled: ENABLE_CALENDAR_CONSISTENCY_STRIP,
  })
  const showAgendaConsistencyStrip = shouldShowCalendarConsistencyStrip({
    isAgendaView,
    isAgendaFeatureEnabled: ENABLE_CALENDAR_AGENDA,
    isConsistencyStripFeatureEnabled: ENABLE_CALENDAR_CONSISTENCY_STRIP,
  })
  const debouncedRoutineQuery = useDebouncedValue(routineQuery, 200)
  const fallbackCalendarWidth = useMemo(
    () => Math.max(0, Math.round(width - spacing[5] * 2 - 2)),
    [width],
  )
  const calendarWidth = useMemo(
    () => Math.max(0, calendarMeasuredWidth > 0 ? calendarMeasuredWidth : fallbackCalendarWidth),
    [calendarMeasuredWidth, fallbackCalendarWidth],
  )
  const agendaCalendarHeight = useMemo(
    () => Math.max(296, Math.min(392, Math.round(calendarWidth * 0.84))) + WEEKDAY_ROW_HEIGHT,
    [calendarWidth],
  )
  const monthCalendarHeight = useMemo(
    () => Math.max(360, Math.min(456, Math.round(calendarWidth * 1.12))) + WEEKDAY_ROW_HEIGHT,
    [calendarWidth],
  )
  const modalMaxHeight = useMemo(
    () => Math.max(320, Math.round(height - insets.top - spacing[6])),
    [height, insets.top],
  )
  const visibleMonthLabel = useMemo(
    () => formatMonthLabel(visibleMonthKey, language === 'es' ? 'es-ES' : 'en-US'),
    [language, visibleMonthKey],
  )
  const weekdayLabels = useMemo(() => WEEKDAY_LABEL_KEYS.map((key) => t(key)), [language, t])
  const errorState = useMemo(() => {
    if (!error) return null
    return buildActionableErrorState(error)
  }, [error])

  const visibleMonth = useMemo(() => {
    const parts = visibleMonthKey.split('-')
    return { year: Number(parts[0]), month: Number(parts[1]) - 1 }
  }, [visibleMonthKey])

  const routineSections = useMemo(
    () =>
      buildRoutinePickerSections({
        routines,
        usage: routineUsage,
        query: debouncedRoutineQuery,
        titles: {
          pinned: t('common.favorites'),
          recent: t('calendar.recentActivity'),
          all: t('calendar.allRoutines'),
        },
      }),
    [debouncedRoutineQuery, routineUsage, routines, t],
  )

  const loadCalendar = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!user) {
        setDates([])
        setRoutines([])
        setRoutineUsage({})
        setPlans({})
        setWeeklyGoal(DEFAULT_WEEKLY_GOAL)
        setIsLoading(false)
        return
      }

      if (!opts?.silent) setIsLoading(true)
      setError(null)

      const sinceISO = new Date(Date.now() - 365 * 5 * 24 * 60 * 60 * 1000).toISOString()

      try {
        const weeklyGoalPromise = shouldLoadConsistency
          ? loadWeeklyWorkoutsGoal(user.id)
          : Promise.resolve(DEFAULT_WEEKLY_GOAL)

        const today = new Date()
        const fromPlanDate = new Date(today)
        fromPlanDate.setDate(fromPlanDate.getDate() - 730)
        const toPlanDate = new Date(today)
        toPlanDate.setDate(toPlanDate.getDate() + 365)
        const fromPlanDateKey = `${fromPlanDate.getFullYear()}-${String(fromPlanDate.getMonth() + 1).padStart(2, '0')}-${String(fromPlanDate.getDate()).padStart(2, '0')}`
        const toPlanDateKey = `${toPlanDate.getFullYear()}-${String(toPlanDate.getMonth() + 1).padStart(2, '0')}-${String(toPlanDate.getDate()).padStart(2, '0')}`

        const loadPlansPromise = fetchScheduledRoutinesForDateRange(
          user.id,
          fromPlanDateKey,
          toPlanDateKey,
        )

        const [
          { data, error: fetchError },
          loadedRoutines,
          loadedUsage,
          loadedPlans,
          loadedWeeklyGoal,
        ] = await Promise.all([
          fetchCompletedWorkoutDates(sinceISO),
          loadRoutines(user.id),
          loadRoutineUsage(user.id),
          loadPlansPromise,
          weeklyGoalPromise,
        ])

        if (fetchError) {
          setError(fetchError.message)
          setDates([])
        } else {
          setDates((data ?? []) as WorkoutDateRow[])
        }

        setRoutines(loadedRoutines)
        setRoutineUsage(loadedUsage)
        setPlans(loadedPlans)
        setWeeklyGoal(loadedWeeklyGoal)
      } catch (loadError) {
        if (__DEV__) {
          console.warn('Failed loading calendar:', loadError)
        }

        setError(
          sanitizeErrorMessage(
            loadError instanceof Error ? loadError.message : t('common.tryAgain'),
          ),
        )
        setDates([])
        setRoutines([])
        setRoutineUsage({})
        setPlans({})
        setWeeklyGoal(DEFAULT_WEEKLY_GOAL)
      } finally {
        if (!opts?.silent) setIsLoading(false)
      }
    },
    [shouldLoadConsistency, t, user],
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      try {
        await sync.refresh()
      } catch (refreshError) {
        if (__DEV__) {
          console.warn('Calendar refresh sync failed, continuing with local data:', refreshError)
        }
      }
      await loadCalendar({ silent: true })
    } finally {
      setRefreshing(false)
    }
  }, [loadCalendar, sync])

  useFocusEffect(
    useCallback(() => {
      void loadCalendar()
    }, [loadCalendar]),
  )

  useFocusEffect(
    useCallback(() => {
      if (!hasPlannerIntentParams) {
        hasHandledAutoOpenIntentRef.current = false
        return () => {
          hasHandledAutoOpenIntentRef.current = false
        }
      }

      const targetMonthKey = toMonthStartDateKey(plannerIntent.targetDateKey)
      setSelectedDateKey((current) =>
        current === plannerIntent.targetDateKey ? current : plannerIntent.targetDateKey,
      )
      navMonthKeyRef.current = targetMonthKey
      pendingProgrammaticMonthKeyRef.current = targetMonthKey
      setCurrentMonthKey((current) => (current === targetMonthKey ? current : targetMonthKey))
      setVisibleMonthKey((current) => (current === targetMonthKey ? current : targetMonthKey))

      if (shouldAutoOpenPlanner(plannerIntent.openPicker, hasHandledAutoOpenIntentRef.current)) {
        hasHandledAutoOpenIntentRef.current = true
        const plannedRoutineId = plans[plannerIntent.targetDateKey]?.routineId ?? null
        const hasPlannedRoutine = plannedRoutineId
          ? routines.some((routine) => routine.id === plannedRoutineId)
          : false
        setPickerSelectedRoutineId(hasPlannedRoutine ? plannedRoutineId : null)
        setSheetState((current) => openRoutinePicker(current, plannerIntent.targetDateKey))
      }

      return () => {
        hasHandledAutoOpenIntentRef.current = false
      }
    }, [
      hasPlannerIntentParams,
      plannerIntent.openPicker,
      plannerIntent.targetDateKey,
      plans,
      routines,
    ]),
  )

  const routinesById = useMemo(() => {
    return routines.reduce<Record<string, Routine>>((acc, routine) => {
      acc[routine.id] = routine
      return acc
    }, {})
  }, [routines])

  const workoutsByDate = useMemo(() => {
    return groupWorkoutsByDate(dates)
  }, [dates])

  const workoutDateKeys = useMemo(() => {
    return new Set(Object.keys(workoutsByDate))
  }, [workoutsByDate])

  const completedDateKeys = useMemo(() => Object.keys(workoutsByDate), [workoutsByDate])

  const { monthlyShareSvgRef, monthlyShareData, isMonthlySharing, handleShareMonth } =
    useMonthlyShare({
      userId: user?.id ?? null,
      completedDateKeys,
      month: visibleMonth.month,
      year: visibleMonth.year,
      locale: language === 'es' ? 'es-ES' : 'en-US',
    })

  const plannedDateKeys = useMemo(() => {
    return new Set(Object.keys(plans))
  }, [plans])

  const markedDates = useMemo(() => {
    return buildMarkedDates({
      workoutDateKeys,
      planDateKeys: plannedDateKeys,
      selectedDateKey,
      colors: {
        workoutDot: colors.accent.primary,
        planDot: colors.semantic.success,
        selectedBackground: colors.accent.primary,
        selectedText: colors.text.inverse,
      },
    })
  }, [plannedDateKeys, selectedDateKey, workoutDateKeys])

  const selectedDay = useMemo(() => {
    return buildSelectedDayModel({
      dateKey: sheetState.dateKey ?? selectedDateKey,
      workoutsByDate,
      plansByDate: plans,
      routinesById,
    })
  }, [plans, routinesById, selectedDateKey, sheetState.dateKey, workoutsByDate])
  const pickerDateKey = sheetState.dateKey ?? selectedDateKey

  const consistencySummary = useMemo(
    () =>
      buildCalendarConsistencySummary({
        workouts: dates,
        weeklyGoal,
        now: new Date(),
      }),
    [dates, weeklyGoal],
  )

  const agendaSections = useMemo<AgendaSection[]>(() => {
    if (!ENABLE_CALENDAR_AGENDA) return []

    const todayDateKey = toDateKeyFromIso(new Date().toISOString())
    const { upcomingEndDateKey, recentStartDateKey, recentEndDateKey } = buildAgendaWindowKeys(
      todayDateKey,
      AGENDA_WINDOW_DAYS,
    )

    const upcomingItems = Object.keys(plans)
      .filter((dateKey) => dateKey >= todayDateKey && dateKey <= upcomingEndDateKey)
      .map<AgendaItem | null>((dateKey) => {
        const dayModel = buildSelectedDayModel({
          dateKey,
          workoutsByDate,
          plansByDate: plans,
          routinesById,
        })
        if (!dayModel.hasPlan) return null

        const routineName = dayModel.routine?.name ?? t('calendar.routineUnavailable')
        const planId = dayModel.plan?.routineId ?? dayModel.dateKey

        return {
          key: `planned:${dayModel.dateKey}:${planId}`,
          kind: 'planned' as const,
          dateKey: dayModel.dateKey,
          startTime: '00:00:00',
          routineName,
          id: planId,
          title: routineName,
          subtitle: formatCalendarDate(dayModel.dateKey, calendarLocale),
        }
      })
      .filter((item): item is AgendaItem => item !== null)
      .sort(compareAgendaItemsByDateAscending)

    const recentItems = Object.keys(workoutsByDate)
      .filter((dateKey) => dateKey >= recentStartDateKey && dateKey <= recentEndDateKey)
      .flatMap((dateKey) => {
        const dayModel = buildSelectedDayModel({
          dateKey,
          workoutsByDate,
          plansByDate: plans,
          routinesById,
        })

        return dayModel.workouts.map((workout) => ({
          key: `completed:${dayModel.dateKey}:${workout.id}`,
          kind: 'completed' as const,
          dateKey: dayModel.dateKey,
          startTime: workout.performedAt,
          routineName: t('calendar.completedSession'),
          id: workout.id,
          title: t('calendar.completedSession'),
          subtitle: `${formatCalendarDate(dayModel.dateKey, calendarLocale)} · ${formatWorkoutTime(workout.performedAt)}`,
          workoutId: workout.id,
        }))
      })
      .sort(compareAgendaItemsByDateDescending)

    const sections: AgendaSection[] = []
    if (upcomingItems.length > 0) {
      sections.push({
        key: 'upcoming',
        title: t('calendar.agendaUpcoming'),
        data: upcomingItems,
      })
    }
    if (recentItems.length > 0) {
      sections.push({
        key: 'recent',
        title: t('calendar.agendaRecent'),
        data: recentItems,
      })
    }

    return sections
  }, [calendarLocale, plans, routinesById, t, workoutsByDate])

  const todayDateKey = useMemo(() => toDateKeyFromIso(new Date().toISOString()), [])
  const isCalendarEmpty = dates.length === 0 && Object.keys(plans).length === 0

  useEffect(() => {
    if (!__DEV__ || !selectedDay.routineMissing) return

    const plannedRoutineId = selectedDay.plan?.routineId?.trim() ?? ''
    const routineKeys = Object.keys(routinesById)

    console.warn('[Calendar] Planned routine reference is missing locally.', {
      dateKey: selectedDay.dateKey,
      plannedRoutineId,
      routinesByIdCount: routineKeys.length,
      routineKeySample: routineKeys.slice(0, 5),
      looksLikeUuid: isUuidLike(plannedRoutineId),
    })
  }, [routinesById, selectedDay.dateKey, selectedDay.plan?.routineId, selectedDay.routineMissing])

  useEffect(() => {
    setCalendarKey((current) => current + 1)
  }, [language])

  const formatCalendarDateLocalized = useCallback(
    (dateKey: string) => formatCalendarDate(dateKey, calendarLocale),
    [calendarLocale],
  )

  const openDay = useCallback((dateKey: string) => {
    setSheetState(openDaySheet(dateKey))
  }, [])

  const ensureRoutinePickerRoutinesLoaded = useCallback(
    async (plannedRoutineId?: string | null): Promise<Routine[]> => {
      if (!user?.id) return []

      const normalizedPlannedRoutineId = plannedRoutineId?.trim() || null
      let nextErrorMessage: string | null = null

      setIsLoadingRoutines(true)
      setRoutinePickerLoadError(null)

      try {
        let syncResult = {
          status: sync.status,
          errorMessage: sync.errorMessage,
          lastErrorSource: sync.lastErrorSource,
          lastRoutinesPlansStatus: sync.lastRoutinesPlansStatus,
        }

        try {
          syncResult = await sync.refresh()
        } catch (refreshError) {
          if (__DEV__) {
            console.warn(
              'Routine picker sync failed, continuing with local routines:',
              refreshError,
            )
          }
        }

        let [reloadedRoutines, reloadedUsage] = await Promise.all([
          loadRoutines(user.id),
          loadRoutineUsage(user.id),
        ])

        const plannedRoutineStillMissing = normalizedPlannedRoutineId
          ? !reloadedRoutines.some((routine) => routine.id === normalizedPlannedRoutineId)
          : false

        if (reloadedRoutines.length === 0 || plannedRoutineStillMissing) {
          const remoteResult = await fetchCloudRoutinesWithItems(user.id)

          if (remoteResult.error) {
            if (reloadedRoutines.length === 0) {
              nextErrorMessage = sanitizeErrorMessage(remoteResult.error.message)
            }
          } else if ((remoteResult.data ?? []).length > 0) {
            const remoteRoutines = (remoteResult.data ?? []).map(toRoutineFromCloud)
            const mergedRoutines = mergeRoutines(
              reloadedRoutines as MergeRoutine[],
              remoteRoutines,
            ).map((routine) => ({
              ...routine,
              items: routine.items.map((item) => ({ ...item })),
            }))

            await replaceRoutinesSnapshot(user.id, mergedRoutines)
            ;[reloadedRoutines, reloadedUsage] = await Promise.all([
              loadRoutines(user.id),
              loadRoutineUsage(user.id),
            ])
          }
        }

        if (
          reloadedRoutines.length === 0 &&
          isRoutineSyncFailureStatus(syncResult.lastRoutinesPlansStatus)
        ) {
          nextErrorMessage = sanitizeErrorMessage(
            syncResult.errorMessage ?? t('calendar.routineLoadFailedBody'),
          )
        }

        setRoutines(reloadedRoutines)
        setRoutineUsage(reloadedUsage)
        setRoutinePickerLoadError(nextErrorMessage)

        return reloadedRoutines
      } catch (error) {
        const message = sanitizeErrorMessage(
          error instanceof Error ? error.message : t('calendar.routineLoadFailedBody'),
        )
        setRoutinePickerLoadError(message)
        return []
      } finally {
        setIsLoadingRoutines(false)
      }
    },
    [sync, t, user?.id],
  )

  const goPickRoutine = useCallback(
    async (dateKey?: string) => {
      const resolvedDateKey = dateKey ?? selectedDateKey
      const plannedRoutineId = plans[resolvedDateKey]?.routineId ?? null
      const hasPlannedRoutine = plannedRoutineId ? Boolean(routinesById[plannedRoutineId]) : false

      setRoutineQuery('')
      setRoutinePickerLoadError(null)
      setPickerSelectedRoutineId(hasPlannedRoutine ? plannedRoutineId : null)
      setSheetState((current) => openRoutinePicker(current, resolvedDateKey))

      const shouldReloadRoutines =
        Boolean(user?.id) &&
        (routines.length === 0 || (plannedRoutineId ? !routinesById[plannedRoutineId] : false))

      if (shouldReloadRoutines) {
        const reloadedRoutines = await ensureRoutinePickerRoutinesLoaded(plannedRoutineId)
        if (
          plannedRoutineId &&
          reloadedRoutines.some((routine) => routine.id === plannedRoutineId)
        ) {
          setPickerSelectedRoutineId(plannedRoutineId)
        }
      }
    },
    [
      ensureRoutinePickerRoutinesLoaded,
      plans,
      routines.length,
      routinesById,
      selectedDateKey,
      user?.id,
    ],
  )

  const returnToDay = useCallback(() => {
    setSheetState((current) => returnToDaySheet(current))
  }, [])

  const closeSheet = useCallback(() => {
    setSheetState((current) => closeSheetState(current))
    setRoutineQuery('')
    setPickerSelectedRoutineId(null)
    setRoutinePickerLoadError(null)
  }, [])

  const handleRetryRoutinePickerLoad = useCallback(() => {
    const plannedRoutineId = plans[pickerDateKey]?.routineId ?? null
    void ensureRoutinePickerRoutinesLoaded(plannedRoutineId).then((reloadedRoutines) => {
      if (plannedRoutineId && reloadedRoutines.some((routine) => routine.id === plannedRoutineId)) {
        setPickerSelectedRoutineId(plannedRoutineId)
      }
    })
  }, [ensureRoutinePickerRoutinesLoaded, pickerDateKey, plans])

  const handleOpenPlanPicker = useCallback(
    (dateKey: string) => {
      setSelectedDateKey(dateKey)
      void goPickRoutine(dateKey)
    },
    [goPickRoutine],
  )

  const handleCalendarDayPress = useCallback(
    (day: DateData) => {
      setSelectedDateKey(day.dateString)
      const selectedMonthKey = toMonthStartDateKey(day.dateString)
      navMonthKeyRef.current = selectedMonthKey
      pendingProgrammaticMonthKeyRef.current = null
      setCurrentMonthKey(selectedMonthKey)
      setVisibleMonthKey(selectedMonthKey)

      const dayModel = buildSelectedDayModel({
        dateKey: day.dateString,
        workoutsByDate,
        plansByDate: plans,
        routinesById,
      })

      if (dayModel.hasWorkouts) {
        openDay(day.dateString)
        return
      }

      void goPickRoutine(day.dateString)
    },
    [goPickRoutine, openDay, plans, routinesById, workoutsByDate],
  )

  const handleSetPlan = useCallback(
    async (
      dateKey: string,
      routineId: string,
      options?: { returnToDayAfterSet?: boolean; refreshAfterSet?: boolean },
    ): Promise<boolean> => {
      if (!user) return false

      const shouldReturnToDay = options?.returnToDayAfterSet ?? true
      const shouldRefreshAfterSet = options?.refreshAfterSet ?? true

      const trySchedule = async (): Promise<boolean> => {
        let result = await scheduleRoutineForDate(dateKey, routineId)
        if (result.ok) return true
        if (result.error?.message?.toLowerCase().includes('routine_not_found')) {
          const localRoutine = routinesById[routineId]
          if (localRoutine && localRoutine.items.length > 0) {
            const payload = toCloudRoutinePayload(localRoutine)
            const cloudResult = await upsertCloudRoutineWithItems({
              userId: user.id,
              routine: payload.routine,
              items: payload.items,
            })
            if (!cloudResult.error) {
              result = await scheduleRoutineForDate(dateKey, routineId)
              if (result.ok) return true
            }
          }
        }
        Alert.alert(t('common.error'), result.error?.message ?? t('common.tryAgain'))
        return false
      }

      try {
        const ok = await trySchedule()
        if (!ok) return false
        setPlans((current) => ({
          ...current,
          [dateKey]: {
            date: dateKey,
            routineId,
            note: current[dateKey]?.note ?? null,
          },
        }))
        if (shouldReturnToDay) {
          returnToDay()
        }
        if (shouldRefreshAfterSet) {
          void sync.refresh()
        }
        return true
      } catch {
        Alert.alert(t('common.error'), t('common.tryAgain'))
        return false
      }
    },
    [returnToDay, routinesById, sync, t, user],
  )

  const handleClearPlan = (dateKey: string) => {
    if (!user) return

    Alert.alert(t('calendar.clearPlanTitle'), t('calendar.clearPlanBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('calendar.clear'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const { error } = await clearScheduledRoutineForDate(user.id, dateKey)
              if (error) {
                Alert.alert(t('common.error'), error.message)
                return
              }
              setPlans((current) => {
                const next = { ...current }
                delete next[dateKey]
                return next
              })
              void sync.refresh()
            } catch {
              Alert.alert(t('common.error'), t('common.tryAgain'))
            }
          })()
        },
      },
    ])
  }

  const handleStartFromPlan = useCallback(
    async (dateKey: string, routineId: string) => {
      if (!user) return

      await sync.refresh()
      const routines = await loadRoutines(user.id)
      const routineExists = routines.some((r) => r.id === routineId)
      if (!routineExists) {
        Alert.alert(t('calendar.unableToStart'), t('calendar.routineRemoved'))
        return
      }

      captureCalendarPlanStart({
        dateKey,
        routineId,
      })

      setIsStartingDateKey(dateKey)
      const result = await startRoutine({
        userId: user.id,
        routineId,
        plannedDateKey: dateKey,
        refresh: sync.refresh,
      })
      setIsStartingDateKey(null)

      if (result.errorMessage || !result.workoutId) {
        Alert.alert(t('calendar.unableToStart'), result.errorMessage ?? t('common.tryAgain'))
        return
      }

      closeSheet()

      router.push({
        pathname: '/(app)/workout-session',
        params: { workoutId: result.workoutId },
      })

      if (result.skippedExerciseDefinitionIds.length > 0) {
        const skippedCount = result.skippedExerciseDefinitionIds.length
        setTimeout(() => {
          Alert.alert(
            t('calendar.partialRoutine'),
            t('calendar.skippedExercises', {
              count: String(skippedCount),
              plural: skippedCount === 1 ? '' : 's',
            }),
          )
        }, 0)
      }
    },
    [closeSheet, router, sync, t, user],
  )

  const handleStartFromPlannedDay = useCallback(
    async (dateKey: string) => {
      const planned = plans[dateKey]
      if (!planned) return
      await handleStartFromPlan(dateKey, planned.routineId)
    },
    [handleStartFromPlan, plans],
  )

  const resolveExistingPlannedRoutineId = useCallback(
    async (dateKey: string): Promise<string | null> => {
      const cachedRoutineId = plans[dateKey]?.routineId ?? null
      if (!useNewScheduleSource || !user?.id) {
        return cachedRoutineId
      }

      try {
        const latestPlans = await fetchScheduledRoutinesForDateRange(user.id, dateKey, dateKey)
        const remoteRoutineId = latestPlans[dateKey]?.routineId ?? null

        if (!remoteRoutineId) {
          return cachedRoutineId
        }

        if (remoteRoutineId !== cachedRoutineId) {
          setPlans((current) => ({
            ...current,
            [dateKey]: {
              date: dateKey,
              routineId: remoteRoutineId,
              note: current[dateKey]?.note ?? null,
            },
          }))
        }

        return remoteRoutineId
      } catch {
        return cachedRoutineId
      }
    },
    [plans, user?.id],
  )

  const handleScheduleFromRoutinePicker = useCallback(
    async (routineId: string, targetDateKey: string) => {
      const existingRoutineId = await resolveExistingPlannedRoutineId(targetDateKey)
      if (existingRoutineId === routineId) {
        closeSheet()
        return
      }

      setIsSchedulingDateKey(targetDateKey)
      try {
        const ok = await handleSetPlan(targetDateKey, routineId, {
          returnToDayAfterSet: false,
          refreshAfterSet: true,
        })
        if (!ok) return
        closeSheet()
      } finally {
        setIsSchedulingDateKey((current) => (current === targetDateKey ? null : current))
      }
    },
    [closeSheet, handleSetPlan, resolveExistingPlannedRoutineId],
  )

  const handleOpenWorkout = useCallback(
    (workoutId: string) => {
      closeSheet()
      router.push({
        pathname: '/(app)/workouts/[id]',
        params: { id: workoutId },
      })
    },
    [closeSheet, router],
  )

  const handleAgendaItemPress = useCallback(
    (item: AgendaItem) => {
      if (item.kind === 'completed' && item.workoutId) {
        handleOpenWorkout(item.workoutId)
        return
      }

      setSelectedDateKey(item.dateKey)
      openDay(item.dateKey)
    },
    [handleOpenWorkout, openDay],
  )

  const handleCreateRoutine = useCallback(() => {
    closeSheet()
    router.push('/(app)/routines/new')
  }, [closeSheet, router])

  const handleCalendarLayout = useCallback((event: LayoutChangeEvent) => {
    const measuredWidth = Math.max(0, Math.round(event.nativeEvent.layout.width))
    setCalendarMeasuredWidth((current) => (current === measuredWidth ? current : measuredWidth))
  }, [])

  const scrollCalendarToMonth = useCallback((monthKey: string): boolean => {
    try {
      if (typeof calendarRef.current?.scrollToMonth !== 'function') return false
      calendarRef.current.scrollToMonth(monthKey)
      return true
    } catch {
      return false
    }
  }, [])

  const handleMonthShift = useCallback(
    (monthDelta: number) => {
      const nextMonthKey = addMonthsToDateKey(navMonthKeyRef.current, monthDelta)
      navMonthKeyRef.current = nextMonthKey
      pendingProgrammaticMonthKeyRef.current = nextMonthKey
      setCurrentMonthKey(nextMonthKey)
      setVisibleMonthKey(nextMonthKey)
      const didScroll = scrollCalendarToMonth(nextMonthKey)
      if (!didScroll) {
        pendingProgrammaticMonthKeyRef.current = null
        setCalendarReinitNonce((value) => value + 1)
      }
    },
    [scrollCalendarToMonth],
  )

  return (
    <>
      <Screen scroll={false}>
        <AppHeader title={t('calendar.title')} variant="compact" />

        {errorState ? (
          <ErrorCard
            title={
              errorState.kind === 'offline'
                ? t('errors.offline.title')
                : errorState.kind === 'sync'
                  ? t('errors.sync.title')
                  : t('errors.generic.title')
            }
            message={
              errorState.kind === 'offline'
                ? t('errors.offline.message')
                : errorState.kind === 'sync'
                  ? t('errors.sync.message')
                  : t('errors.generic.message')
            }
            primaryActionLabel={
              errorState.primaryAction === 'check_connection'
                ? t('errors.action.checkConnection')
                : t('common.tryAgain')
            }
            onPrimaryAction={() => void loadCalendar()}
            detailsLabel={t('errors.action.details')}
            detailsTitle={t('errors.detailsTitle')}
            details={errorState.rawMessage}
            closeLabel={t('common.close')}
          />
        ) : null}

        {isLoading ? (
          <LoadingState message={t('calendar.loadingActivity')} />
        ) : (
          <Box flex={1}>
            <Box style={styles.monthNavRow}>
              <Pressable
                testID="calendar:monthPrev"
                onPress={() => handleMonthShift(-1)}
                style={({ pressed }) => [
                  styles.monthNavButton,
                  pressed ? styles.monthNavButtonPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.prevMonth')}
              >
                <Ionicons name="chevron-back" size={18} color={colors.text.primary} />
              </Pressable>
              <View style={styles.monthNavCenter}>
                <AccentRule />
                <Text
                  testID="calendar:monthLabel"
                  variant="h1"
                  style={styles.monthNavLabel}
                  marginTop="xs"
                >
                  {visibleMonthLabel}
                </Text>
              </View>
              <Pressable
                testID="calendar:monthNext"
                onPress={() => handleMonthShift(1)}
                style={({ pressed }) => [
                  styles.monthNavButton,
                  pressed ? styles.monthNavButtonPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.nextMonth')}
              >
                <Ionicons name="chevron-forward" size={18} color={colors.text.primary} />
              </Pressable>
            </Box>

            <Box flexDirection="row" marginBottom="sm" style={styles.legendRow}>
              <DayLegendItem
                color={colors.accent.secondary}
                label={t('calendar.legendCompleted')}
              />
              <DayLegendItem color={colors.semantic.success} label={t('calendar.legendPlanned')} />
            </Box>

            <Box alignItems="center" marginBottom="md">
              <Pressable
                onPress={() => {
                  void handleShareMonth()
                }}
                disabled={isMonthlySharing}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  opacity: pressed ? 0.8 : 1,
                  minHeight: 36,
                  justifyContent: 'center' as const,
                  paddingHorizontal: spacing[4],
                })}
              >
                <Text variant="labelSm" color="accent">
                  {isMonthlySharing ? t('share.sharing') : t('calendar.shareMonth')}
                </Text>
              </Pressable>
            </Box>

            {ENABLE_CALENDAR_AGENDA ? (
              <View style={styles.viewToggleRow}>
                <Pressable
                  onPress={() => setCalendarView('month')}
                  style={({ pressed }) => [
                    styles.viewToggleButton,
                    calendarView === 'month' ? styles.viewToggleButtonActive : null,
                    pressed ? styles.viewToggleButtonPressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('progress.month')}
                >
                  <Text
                    variant="labelSm"
                    color={calendarView === 'month' ? 'textPrimary' : 'textMuted'}
                  >
                    {t('progress.month')}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setCalendarView('agenda')}
                  style={({ pressed }) => [
                    styles.viewToggleButton,
                    calendarView === 'agenda' ? styles.viewToggleButtonActive : null,
                    pressed ? styles.viewToggleButtonPressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('calendar.agenda')}
                >
                  <Text
                    variant="labelSm"
                    color={calendarView === 'agenda' ? 'textPrimary' : 'textMuted'}
                  >
                    {t('calendar.agenda')}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {showAgendaConsistencyStrip ? (
              <Box style={styles.consistencyStrip}>
                <Text variant="labelSm" color="textMuted">
                  {t('progress.thisWeekGoal', {
                    count: consistencySummary.sessionsThisWeek,
                    goal: consistencySummary.weeklyGoal,
                  })}
                </Text>
                <Text variant="labelSm" color="textMuted">
                  {t('calendar.dayStreak', { count: consistencySummary.currentStreak })}
                </Text>
              </Box>
            ) : null}

            <Box
              borderRadius="2xl"
              borderWidth={1}
              borderColor="borderSubtle"
              style={[
                styles.calendarContainer,
                { flex: 0, height: isAgendaView ? agendaCalendarHeight : monthCalendarHeight },
              ]}
            >
              <View style={styles.weekdayRow}>
                {weekdayLabels.map((label, index) => (
                  <NativeText
                    key={index}
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={styles.weekdayLabel}
                  >
                    {label}
                  </NativeText>
                ))}
              </View>
              <View onLayout={handleCalendarLayout} style={styles.calendarHost}>
                <CalendarList
                  testID="calendar:dayCell"
                  dayComponent={CalendarDayCell}
                  ref={calendarRef}
                  key={`calendar-list:${calendarKey}:${calendarReinitNonce}`}
                  horizontal
                  pagingEnabled
                  calendarWidth={calendarWidth}
                  animateScroll
                  hideArrows
                  hideDayNames
                  renderHeader={() => null}
                  hideExtraDays
                  pastScrollRange={60}
                  futureScrollRange={24}
                  firstDay={0}
                  markingType="multi-dot"
                  markedDates={markedDates}
                  current={currentMonthKey}
                  onVisibleMonthsChange={(months: DateData[]) => {
                    const visibleMonthDateKey = months[0]?.dateString
                    if (!visibleMonthDateKey) return
                    const reportedMonthKey = toMonthStartDateKey(visibleMonthDateKey)
                    const pendingMonthKey = pendingProgrammaticMonthKeyRef.current
                    if (pendingMonthKey && reportedMonthKey !== pendingMonthKey) return
                    if (pendingMonthKey && reportedMonthKey === pendingMonthKey) {
                      pendingProgrammaticMonthKeyRef.current = null
                    }
                    navMonthKeyRef.current = reportedMonthKey
                    setVisibleMonthKey((current) =>
                      current === reportedMonthKey ? current : reportedMonthKey,
                    )
                    setCurrentMonthKey((current) =>
                      current === reportedMonthKey ? current : reportedMonthKey,
                    )
                  }}
                  onScrollBeginDrag={() => {
                    pendingProgrammaticMonthKeyRef.current = null
                  }}
                  onDayPress={handleCalendarDayPress}
                  showScrollIndicator={false}
                  theme={calendarTheme}
                />
              </View>
            </Box>

            {isAgendaView ? (
              <View style={styles.agendaContainer}>
                <SectionList
                  sections={agendaSections}
                  keyExtractor={(item) => item.key}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={handleRefresh}
                      tintColor={colors.accent.primary}
                    />
                  }
                  renderSectionHeader={({ section }) => (
                    <Text variant="labelSm" color="textMuted" style={styles.agendaSectionTitle}>
                      {section.title}
                    </Text>
                  )}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => handleAgendaItemPress(item)}
                      style={({ pressed }) => [
                        styles.agendaRow,
                        pressed ? styles.agendaRowPressed : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={item.title}
                    >
                      <View style={styles.agendaRowCopy}>
                        <Text variant="body" color="textPrimary" style={styles.agendaRowTitle}>
                          {item.title}
                        </Text>
                        <Text variant="bodySm" color="textMuted">
                          {item.subtitle}
                        </Text>
                      </View>
                      <Ionicons
                        name={item.kind === 'planned' ? 'calendar-outline' : 'barbell-outline'}
                        size={16}
                        color={colors.text.muted}
                      />
                    </Pressable>
                  )}
                  stickySectionHeadersEnabled={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={
                    agendaSections.length > 0 ? styles.agendaListContent : styles.agendaListEmpty
                  }
                  ListEmptyComponent={
                    isCalendarEmpty ? (
                      <EmptyState
                        title={t('calendar.emptyTitle')}
                        body={t('calendar.emptyBody')}
                        ctaLabel={t('calendar.emptyCta')}
                        onCtaPress={() => void goPickRoutine(todayDateKey)}
                      />
                    ) : (
                      <Text variant="bodySm" color="textMuted" style={styles.agendaEmptyText}>
                        {t('calendar.dayDetailsEmpty')}
                      </Text>
                    )
                  }
                  initialNumToRender={8}
                  windowSize={7}
                />
              </View>
            ) : null}
          </Box>
        )}
      </Screen>

      <Modal
        visible={sheetState.open}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeSheet}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <KeyboardAvoidingView
            style={styles.modalKeyboardAvoider}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View
              testID={sheetState.mode === 'day' ? 'calendar:daySheet' : 'calendar:routinePicker'}
              style={[
                styles.modalCard,
                { maxHeight: modalMaxHeight },
                sheetState.mode === 'pickRoutine' ? { height: modalMaxHeight } : null,
              ]}
            >
              <View style={styles.modalHandle} />
              {sheetState.mode === 'day' ? (
                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={[
                    styles.modalContent,
                    { paddingBottom: insets.bottom + spacing[6] },
                  ]}
                >
                  <DayDetailSheet
                    selectedDay={selectedDay}
                    isStartingDateKey={isStartingDateKey}
                    isSyncing={sync.status === 'syncing'}
                    formatCalendarDate={formatCalendarDateLocalized}
                    formatWorkoutTime={formatWorkoutTime}
                    onStartWorkout={handleStartFromPlannedDay}
                    onPickRoutine={handleOpenPlanPicker}
                    onClearPlan={handleClearPlan}
                    onOpenWorkout={handleOpenWorkout}
                    onSyncNow={() => {
                      void sync.refresh()
                    }}
                    onClose={closeSheet}
                  />
                </ScrollView>
              ) : (
                <View style={styles.modalPickerContent}>
                  <RoutinePickerSheet
                    targetDateKey={pickerDateKey}
                    sections={routineSections}
                    selectedRoutineId={pickerSelectedRoutineId}
                    isScheduling={isSchedulingDateKey === pickerDateKey}
                    isLoadingRoutines={isLoadingRoutines}
                    errorMessage={routinePickerLoadError}
                    query={routineQuery}
                    onQueryChange={setRoutineQuery}
                    formatCalendarDate={formatCalendarDateLocalized}
                    onSelectRoutine={setPickerSelectedRoutineId}
                    onScheduleRoutine={handleScheduleFromRoutinePicker}
                    onRetryLoad={handleRetryRoutinePickerLoad}
                    onCreateRoutine={handleCreateRoutine}
                    onBack={returnToDay}
                    onClose={closeSheet}
                    bottomInset={insets.bottom}
                  />
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {monthlyShareData ? (
        <View style={styles.hiddenShareCard} pointerEvents="none">
          <MonthlyShareCardSvg
            data={monthlyShareData}
            labels={{
              sessions: t('share.monthSessions'),
              volume: t('share.monthVolume'),
              streak: t('share.monthStreak'),
            }}
            svgRef={monthlyShareSvgRef}
          />
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  hiddenShareCard: {
    position: 'absolute',
    top: -3000,
    left: -3000,
    opacity: 0,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim.medium,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[6],
  },
  modalKeyboardAvoider: {
    justifyContent: 'flex-end',
  },
  modalCard: {
    width: '100%',
    minHeight: 0,
    backgroundColor: colors.bg.primary,
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.subtle,
    shadowColor: colors.shadow.default,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 8,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border.default,
    marginBottom: spacing[4],
  },
  modalContent: {
    flexGrow: 1,
  },
  modalPickerContent: {
    flex: 1,
    minHeight: 0,
  },
  monthNavRow: {
    marginBottom: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  monthNavCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  monthNavButtonPressed: {
    backgroundColor: colors.bg.secondary,
    transform: [{ scale: 0.96 }],
  },
  monthNavLabel: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  legendRow: {
    paddingHorizontal: spacing[1],
  },
  legendLabel: {
    letterSpacing: 0.6,
  },
  viewToggleRow: {
    marginBottom: spacing[4],
    flexDirection: 'row',
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.full,
    padding: 4,
    alignSelf: 'flex-start',
  },
  viewToggleButton: {
    flex: 1,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  viewToggleButtonActive: {
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  viewToggleButtonPressed: {
    opacity: 0.9,
  },
  consistencyStrip: {
    marginBottom: spacing[4],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radius.full,
    backgroundColor: colors.bg.secondary,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calendarContainer: {
    backgroundColor: colors.bg.primary,
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius['2xl'],
  },
  weekdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[1],
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
    fontFamily: type.labelSm.fontFamily,
    fontWeight: '500',
    letterSpacing: 0.6,
    color: colors.text.muted,
  },
  calendarHost: {
    flex: 1,
  },
  calendarDayTouchTarget: {
    width: CALENDAR_DAY_TOUCH_SIZE,
    height: 58,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  calendarDayTouchTargetPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.97 }],
  },
  calendarDayEmpty: {
    width: CALENDAR_DAY_TOUCH_SIZE,
    height: 58,
  },
  calendarDayContent: {
    alignItems: 'center',
    paddingTop: 2,
  },
  calendarDayBadge: {
    width: CALENDAR_DAY_BADGE_SIZE,
    height: CALENDAR_DAY_BADGE_SIZE,
    borderRadius: CALENDAR_DAY_BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayBadgeCompleted: {
    backgroundColor: colors.accent.secondaryMuted,
  },
  calendarDayBadgeToday: {
    backgroundColor: colors.bg.warmWash,
  },
  calendarDayBadgeSelected: {
    backgroundColor: colors.accent.primaryMuted,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  calendarDayBadgeTodaySelected: {
    backgroundColor: colors.accent.primaryMuted,
  },
  calendarDayLabel: {
    color: colors.text.primary,
    fontFamily: type.label.fontFamily,
    fontWeight: '500',
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  calendarDayLabelSelected: {
    color: colors.text.primary,
    fontWeight: '600',
  },
  calendarDayLabelToday: {
    color: colors.accent.primary,
  },
  calendarDayLabelMuted: {
    color: colors.text.disabled,
  },
  calendarDayMarkers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: spacing[2],
    marginTop: spacing[1],
    gap: spacing[1],
  },
  calendarDayMarker: {
    width: CALENDAR_DAY_MARKER_SIZE,
    height: CALENDAR_DAY_MARKER_SIZE,
    borderRadius: CALENDAR_DAY_MARKER_SIZE / 2,
  },
  calendarDayMarkerCompleted: {
    backgroundColor: colors.accent.secondary,
  },
  calendarDayMarkerPlanned: {
    backgroundColor: colors.semantic.success,
  },
  agendaContainer: {
    flex: 1,
    marginTop: spacing[4],
  },
  agendaSectionTitle: {
    marginTop: spacing[4],
    marginBottom: spacing[3],
    paddingHorizontal: spacing[1],
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.muted,
  },
  agendaRow: {
    marginBottom: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  agendaRowPressed: {
    opacity: 0.9,
  },
  agendaRowCopy: {
    flex: 1,
  },
  agendaRowTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  agendaListContent: {
    paddingBottom: spacing[4],
  },
  agendaListEmpty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  agendaEmptyText: {
    textAlign: 'center',
  },
})
