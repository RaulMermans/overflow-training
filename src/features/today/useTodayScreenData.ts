import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useFocusEffect } from '@react-navigation/native'
import { capture } from '../../analytics/posthogClient'
import { loadWeeklyWorkoutsGoal } from '../../db/userSettings'
import { fetchWorkouts, type WorkoutRow } from '../../db/workouts'
import type { ProgressWorkout } from '../../db/progress'
import { computeStreak } from '../progress/compute'
import { startRoutine } from '../routines/startRoutine'
import { getProjectionCompletedWorkouts } from '../sync/outbox/workoutProjection'
import { fetchInProgressWorkoutHybrid } from '../sync/outbox/workoutMutations'
import {
  buildWeekRhythm,
  buildWeekSummary,
  computeCadenceSummary,
  countSessionsThisWeek,
  formatRelativeLastWorkout,
} from './compute'
import { formatDateByLanguage, formatDateTimeByLanguage } from '../../i18n/formatters'
import {
  getNextScheduledWorkout,
  getScheduledWorkoutForDate,
  toLocalDateKey,
  type ScheduledWorkout,
} from '../schedule/selectors'
import {
  loadRoutineUsage,
  loadRoutines,
  type Routine,
  type RoutineUsageMap,
} from '../../lib/routines'
import type { PlannedDay } from '../schedule/types'
import { fetchScheduledRoutinesForDateRange } from '../../db/scheduledRoutines'
import { getDailyQuote, getGreetingKey } from '../../utils/motivation'
import { buildActionableErrorState, sanitizeErrorMessage } from '../../utils/errorMessages'
import { getCheckinDueInfo, markCheckinPromptedNow, type CheckinDueInfo } from '../checkins/storage'
import type { Language, TranslationKey } from '../../i18n'
import { ENABLE_SMART_SUGGESTIONS } from '../../config/featureFlags'

type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string

type ErrorLike = { message?: string | null } | null

type InProgressWorkoutLike = {
  id: string
}

type FetchInProgressWorkoutFn = (
  userId: string,
) => Promise<{ data: InProgressWorkoutLike | null; error: ErrorLike }>

interface StartRoutineResult {
  workoutId: string | null
  skippedExerciseDefinitionIds: string[]
  errorMessage: string | null
}

type StartRoutineFn = (input: {
  userId: string
  routineId: string
  plannedDateKey: string
  refresh?: () => Promise<unknown>
  onWorkoutCreated?: (workoutId: string) => void
}) => Promise<StartRoutineResult>

interface ResumeWorkoutFlowInput {
  userId: string | null
  fetchInProgressWorkout: FetchInProgressWorkoutFn
  errorLogin: string
  errorCheckExisting: string
}

interface ResumeWorkoutFlowResult {
  workoutId: string | null
  errorMessage: string | null
}

interface StartQuickRoutineFlowInput {
  userId: string | null
  routineId: string
  plannedDateKey: string
  startRoutine: StartRoutineFn
  errorStartRoutine: string
  onWorkoutCreated?: (workoutId: string) => void
}

export interface StartQuickRoutineFlowResult {
  workoutId: string | null
  skippedExerciseDefinitionIds: string[]
  errorMessage: string | null
}

interface UseTodayScreenDataInput {
  user: User | null
  t: TranslateFn
  language: Language
  refresh: () => Promise<unknown>
}

interface LoadWorkoutsOptions {
  background?: boolean
}

export type SuggestedRoutineReason = 'Pinned' | 'Most used' | 'To avoid repeating yesterday'

export interface SuggestedRoutine {
  routineId: string
  routineName: string
  reason: SuggestedRoutineReason
}

interface BuildSuggestedRoutineInput {
  enabled: boolean
  hasPlanToday: boolean
  routines: Routine[]
  usage: RoutineUsageMap
  yesterdayRoutineId?: string | null
}

const fetchInProgressWorkoutForFlow: FetchInProgressWorkoutFn = async (userId: string) => {
  const response = await fetchInProgressWorkoutHybrid(userId)
  return {
    data: response.data ? { id: response.data.id } : null,
    error: response.error ? { message: response.error.message } : null,
  }
}

function routineSortValue(
  routine: Routine,
  usage: RoutineUsageMap,
): {
  pinned: number
  usedCount: number
  lastUsedAt: string
  updatedAt: string
} {
  const usageEntry = usage[routine.id]

  return {
    pinned: routine.pinned ? 1 : 0,
    usedCount: usageEntry?.usedCount ?? 0,
    lastUsedAt: usageEntry?.lastUsedAt ?? '',
    updatedAt: routine.updatedAt,
  }
}

export function sortRoutinesForQuickStart(routines: Routine[], usage: RoutineUsageMap): Routine[] {
  return [...routines].sort((a, b) => {
    const aMeta = routineSortValue(a, usage)
    const bMeta = routineSortValue(b, usage)

    if (aMeta.pinned !== bMeta.pinned) return bMeta.pinned - aMeta.pinned
    if (aMeta.usedCount !== bMeta.usedCount) return bMeta.usedCount - aMeta.usedCount
    if (aMeta.lastUsedAt !== bMeta.lastUsedAt)
      return bMeta.lastUsedAt.localeCompare(aMeta.lastUsedAt)
    return bMeta.updatedAt.localeCompare(aMeta.updatedAt)
  })
}

export function hasAnyRoutines(routines: Routine[]): boolean {
  return routines.length > 0
}

function safeTimestamp(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function compareRoutineIdentity(a: Routine, b: Routine): number {
  const byName = a.name.localeCompare(b.name)
  if (byName !== 0) return byName
  return a.id.localeCompare(b.id)
}

function comparePinnedSuggestion(a: Routine, b: Routine, usage: RoutineUsageMap): number {
  const byLastUsed = safeTimestamp(usage[b.id]?.lastUsedAt) - safeTimestamp(usage[a.id]?.lastUsedAt)
  if (byLastUsed !== 0) return byLastUsed

  const byUpdatedAt = safeTimestamp(b.updatedAt) - safeTimestamp(a.updatedAt)
  if (byUpdatedAt !== 0) return byUpdatedAt

  return compareRoutineIdentity(a, b)
}

function compareMostUsedSuggestion(a: Routine, b: Routine, usage: RoutineUsageMap): number {
  const byUseCount = (usage[b.id]?.usedCount ?? 0) - (usage[a.id]?.usedCount ?? 0)
  if (byUseCount !== 0) return byUseCount

  const byLastUsed = safeTimestamp(usage[b.id]?.lastUsedAt) - safeTimestamp(usage[a.id]?.lastUsedAt)
  if (byLastUsed !== 0) return byLastUsed

  const byUpdatedAt = safeTimestamp(b.updatedAt) - safeTimestamp(a.updatedAt)
  if (byUpdatedAt !== 0) return byUpdatedAt

  return compareRoutineIdentity(a, b)
}

export function buildSuggestedRoutine(
  input: BuildSuggestedRoutineInput,
): SuggestedRoutine | undefined {
  if (!input.enabled || input.hasPlanToday || input.routines.length === 0) {
    return undefined
  }

  const selectCandidate = (
    candidates: Routine[],
    baseReason: Exclude<SuggestedRoutineReason, 'To avoid repeating yesterday'>,
  ): SuggestedRoutine | undefined => {
    if (candidates.length === 0) return undefined

    const best = candidates[0]
    const shouldAvoidRepeat =
      !!input.yesterdayRoutineId &&
      best.id === input.yesterdayRoutineId &&
      candidates.some((candidate) => candidate.id !== input.yesterdayRoutineId)

    if (shouldAvoidRepeat) {
      const alternate = candidates.find((candidate) => candidate.id !== input.yesterdayRoutineId)
      if (alternate) {
        return {
          routineId: alternate.id,
          routineName: alternate.name,
          reason: 'To avoid repeating yesterday',
        }
      }
    }

    return {
      routineId: best.id,
      routineName: best.name,
      reason: baseReason,
    }
  }

  const pinnedCandidates = input.routines
    .filter((routine) => routine.pinned === true)
    .sort((a, b) => comparePinnedSuggestion(a, b, input.usage))

  const pinnedSuggestion = selectCandidate(pinnedCandidates, 'Pinned')
  if (pinnedSuggestion) return pinnedSuggestion

  const mostUsedCandidates = input.routines
    .filter((routine) => Boolean(input.usage[routine.id]))
    .sort((a, b) => compareMostUsedSuggestion(a, b, input.usage))

  return selectCandidate(mostUsedCandidates, 'Most used')
}

export function toDateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`)
}

export function toLocalDateKeyFromIso(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return toLocalDateKey(date)
}

export function shouldShowCheckinDueCard(dueInfo: CheckinDueInfo, now: Date = new Date()): boolean {
  if (!dueInfo.isDue) return false

  const todayKey = toLocalDateKey(now)
  const lastPromptDateKey = toLocalDateKeyFromIso(dueInfo.lastPromptedAtISO)
  return lastPromptDateKey !== todayKey
}

export function getNextDayRefreshDelayMs(now: Date = new Date()): number {
  const nextMidnight = new Date(now)
  nextMidnight.setHours(24, 0, 0, 0)
  return Math.max(1000, nextMidnight.getTime() - now.getTime() + 500)
}

export async function resumeWorkoutFlow(
  input: ResumeWorkoutFlowInput,
): Promise<ResumeWorkoutFlowResult> {
  if (!input.userId) {
    return { workoutId: null, errorMessage: input.errorLogin }
  }

  const { data: inProgress, error } = await input.fetchInProgressWorkout(input.userId)
  if (error) {
    return {
      workoutId: null,
      errorMessage: error.message ?? input.errorCheckExisting,
    }
  }

  if (inProgress) {
    return { workoutId: inProgress.id, errorMessage: null }
  }

  return { workoutId: null, errorMessage: input.errorCheckExisting }
}

export async function startQuickRoutineFlow(
  input: StartQuickRoutineFlowInput,
): Promise<StartQuickRoutineFlowResult> {
  if (!input.userId) {
    return {
      workoutId: null,
      skippedExerciseDefinitionIds: [],
      errorMessage: input.errorStartRoutine,
    }
  }

  const result = await input.startRoutine({
    userId: input.userId,
    routineId: input.routineId,
    plannedDateKey: input.plannedDateKey,
    onWorkoutCreated: input.onWorkoutCreated,
  })

  if (result.errorMessage || !result.workoutId) {
    return {
      workoutId: null,
      skippedExerciseDefinitionIds: result.skippedExerciseDefinitionIds,
      errorMessage: result.errorMessage ?? input.errorStartRoutine,
    }
  }

  return {
    workoutId: result.workoutId,
    skippedExerciseDefinitionIds: result.skippedExerciseDefinitionIds,
    errorMessage: null,
  }
}

export function useTodayScreenData({ user, t, language, refresh }: UseTodayScreenDataInput) {
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [plans, setPlans] = useState<Record<string, PlannedDay>>({})
  const [routineUsage, setRoutineUsage] = useState<RoutineUsageMap>({})
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isStartingRoutineId, setIsStartingRoutineId] = useState<string | null>(null)
  const [hasInProgress, setHasInProgress] = useState(false)
  const [error, setError] = useState<unknown | null>(null)
  const [weeklyGoal, setWeeklyGoal] = useState(4)
  const [headerDate, setHeaderDate] = useState(() => new Date())
  const [checkinDueInfo, setCheckinDueInfo] = useState<CheckinDueInfo>({
    nextDueAtISO: null,
    isDue: false,
    lastPromptedAtISO: null,
  })
  const [showCheckinDueCard, setShowCheckinDueCard] = useState(false)
  const hasLoadedOnceRef = useRef(false)
  const loadPromiseRef = useRef<Promise<void> | null>(null)
  const lastLoadedAtRef = useRef(0)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  useEffect(() => {
    hasLoadedOnceRef.current = false
    loadPromiseRef.current = null
    lastLoadedAtRef.current = 0
    setHasLoadedOnce(false)
    setIsInitialLoading(true)
    setIsRefreshing(false)
  }, [user?.id])

  const loadWorkouts = useCallback(
    async (options?: LoadWorkoutsOptions) => {
      if (loadPromiseRef.current) {
        return loadPromiseRef.current
      }

      const pendingLoad = (async () => {
        if (!user?.id) {
          setWorkouts([])
          setRoutines([])
          setPlans({})
          setRoutineUsage({})
          setHasInProgress(false)
          setWeeklyGoal(4)
          setError(null)
          setHasLoadedOnce(false)
          setIsInitialLoading(false)
          setIsRefreshing(false)
          return
        }

        const isFirstLoad = !hasLoadedOnceRef.current
        if (isFirstLoad) {
          setIsInitialLoading(true)
        } else if (!options?.background) {
          setIsRefreshing(true)
        }
        setError(null)

        try {
          try {
            await refresh()
          } catch (refreshError) {
            if (__DEV__) {
              console.warn('Today refresh sync failed, continuing with local data:', refreshError)
            }
          }

          const today = new Date()
          const fromDate = new Date(today)
          fromDate.setDate(fromDate.getDate() - 7)
          const toDate = new Date(today)
          toDate.setDate(toDate.getDate() + 14)
          const fromDateKey = toLocalDateKey(fromDate)
          const toDateKey = toLocalDateKey(toDate)

          const loadPlansPromise = fetchScheduledRoutinesForDateRange(
            user.id,
            fromDateKey,
            toDateKey,
          )

          const [
            weeklyGoalValue,
            { data: inProgress },
            workoutsResponse,
            projectionCompleted,
            loadedRoutines,
            loadedPlans,
            loadedUsage,
          ] = await Promise.all([
            loadWeeklyWorkoutsGoal(user.id),
            fetchInProgressWorkoutHybrid(user.id),
            fetchWorkouts(),
            getProjectionCompletedWorkouts(user.id),
            loadRoutines(user.id),
            loadPlansPromise,
            loadRoutineUsage(user.id),
          ])

          setWeeklyGoal(weeklyGoalValue)
          setHasInProgress(Boolean(inProgress))

          if (workoutsResponse.error) {
            throw new Error(workoutsResponse.error.message)
          }

          const remote = workoutsResponse.data ?? []
          const remoteIds = new Set(remote.map((w) => w.id))
          const unsyncedCompleted = projectionCompleted.filter((w) => !remoteIds.has(w.id))
          const merged = [...remote, ...unsyncedCompleted].sort((a, b) => {
            const aStart = a.started_at ?? a.ended_at ?? a.created_at ?? ''
            const bStart = b.started_at ?? b.ended_at ?? b.created_at ?? ''
            if (bStart !== aStart) return bStart.localeCompare(aStart)
            return (b.created_at ?? '').localeCompare(a.created_at ?? '')
          })

          setWorkouts(merged)
          setRoutines(loadedRoutines)
          setPlans(loadedPlans)
          setRoutineUsage(loadedUsage)
          hasLoadedOnceRef.current = true
          lastLoadedAtRef.current = Date.now()
          setHasLoadedOnce(true)
        } catch (loadError) {
          if (__DEV__) {
            console.warn('Failed loading today screen:', loadError)
          }

          setError(
            sanitizeErrorMessage(
              loadError instanceof Error ? loadError.message : t('common.tryAgain'),
            ),
          )

          if (!hasLoadedOnceRef.current) {
            setWorkouts([])
            setRoutines([])
            setPlans({})
            setRoutineUsage({})
            setHasInProgress(false)
            setWeeklyGoal(4)
          }
        } finally {
          setIsInitialLoading(false)
          if (!options?.background) {
            setIsRefreshing(false)
          }
        }
      })()

      loadPromiseRef.current = pendingLoad.finally(() => {
        loadPromiseRef.current = null
      })

      return loadPromiseRef.current
    },
    [refresh, t, user?.id],
  )

  useFocusEffect(
    useCallback(() => {
      setHeaderDate(new Date())
      const STALE_MS = 30_000
      const isFresh = hasLoadedOnceRef.current && Date.now() - lastLoadedAtRef.current < STALE_MS
      if (!isFresh) {
        void loadWorkouts({ background: hasLoadedOnceRef.current })
      }
    }, [loadWorkouts]),
  )

  const headerDateKey = useMemo(() => toLocalDateKey(headerDate), [headerDate])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setHeaderDate(new Date())
    }, getNextDayRefreshDelayMs())

    return () => {
      clearTimeout(timeoutId)
    }
  }, [headerDateKey])

  useFocusEffect(
    useCallback(() => {
      let isCancelled = false

      if (!user?.id) {
        setCheckinDueInfo({
          nextDueAtISO: null,
          isDue: false,
          lastPromptedAtISO: null,
        })
        setShowCheckinDueCard(false)
        return
      }
      const userId = user.id

      void (async () => {
        try {
          const dueInfo = await getCheckinDueInfo(userId)
          if (isCancelled) return

          const shouldShow = shouldShowCheckinDueCard(dueInfo)
          setCheckinDueInfo(dueInfo)
          setShowCheckinDueCard(shouldShow)

          if (!shouldShow) return

          const stampedAtISO = await markCheckinPromptedNow(userId)
          if (isCancelled || !stampedAtISO) return

          setCheckinDueInfo((previous) => ({
            ...previous,
            lastPromptedAtISO: stampedAtISO,
          }))
        } catch {
          if (isCancelled) return
          setShowCheckinDueCard(false)
        }
      })()

      return () => {
        isCancelled = true
      }
    }, [user?.id]),
  )

  const latestWorkout = workouts[0] ?? null
  const latestWorkoutTimestamp = latestWorkout
    ? (latestWorkout.started_at ?? latestWorkout.ended_at ?? latestWorkout.created_at ?? null)
    : null

  const resumeWorkout = useCallback(async (): Promise<ResumeWorkoutFlowResult> => {
    setIsStarting(true)
    setError(null)

    try {
      const result = await resumeWorkoutFlow({
        userId: user?.id ?? null,
        fetchInProgressWorkout: fetchInProgressWorkoutForFlow,
        errorLogin: t('today.errorLogin'),
        errorCheckExisting: t('today.errorCheckExisting'),
      })

      if (result.workoutId) {
        capture('workout_resumed', { source: 'today_cta' })
      }

      if (result.errorMessage) {
        setError(result.errorMessage)
      }

      return result
    } finally {
      setIsStarting(false)
    }
  }, [t, user?.id])

  const startQuickRoutine = useCallback(
    async (
      routineId: string,
      plannedDateKey: string,
      options?: { onWorkoutCreated?: (workoutId: string) => void },
    ): Promise<StartQuickRoutineFlowResult> => {
      if (isStartingRoutineId) {
        return {
          workoutId: null,
          skippedExerciseDefinitionIds: [],
          errorMessage: null,
        }
      }

      setIsStartingRoutineId(routineId)
      setError(null)
      try {
        const result = await startQuickRoutineFlow({
          userId: user?.id ?? null,
          routineId,
          plannedDateKey,
          startRoutine: (input) =>
            startRoutine({
              ...input,
              refresh,
            }),
          errorStartRoutine: t('today.errorStartRoutine'),
          onWorkoutCreated: options?.onWorkoutCreated,
        })

        if (result.errorMessage) {
          setError(result.errorMessage)
        }

        return result
      } catch (startError) {
        const fallback = sanitizeErrorMessage(
          startError instanceof Error ? startError.message : t('today.errorStartRoutine'),
        )
        setError(fallback)
        return {
          workoutId: null,
          skippedExerciseDefinitionIds: [],
          errorMessage: fallback,
        }
      } finally {
        setIsStartingRoutineId(null)
      }
    },
    [isStartingRoutineId, refresh, t, user?.id],
  )

  const rankedRoutines = useMemo(
    () => sortRoutinesForQuickStart(routines, routineUsage),
    [routineUsage, routines],
  )
  const quickStartRoutines = rankedRoutines.slice(0, 3)
  const hasRoutines = useMemo(() => hasAnyRoutines(routines), [routines])

  const routinesById = useMemo(() => {
    return routines.reduce<Record<string, Routine>>((acc, routine) => {
      acc[routine.id] = routine
      return acc
    }, {})
  }, [routines])

  const todayDateKey = useMemo(() => toLocalDateKey(headerDate), [headerDate])
  const yesterdayDateKey = useMemo(() => {
    const yesterday = new Date(headerDate)
    yesterday.setDate(yesterday.getDate() - 1)
    return toLocalDateKey(yesterday)
  }, [headerDate])
  const hasPlanToday = useMemo(() => Boolean(plans[todayDateKey]), [plans, todayDateKey])
  const yesterdayRoutineId = useMemo(
    () => plans[yesterdayDateKey]?.routineId ?? null,
    [plans, yesterdayDateKey],
  )
  const scheduledToday = useMemo(
    () => getScheduledWorkoutForDate(plans, routinesById, todayDateKey),
    [plans, routinesById, todayDateKey],
  )
  const nextScheduled = useMemo(
    () => getNextScheduledWorkout(plans, routinesById, todayDateKey),
    [plans, routinesById, todayDateKey],
  )
  const suggestedRoutine = useMemo(
    () =>
      buildSuggestedRoutine({
        enabled: ENABLE_SMART_SUGGESTIONS,
        hasPlanToday,
        routines,
        usage: routineUsage,
        yesterdayRoutineId,
      }),
    [hasPlanToday, routineUsage, routines, yesterdayRoutineId],
  )
  const nextScheduledDateLabel = useMemo(() => {
    if (!nextScheduled) return null
    return formatDateByLanguage(toDateFromKey(nextScheduled.dateKey), language, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }, [language, nextScheduled])

  const displayName =
    typeof user?.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name.trim()
      : ''
  const greetingName = displayName
  const greetingKey = useMemo(() => getGreetingKey(headerDate), [headerDate])
  const greeting = useMemo(() => {
    const rawGreeting = t(`home.greeting.${greetingKey}` as TranslationKey, {
      name: greetingName,
    })
    return greetingName ? rawGreeting : rawGreeting.replace(/[,\s]+$/, '')
  }, [greetingKey, greetingName, t])
  const selectedQuote = useMemo(
    () =>
      getDailyQuote({
        userId: user?.id,
        date: headerDate,
        locale: language,
      }),
    [headerDate, language, user?.id],
  )
  const motivationSubtitle = useMemo(
    () => selectedQuote.text[language] ?? selectedQuote.text.en,
    [language, selectedQuote],
  )

  const lastWorkoutRelative = useMemo(
    () => formatRelativeLastWorkout(latestWorkoutTimestamp, headerDate, language),
    [headerDate, language, latestWorkoutTimestamp],
  )
  const sessionsThisWeek = useMemo(
    () => countSessionsThisWeek(workouts, headerDate),
    [headerDate, workouts],
  )
  const cadence = useMemo(
    () => computeCadenceSummary(sessionsThisWeek, weeklyGoal, language),
    [language, sessionsThisWeek, weeklyGoal],
  )
  const currentStreak = useMemo(() => {
    const synthetic = workouts
      .map((workout) => {
        const ended = workout.started_at ?? workout.ended_at ?? workout.created_at
        if (!ended) return null
        return {
          id: workout.id,
          ended_at: ended,
          started_at: ended,
          workout_exercises: [],
        } as ProgressWorkout
      })
      .filter(Boolean) as ProgressWorkout[]

    return computeStreak(synthetic)
  }, [workouts])
  const weekRhythm = useMemo(
    () => buildWeekRhythm(workouts, headerDate, language),
    [headerDate, language, workouts],
  )
  const weekSummary = useMemo(
    () => buildWeekSummary(workouts, headerDate, language),
    [headerDate, language, workouts],
  )

  const errorState = useMemo(() => {
    if (!error) return null
    return buildActionableErrorState(error)
  }, [error])

  const errorTitle =
    errorState?.kind === 'offline'
      ? t('errors.offline.title')
      : errorState?.kind === 'sync'
        ? t('errors.sync.title')
        : t('errors.generic.title')
  const errorMessage =
    errorState?.kind === 'offline'
      ? t('errors.offline.message')
      : errorState?.kind === 'sync'
        ? t('errors.sync.message')
        : t('errors.generic.message')

  const checkinDueDateLabel = useMemo(() => {
    if (!checkinDueInfo.nextDueAtISO) return null
    const dueDate = new Date(checkinDueInfo.nextDueAtISO)
    if (Number.isNaN(dueDate.getTime())) return null
    return formatDateByLanguage(dueDate, language, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }, [checkinDueInfo.nextDueAtISO, language])

  const shouldShowBlockingError = Boolean(errorState) && !hasLoadedOnce
  const isMutating = isStarting || Boolean(isStartingRoutineId)
  const todayCardActionDisabled = isInitialLoading || isMutating

  const formatDateTime = useCallback(
    (iso?: string | null) => {
      if (!iso) return t('today.unknownDate')
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
          ' - ',
        ) ?? t('today.unknownDate')
      )
    },
    [language, t],
  )

  const formatRoutineMeta = useCallback(
    (routine: Routine) => {
      const usage = routineUsage[routine.id]
      if (usage?.lastUsedAt) {
        const formattedDate =
          formatDateByLanguage(usage.lastUsedAt, language) ?? t('today.unknownDate')
        return t('today.lastUsed', {
          date: formattedDate,
        })
      }

      return t('today.notStartedYet')
    },
    [language, routineUsage, t],
  )

  return {
    isInitialLoading,
    isRefreshing,
    isMutating,
    isStarting,
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
    latestWorkoutTimestamp,
    hasRoutines,
    todayDateKey,
    scheduledToday,
    nextScheduled,
    nextScheduledDateLabel,
    todayCardActionDisabled,
    showCheckinDueCard,
    checkinDueDateLabel,
    quickStartRoutines,
    formatDateTime,
    formatRoutineMeta,
    sessionsThisWeek,
    weeklyGoal,
    cadence,
    currentStreak,
    weekRhythm,
    weekSummary,
    lastWorkoutRelative,
    ...(ENABLE_SMART_SUGGESTIONS && suggestedRoutine ? { suggestedRoutine } : {}),
  }
}

export type TodayScreenData = ReturnType<typeof useTodayScreenData>
export type TodayTranslateFn = TranslateFn
export type TodayScheduledWorkout = ScheduledWorkout
