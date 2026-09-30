/* eslint-disable no-restricted-imports */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useFocusEffect } from '@react-navigation/native'
import {
  ActionSheetIOS,
  AccessibilityInfo,
  Animated,
  InteractionManager,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native'
import type Svg from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { useKeepAwake } from 'expo-keep-awake'
import { useRouter } from 'expo-router'
import {
  type ExerciseTrackingMode,
  type ExerciseDefinitionRow,
  fetchCompletedWorkoutDates,
  fetchWorkoutDetail,
  type LastExercisePerformance,
  type WorkoutDetail,
  type WorkoutSetType,
  type WorkoutSetRow,
} from '../../../db/workouts'
import { useAuth } from '../../../auth/useAuth'
import {
  EXERCISE_DEFAULTS_LIMITS,
  loadExerciseDefaults,
  setExerciseDefault,
  type ExerciseDefaultsMap,
} from '../../../lib/exerciseDefaults'
import { loadProfilePreferences, type UnitsPreference } from '../../../lib/profilePreferences'
import {
  applyRepDecrement,
  applyRepIncrement,
  applyWeightDecrement,
  applyWeightIncrement,
  copyLastSet,
  getDefaultSetDraft,
  REPS_MAX,
  REPS_MIN,
  WEIGHT_MAX,
  WEIGHT_MIN,
} from '../../../components/workout-session/setEntry'
import {
  triggerGentleHaptic,
  hapticSelection,
  hapticDestructive,
  hapticSuccess,
} from '../../../lib/feedback'
import { useReducedMotion } from '../../../lib/motion'
import {
  addRestTimerSeconds,
  pauseRestTimer,
  resumeRestTimer,
  shouldStartRestTimer,
  skipRestTimer,
  startRestTimer,
  subtractRestTimerSeconds,
  tickRestTimer,
  type RestTimerState,
} from '../../../features/workoutSession/restTimer'
import { parseWorkoutMetaNotes } from '../../../features/workoutSession/workoutMeta'
import { useWorkoutSessionData } from '../../../features/workoutSession/useWorkoutSessionData'
import { motion } from '../../../theme'
import { sanitizeErrorMessage } from '../../../utils/errorMessages'
import { capture } from '../../../analytics/posthogClient'
import { useI18n } from '../../../i18n/useI18n'
import type { TranslationKey } from '../../../i18n'
import { convertWeightBetweenUnits, resolveDisplayWeight } from '../../../lib/units'
import {
  buildWorkoutShareData,
  buildWorkoutShareFallbackText,
} from '../../../features/share/buildWorkoutShareData'
import { captureSvgToPngBase64, shareWorkoutCard } from '../../../features/share/shareWorkoutCard'
import { computeE1RM, computeStreak } from '../../../features/progress/compute'
import { loadRoutines } from '../../../lib/routines'
import {
  getWorkoutProgramContext,
  getWorkoutRoutine,
  type WorkoutProgramContext,
} from '../../../lib/workoutMetadata'
import { computeProgressionSuggestion } from '../../../features/programs/progression'
import { useSyncStatus } from '../../../features/sync/useSyncStatus'
import {
  formatDistanceLabel,
  formatDurationInput,
  parseDistanceInput,
  parseDurationInput,
} from '../../../features/workoutSession/setMetrics'
import { listExerciseFavorites, toggleExerciseFavorite } from '../../../db/favorites'
import { handleTrophyEvent } from '../../../features/trophies/service'
import { useTrophyToasts } from '../../../features/trophies/ui/TrophyToastHost'
import { loadOutboxState } from '../../../features/sync/outbox/worker'
import { withTimeout } from '../../../lib/withTimeout'

export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

type SessionSetDraft = {
  reps: string
  weight: string
  duration: string
  distance: string
}

type WorkoutMode = 'WORK' | 'REST' | 'PAUSED' | 'NEXT_UP'
type NextUpPreview = {
  exerciseId: string
  exerciseName: string
  setIndex: number
  setType: WorkoutSetType | null
  remainingSets: number
}

export type WorkoutSessionMode = WorkoutMode
export type WorkoutSessionNextUpPreview = NextUpPreview
export type WorkoutSessionSetDraft = SessionSetDraft

type WorkoutFinishFlowState = 'confirm' | 'saving' | 'error' | 'queued' | 'success'
type WorkoutFinishSubmitMode = 'plain' | 'meta'

interface WorkoutFinishRequest {
  mode: WorkoutFinishSubmitMode
  shareAfterFinish: boolean
}

const FINISH_WORKOUT_TIMEOUT_MS = 12_000
const SHARE_STREAK_FETCH_TIMEOUT_MS = 10_000
const FINISH_OUTBOX_EVENT_TYPES = new Set(['finish_workout', 'finish_workout_with_meta'])

function createEmptySetDraft(): SessionSetDraft {
  return {
    reps: '',
    weight: '',
    duration: '',
    distance: '',
  }
}

function convertWeightDraftValue(
  value: string,
  fromUnits: UnitsPreference,
  toUnits: UnitsPreference,
): string {
  if (fromUnits === toUnits) return value
  const trimmed = value.trim()
  if (!trimmed) return value

  const parsed = Number.parseFloat(trimmed.replace(',', '.'))
  if (!Number.isFinite(parsed)) return value

  return String(convertWeightBetweenUnits(parsed, fromUnits, toUnits))
}

function normalizeTrackingMode(value: string | null | undefined): ExerciseTrackingMode {
  if (
    value === 'weight_reps' ||
    value === 'reps_only' ||
    value === 'time' ||
    value === 'distance_time'
  ) {
    return value
  }
  return 'weight_reps'
}

function normalizeWorkoutSetType(value: string | null | undefined): WorkoutSetType {
  if (value === 'normal' || value === 'warmup' || value === 'drop' || value === 'failure') {
    return value
  }
  return 'normal'
}

function normalizeRir(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(10, Math.round(Number(value))))
}

export function useWorkoutSessionController(workoutId?: string) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const sync = useSyncStatus()
  const { t } = useI18n()
  const { enqueueToast } = useTrophyToasts()
  const workoutSessionData = useWorkoutSessionData(workoutId, user?.id)
  useKeepAwake()

  // --- Session state ---
  const [exercises, setExercises] = useState<WorkoutDetail['workout_exercises']>([])
  const [units, setUnits] = useState<UnitsPreference>('kg')
  const [restTimerSeconds, setRestTimerSeconds] = useState(90)
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null)
  const [sessionNotes, setSessionNotes] = useState<string | null>(null)
  const [sessionRoutineName, setSessionRoutineName] = useState<string | null>(null)
  const elapsedSecondsRef = useRef(0)
  const [reloadTick, setReloadTick] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // --- Modal state ---
  const [isAddingExercise, setIsAddingExercise] = useState(false)
  const [addExerciseError, setAddExerciseError] = useState<string | null>(null)
  const [modalState, setModalState] = useState({
    isExerciseVisible: false,
    isCancelVisible: false,
    isFinishVisible: false,
    isDefaultsVisible: false,
  })

  // --- Set CRUD state ---
  const [setDrafts, setSetDrafts] = useState<Record<string, SessionSetDraft>>({})
  const [cueDrafts, setCueDrafts] = useState<Record<string, string>>({})
  const [exerciseDefaultsByDefinitionId, setExerciseDefaultsByDefinitionId] =
    useState<ExerciseDefaultsMap>({})
  const [lastTimeSummaryByDefinitionId, setLastTimeSummaryByDefinitionId] = useState<
    Record<string, string | null>
  >({})
  const [lastPerformanceByDefinitionId, setLastPerformanceByDefinitionId] = useState<
    Record<string, LastExercisePerformance | null>
  >({})
  const [lastCompletedSetByExercise, setLastCompletedSetByExercise] = useState<
    Record<string, string>
  >({})
  const [mutationState, setSetMutationState] = useState({
    savingSetId: null as string | null,
    savingCueExerciseId: null as string | null,
    deletingSetId: null as string | null,
    deletingExerciseId: null as string | null,
    updatingSetId: null as string | null,
  })
  const [editState, setEditState] = useState<{
    editingSetId: string | null
    draft: SessionSetDraft
  }>({
    editingSetId: null,
    draft: createEmptySetDraft(),
  })
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null)
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>('WORK')
  const [restSourceExerciseId, setRestSourceExerciseId] = useState<string | null>(null)
  const [nextUpPreview, setNextUpPreview] = useState<NextUpPreview | null>(null)
  const [isRestModalExpanded, setIsRestModalExpanded] = useState(false)
  const [advancedSetDraft, setAdvancedSetDraft] = useState<{
    exerciseId: string
    setId: string
    setType: WorkoutSetType
    rir: number
  } | null>(null)

  // --- Session-level mutation state ---
  const [finishFlowState, setFinishFlowState] = useState<WorkoutFinishFlowState>('confirm')
  const [isCancelling, setIsCancelling] = useState(false)
  const [finishEffortRating, setFinishEffortRating] = useState<number | null>(null)
  const [finishSessionNote, setFinishSessionNote] = useState('')
  const [defaultsExerciseContext, setDefaultsExerciseContext] = useState<{
    exerciseDefinitionId: string
    exerciseName: string
  } | null>(null)
  const [defaultSetsDraft, setDefaultSetsDraft] = useState('3')
  const [defaultRepsDraft, setDefaultRepsDraft] = useState('')
  const [isSavingDefaults, setIsSavingDefaults] = useState(false)
  const [defaultsError, setDefaultsError] = useState<string | null>(null)
  const [exerciseErrors, setExerciseErrors] = useState<Record<string, string>>({})
  const [finishError, setFinishError] = useState<string | null>(null)
  const [finishQueuedDetail, setFinishQueuedDetail] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [celebrationShareError, setCelebrationShareError] = useState<string | null>(null)
  const [pendingFinishRequest, setPendingFinishRequest] = useState<WorkoutFinishRequest | null>(
    null,
  )
  const [shouldAutoShareOnSuccess, setShouldAutoShareOnSuccess] = useState(false)
  const [programContext, setProgramContext] = useState<WorkoutProgramContext | null>(null)
  const [exerciseDetail, setExerciseDetail] = useState<{
    name: string
    slug?: string | null
    muscle_group?: string | null
    equipment?: string | null
  } | null>(null)
  const [favoriteExerciseIds, setFavoriteExerciseIds] = useState<Set<string>>(new Set())
  const [prExerciseIds, setPrExerciseIds] = useState<Set<string>>(new Set())
  const [saveFeedback, setSaveFeedback] = useState<'saved' | 'saved_local' | null>(null)

  // --- Accordion state ---
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)
  const [isReduceMotionEnabledForLayout, setIsReduceMotionEnabledForLayout] = useState<
    boolean | null
  >(null)
  const reducedMotion = useReducedMotion()
  const tickScale = useRef(new Animated.Value(1)).current
  const completionTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const previousRestSecondsRef = useRef<number>(0)
  const previousUnitsRef = useRef<UnitsPreference | null>(null)
  const autoOpenedAddExerciseByWorkoutIdRef = useRef<Record<string, true>>({})
  const hasRetriedEmptyWorkoutByWorkoutIdRef = useRef<Record<string, true>>({})
  const emptyWorkoutRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shareCardSvgRef = useRef<Svg | null>(null)
  const saveFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) {
          setIsReduceMotionEnabledForLayout(enabled)
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsReduceMotionEnabledForLayout(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const animateNextLayout = useCallback(() => {
    if (isReduceMotionEnabledForLayout !== false) return
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
  }, [isReduceMotionEnabledForLayout])
  const showSaveFeedback = useCallback(() => {
    const nextFeedback =
      sync.status === 'offline' || sync.pendingCount > 0 ? 'saved_local' : 'saved'

    setSaveFeedback(nextFeedback)

    if (saveFeedbackTimeoutRef.current) {
      clearTimeout(saveFeedbackTimeoutRef.current)
    }

    saveFeedbackTimeoutRef.current = setTimeout(() => {
      setSaveFeedback(null)
      saveFeedbackTimeoutRef.current = null
    }, 1500)
  }, [sync.pendingCount, sync.status])

  useEffect(() => {
    return () => {
      if (saveFeedbackTimeoutRef.current) {
        clearTimeout(saveFeedbackTimeoutRef.current)
      }
    }
  }, [])

  // --- Grouped state adapters (keep handlers/UI unchanged) ---
  const isExerciseModalVisible = modalState.isExerciseVisible
  const isCancelModalVisible = modalState.isCancelVisible
  const isFinishModalVisible = modalState.isFinishVisible
  const isDefaultsModalVisible = modalState.isDefaultsVisible
  const setIsExerciseModalVisible = (visible: boolean) =>
    setModalState((prev) => ({ ...prev, isExerciseVisible: visible }))
  const setIsCancelModalVisible = (visible: boolean) =>
    setModalState((prev) => ({ ...prev, isCancelVisible: visible }))
  const setIsFinishModalVisible = (visible: boolean) =>
    setModalState((prev) => ({ ...prev, isFinishVisible: visible }))
  const setIsDefaultsModalVisible = (visible: boolean) =>
    setModalState((prev) => ({ ...prev, isDefaultsVisible: visible }))
  const isFinishing = finishFlowState === 'saving'
  const showCelebration = finishFlowState === 'success'

  const openFinishModal = useCallback(() => {
    setFinishEffortRating(null)
    setFinishSessionNote('')
    setFinishError(null)
    setFinishQueuedDetail(null)
    setCelebrationShareError(null)
    setPendingFinishRequest(null)
    setShouldAutoShareOnSuccess(false)
    setFinishFlowState('confirm')
    setIsFinishModalVisible(true)
  }, [])

  const closeFinishModal = useCallback(() => {
    if (finishFlowState === 'saving') return
    setIsFinishModalVisible(false)
    setFinishError(null)
    setFinishQueuedDetail(null)
    setCelebrationShareError(null)
    setFinishFlowState('confirm')
    setPendingFinishRequest(null)
    setShouldAutoShareOnSuccess(false)
  }, [finishFlowState])

  const savingSetId = mutationState.savingSetId
  const savingCueExerciseId = mutationState.savingCueExerciseId
  const deletingSetId = mutationState.deletingSetId
  const deletingExerciseId = mutationState.deletingExerciseId
  const updatingSetId = mutationState.updatingSetId
  const setSavingSetId = (id: string | null) =>
    setSetMutationState((prev) => ({ ...prev, savingSetId: id }))
  const setSavingCueExerciseId = (id: string | null) =>
    setSetMutationState((prev) => ({ ...prev, savingCueExerciseId: id }))
  const setDeletingSetId = (id: string | null) =>
    setSetMutationState((prev) => ({ ...prev, deletingSetId: id }))
  const setDeletingExerciseId = (id: string | null) =>
    setSetMutationState((prev) => ({ ...prev, deletingExerciseId: id }))
  const setUpdatingSetId = (id: string | null) =>
    setSetMutationState((prev) => ({ ...prev, updatingSetId: id }))

  const editingSetId = editState.editingSetId
  const editDraft = editState.draft
  const setEditingSetId = (setId: string | null) =>
    setEditState((prev) => ({ ...prev, editingSetId: setId }))
  const setEditDraft = (value: SessionSetDraft | ((prev: SessionSetDraft) => SessionSetDraft)) =>
    setEditState((prev) => ({
      ...prev,
      draft: typeof value === 'function' ? value(prev.draft) : value,
    }))

  // ─── Effects ────────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      let cancelled = false

      void loadProfilePreferences().then((preferences) => {
        if (cancelled) return
        setUnits(preferences.units)
        setRestTimerSeconds(preferences.restTimerSeconds)
      })

      return () => {
        cancelled = true
      }
    }, []),
  )

  useEffect(() => {
    let cancelled = false

    const loadDefaults = async () => {
      if (!user) {
        setExerciseDefaultsByDefinitionId({})
        return
      }

      const defaults = await loadExerciseDefaults(user.id)
      if (!cancelled) {
        setExerciseDefaultsByDefinitionId(defaults)
      }
    }

    void loadDefaults()

    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void listExerciseFavorites(user.id).then((result) => {
      if (!cancelled && result.data) {
        setFavoriteExerciseIds(result.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    const previousUnits = previousUnitsRef.current
    if (!previousUnits) {
      previousUnitsRef.current = units
      return
    }
    if (previousUnits === units) return

    setSetDrafts((prev) => {
      let changed = false
      const next: Record<string, SessionSetDraft> = {}
      Object.entries(prev).forEach(([exerciseId, draft]) => {
        const convertedWeight = convertWeightDraftValue(draft.weight, previousUnits, units)
        if (convertedWeight !== draft.weight) {
          changed = true
        }
        next[exerciseId] = { ...draft, weight: convertedWeight }
      })
      return changed ? next : prev
    })

    setEditDraft((prev) => {
      const convertedWeight = convertWeightDraftValue(prev.weight, previousUnits, units)
      if (convertedWeight === prev.weight) return prev
      return { ...prev, weight: convertedWeight }
    })

    previousUnitsRef.current = units
  }, [units])

  useEffect(() => {
    const loadWorkout = async () => {
      if (!workoutId) {
        setLoadError(t('session.errorMissingId'))
        setIsLoading(false)
        return
      }

      const currentWorkoutId = workoutId

      setIsLoading(true)
      setLoadError(null)
      try {
        const [workoutResponse, loadedProgramContext] = await Promise.all([
          workoutSessionData.loadWorkout(),
          user ? getWorkoutProgramContext(user.id, currentWorkoutId) : Promise.resolve(null),
        ])
        const { data, error } = workoutResponse
        if (error || !data) {
          setLoadError(sanitizeErrorMessage(error?.message ?? t('session.errorLoadWorkout')))
          setExercises([])
          setSessionStartedAt(null)
          setSessionNotes(null)
          setCueDrafts({})
          setProgramContext(null)
        } else {
          const orderedExercises = [...(data.workout_exercises ?? [])].sort(
            (a, b) => a.order_index - b.order_index,
          )
          const normalized = orderedExercises.map((exercise) => ({
            ...exercise,
            workout_sets: [...(exercise.workout_sets ?? [])].sort(
              (a, b) => a.set_index - b.set_index,
            ),
          }))
          const parsedSessionNotes = parseWorkoutMetaNotes(data.notes)
          setExercises(normalized)
          setSessionStartedAt(data.started_at ?? data.ended_at ?? data.created_at ?? null)
          setSessionNotes(parsedSessionNotes.remainingNotes)
          setCueDrafts(
            normalized.reduce<Record<string, string>>((acc, exercise) => {
              acc[exercise.id] = exercise.notes ?? ''
              return acc
            }, {}),
          )
          setProgramContext(loadedProgramContext)

          if (
            normalized.length === 0 &&
            !isFinishing &&
            !isCancelling &&
            !autoOpenedAddExerciseByWorkoutIdRef.current[currentWorkoutId]
          ) {
            if (!hasRetriedEmptyWorkoutByWorkoutIdRef.current[currentWorkoutId]) {
              hasRetriedEmptyWorkoutByWorkoutIdRef.current[currentWorkoutId] = true
              if (emptyWorkoutRetryTimeoutRef.current)
                clearTimeout(emptyWorkoutRetryTimeoutRef.current)
              emptyWorkoutRetryTimeoutRef.current = setTimeout(() => {
                emptyWorkoutRetryTimeoutRef.current = null
                setReloadTick((r) => r + 1)
              }, 1500)
            } else {
              autoOpenedAddExerciseByWorkoutIdRef.current[currentWorkoutId] = true
              setIsExerciseModalVisible(true)
            }
          }
        }
      } catch (loadError) {
        if (__DEV__) {
          console.warn('Failed loading workout session:', loadError)
        }
        setLoadError(
          sanitizeErrorMessage(
            loadError instanceof Error ? loadError.message : t('session.errorLoadWorkout'),
          ),
        )
        setExercises([])
        setSessionStartedAt(null)
        setSessionNotes(null)
        setCueDrafts({})
        setProgramContext(null)
      } finally {
        setIsLoading(false)
      }
    }

    void loadWorkout()
    return () => {
      if (emptyWorkoutRetryTimeoutRef.current) {
        clearTimeout(emptyWorkoutRetryTimeoutRef.current)
        emptyWorkoutRetryTimeoutRef.current = null
      }
    }
  }, [isCancelling, isFinishing, reloadTick, t, user, workoutId, workoutSessionData])

  useEffect(() => {
    if (!user?.id || !workoutId) {
      setSessionRoutineName(null)
      return
    }

    let cancelled = false

    const loadRoutineContext = async () => {
      try {
        const routineId = await getWorkoutRoutine(user.id, workoutId)
        if (!routineId) {
          if (!cancelled) {
            setSessionRoutineName(null)
          }
          return
        }

        const routines = await loadRoutines(user.id)
        if (cancelled) return

        const routine = routines.find((entry) => entry.id === routineId.trim())
        setSessionRoutineName(routine?.name ?? null)
      } catch {
        if (!cancelled) {
          setSessionRoutineName(null)
        }
      }
    }

    void loadRoutineContext()

    return () => {
      cancelled = true
    }
  }, [user?.id, workoutId])

  useEffect(() => {
    if (!sessionStartedAt) {
      elapsedSecondsRef.current = 0
      return
    }

    const startedMs = new Date(sessionStartedAt).getTime()
    const updateElapsed = () => {
      elapsedSecondsRef.current = Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [sessionStartedAt])

  useEffect(() => {
    return () => {
      Object.values(completionTimeoutsRef.current).forEach((timerId) => clearTimeout(timerId))
      completionTimeoutsRef.current = {}
    }
  }, [])

  useEffect(() => {
    setLastTimeSummaryByDefinitionId({})
    setLastPerformanceByDefinitionId({})
  }, [workoutId])

  useEffect(() => {
    if (!workoutId || !user || exercises.length === 0) return

    const uniqueDefinitionIds = Array.from(
      new Set(
        exercises
          .map((exercise) => exercise.exercise_definition_id)
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const missingDefinitionIds = uniqueDefinitionIds.filter(
      (definitionId) => !(definitionId in lastTimeSummaryByDefinitionId),
    )
    if (missingDefinitionIds.length === 0) return

    let cancelled = false

    const loadLastTimeSummaries = async () => {
      const responses = await Promise.all(
        missingDefinitionIds.map((definitionId) =>
          workoutSessionData.fetchLastPerformance(definitionId),
        ),
      )
      if (cancelled) return

      setLastTimeSummaryByDefinitionId((prev) => {
        const next = { ...prev }
        missingDefinitionIds.forEach((definitionId, index) => {
          const response = responses[index]
          if (response.error) {
            if (__DEV__) {
              console.warn('Failed to fetch last-time summary:', response.error.message)
            }
            return
          }

          if (!response.data) {
            next[definitionId] = null
            return
          }

          const topSets = response.data.sets.slice(0, 3)
          if (topSets.length === 0) {
            next[definitionId] = null
            return
          }

          next[definitionId] = t('session.lastTime', {
            summary: topSets
              .map((set) => `${resolveDisplayWeight(set, units)}×${set.reps}`)
              .join(', '),
          })
        })
        return next
      })

      setLastPerformanceByDefinitionId((prev) => {
        const next = { ...prev }
        missingDefinitionIds.forEach((definitionId, index) => {
          const response = responses[index]
          if (response.error) return
          next[definitionId] = response.data ?? null
        })
        return next
      })
    }

    void loadLastTimeSummaries()

    return () => {
      cancelled = true
    }
  }, [exercises, lastTimeSummaryByDefinitionId, units, user, workoutId, workoutSessionData])

  useEffect(() => {
    if (!restTimer?.isRunning) return
    if (restTimer.remainingSeconds <= 0) return

    const intervalId = setInterval(() => {
      setRestTimer((prev) => (prev ? tickRestTimer(prev) : prev))
    }, 1000)

    return () => clearInterval(intervalId)
  }, [restTimer])

  useEffect(() => {
    const currentRemaining = restTimer?.remainingSeconds ?? 0
    if (previousRestSecondsRef.current > 0 && currentRemaining === 0) {
      if (!reducedMotion && Platform.OS === 'ios') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      }
      setWorkoutMode('NEXT_UP')
    }
    previousRestSecondsRef.current = currentRemaining
  }, [reducedMotion, restTimer?.remainingSeconds])

  useEffect(() => {
    const remaining = restTimer?.remainingSeconds
    if (!remaining || remaining <= 0 || reducedMotion) return
    tickScale.setValue(1)
    Animated.sequence([
      Animated.timing(tickScale, {
        toValue: 1.08,
        duration: motion.duration.fast,
        easing: motion.easing.spring,
        useNativeDriver: true,
      }),
      Animated.timing(tickScale, {
        toValue: 1,
        duration: motion.duration.fast,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }),
    ]).start()
  }, [reducedMotion, restTimer?.remainingSeconds, tickScale])

  // ─── Derived values ─────────────────────────────────────────────────

  const isSessionLocked = isFinishing || isCancelling
  const isMutating =
    isSessionLocked ||
    isAddingExercise ||
    savingSetId !== null ||
    deletingSetId !== null ||
    deletingExerciseId !== null ||
    updatingSetId !== null
  const exerciseCountLabel = t('session.exerciseCount', {
    count: exercises.length,
    plural: exercises.length === 1 ? '' : 's',
  })

  const nextOrderIndex = useMemo(() => {
    return exercises.reduce((max, exercise) => Math.max(max, exercise.order_index), -1) + 1
  }, [exercises])

  const programTargetByDefinitionId = useMemo(() => {
    const targets =
      programContext?.targets.reduce<Record<string, WorkoutProgramContext['targets'][number]>>(
        (acc, target) => {
          acc[target.exerciseDefinitionId] = target
          return acc
        },
        {},
      ) ?? {}

    return targets
  }, [programContext])

  const progressionSuggestionByDefinitionId = useMemo(() => {
    const suggestions: Record<
      string,
      NonNullable<ReturnType<typeof computeProgressionSuggestion>>
    > = {}

    for (const target of programContext?.targets ?? []) {
      const lastPerformance = lastPerformanceByDefinitionId[target.exerciseDefinitionId] ?? null
      const suggestion = computeProgressionSuggestion({
        lastPerformance,
        targetSets: target.sets,
        targetReps: target.reps,
        exerciseType: target.type,
        units,
      })

      if (suggestion) {
        suggestions[target.exerciseDefinitionId] = suggestion
      }
    }

    return suggestions
  }, [lastPerformanceByDefinitionId, programContext?.targets, units])

  const shareData = useMemo(() => {
    const performedAt = sessionStartedAt ?? new Date().toISOString()
    const dateLabel = new Date(performedAt).toLocaleDateString()
    const shareTitle = programContext?.workoutNameKey
      ? t(programContext.workoutNameKey as TranslationKey)
      : t('share.title')

    return buildWorkoutShareData({
      workoutId: workoutId ?? 'unknown',
      title: shareTitle,
      performedAt,
      performedDateLabel: dateLabel,
      startedAt: sessionStartedAt,
      endedAt: new Date().toISOString(),
      durationSeconds: elapsedSecondsRef.current,
      units,
      exercises: exercises.map((exercise) => {
        const previousPerformance =
          lastPerformanceByDefinitionId[exercise.exercise_definition_id] ?? null
        const previousBestE1rmKg = previousPerformance
          ? previousPerformance.sets.reduce((best, set) => {
              const e1rm = computeE1RM(Number(set.weight_kg), set.reps)
              return Number.isFinite(e1rm) ? Math.max(best, e1rm) : best
            }, 0)
          : 0

        return {
          exerciseDefinitionId: exercise.exercise_definition_id,
          exerciseName: exercise.exercise_definition?.name ?? t('detail.exercise'),
          previousBestE1rmKg: previousBestE1rmKg > 0 ? previousBestE1rmKg : null,
          sets: exercise.workout_sets.map((set) => ({
            reps: set.reps ?? 0,
            weight: resolveDisplayWeight(set, units),
            weightKg: set.weight_kg,
            isWeightCanonical: set.is_weight_canonical,
          })),
        }
      }),
    })
  }, [
    exercises,
    lastPerformanceByDefinitionId,
    programContext?.workoutNameKey,
    sessionStartedAt,
    t,
    units,
    workoutId,
  ])

  const sessionStats = useMemo(() => {
    let sets = 0
    let volumeKg = 0
    for (const ex of exercises) {
      for (const s of ex.workout_sets ?? []) {
        sets += 1
        const reps = s.reps ?? 0
        const w = s.weight_kg ?? s.weight ?? 0
        if (Number.isFinite(reps) && Number.isFinite(w)) volumeKg += reps * w
      }
    }
    return { sets, volumeKg }
  }, [exercises])

  const sessionProgress = useMemo(() => {
    const totalExercises = exercises.length
    let completedExercises = 0
    for (const ex of exercises) {
      const target = exerciseDefaultsByDefinitionId[ex.exercise_definition_id]?.defaultSets ?? 3
      if (ex.workout_sets.length >= target) completedExercises++
    }
    const percent = totalExercises > 0 ? Math.round((completedExercises / totalExercises) * 100) : 0
    return { completedExercises, totalExercises, percent }
  }, [exercises, exerciseDefaultsByDefinitionId])

  const coachingLabel = useMemo((): string | null => {
    if (exercises.length === 0) return null
    const { sets } = sessionStats
    const { completedExercises, totalExercises, percent } = sessionProgress
    if (sets === 0) return t('session.coachingFirstSet')
    if (completedExercises >= totalExercises && totalExercises > 0)
      return t('session.coachingReadyToFinish')
    const ordered = [...exercises].sort((a, b) => a.order_index - b.order_index)
    const lastExercise = ordered[ordered.length - 1]
    if (lastExercise && lastExercise.workout_sets.length > 0) {
      const othersIncomplete = ordered.slice(0, -1).some((ex) => {
        const target = exerciseDefaultsByDefinitionId[ex.exercise_definition_id]?.defaultSets ?? 3
        return ex.workout_sets.length < target
      })
      if (!othersIncomplete) return t('session.coachingFinalPush')
    }
    if (percent >= 50) return t('session.coachingHalfway')
    return null
  }, [exercises, sessionStats, sessionProgress, exerciseDefaultsByDefinitionId, t])

  const getLastSetForExercise = (exerciseId: string) => {
    const target = exercises.find((exercise) => exercise.id === exerciseId)
    if (!target || target.workout_sets.length === 0) return null
    return target.workout_sets[target.workout_sets.length - 1]
  }

  const resolveTrackingModeForExercise = (
    exercise: WorkoutDetail['workout_exercises'][number] | undefined,
  ): ExerciseTrackingMode => {
    return normalizeTrackingMode(exercise?.exercise_definition?.tracking_mode)
  }

  const resolveTrackingModeForExerciseId = (exerciseId: string): ExerciseTrackingMode => {
    const exercise = exercises.find((item) => item.id === exerciseId)
    return resolveTrackingModeForExercise(exercise)
  }

  const resolveDraftForExercise = (exerciseId: string) => {
    const trackingMode = resolveTrackingModeForExerciseId(exerciseId)
    const fromState = setDrafts[exerciseId]
    if (fromState) return fromState

    const lastSet = getLastSetForExercise(exerciseId)
    if (!lastSet) {
      return createEmptySetDraft()
    }

    if (trackingMode === 'weight_reps') {
      const draftFromLastSet = getDefaultSetDraft({
        ...lastSet,
        reps: lastSet.reps ?? 0,
        weight: resolveDisplayWeight(lastSet, units),
      })
      return {
        ...createEmptySetDraft(),
        reps: draftFromLastSet.reps,
        weight: draftFromLastSet.weight,
      }
    }

    if (trackingMode === 'reps_only') {
      return {
        ...createEmptySetDraft(),
        reps: Number.isFinite(lastSet.reps) ? String(lastSet.reps) : '',
      }
    }

    if (trackingMode === 'time') {
      return {
        ...createEmptySetDraft(),
        duration: formatDurationInput(lastSet.duration_seconds),
      }
    }

    return {
      ...createEmptySetDraft(),
      duration: formatDurationInput(lastSet.duration_seconds),
      distance: formatDistanceLabel(lastSet.distance_m, units),
    }
  }

  useEffect(() => {
    if (!programContext || exercises.length === 0) return

    setSetDrafts((prev) => {
      let changed = false
      const nextDrafts = { ...prev }

      for (const exercise of exercises) {
        if (exercise.workout_sets.length > 0) continue

        const target = programTargetByDefinitionId[exercise.exercise_definition_id]
        if (!target) continue
        if (normalizeTrackingMode(exercise.exercise_definition?.tracking_mode) !== 'weight_reps') {
          continue
        }

        const existingDraft = nextDrafts[exercise.id] ?? createEmptySetDraft()
        const suggestion = progressionSuggestionByDefinitionId[exercise.exercise_definition_id]

        const nextReps =
          existingDraft.reps.trim().length > 0 ? existingDraft.reps : String(target.reps)
        const nextWeight =
          existingDraft.weight.trim().length > 0
            ? existingDraft.weight
            : suggestion
              ? String(suggestion.suggestedWeight)
              : existingDraft.weight

        if (nextReps !== existingDraft.reps || nextWeight !== existingDraft.weight) {
          changed = true
          nextDrafts[exercise.id] = {
            ...createEmptySetDraft(),
            reps: nextReps,
            weight: nextWeight,
          }
        }
      }

      return changed ? nextDrafts : prev
    })
  }, [exercises, programContext, programTargetByDefinitionId, progressionSuggestionByDefinitionId])

  // ─── Helpers ────────────────────────────────────────────────────────

  const updateExerciseError = (exerciseId: string, message: string | null) => {
    setExerciseErrors((prev) => {
      if (message === null) {
        if (!prev[exerciseId]) return prev
        const next = { ...prev }
        delete next[exerciseId]
        return next
      }
      return { ...prev, [exerciseId]: message }
    })
  }

  const clearEditState = () => {
    setEditingSetId(null)
    setEditDraft(createEmptySetDraft())
  }

  const buildNextUpPreview = (sourceExerciseId: string): NextUpPreview | null => {
    if (exercises.length === 0) return null

    const ordered = [...exercises].sort((a, b) => a.order_index - b.order_index)
    const sourceIndex = ordered.findIndex((exercise) => exercise.id === sourceExerciseId)
    const fallbackSourceIndex = sourceIndex >= 0 ? sourceIndex : 0
    const sourceExercise = ordered[fallbackSourceIndex]
    if (!sourceExercise) return null

    const previewSource = sourceExercise
    const previewSourceIndex = fallbackSourceIndex

    const sourceTargetSets =
      exerciseDefaultsByDefinitionId[previewSource.exercise_definition_id]?.defaultSets ?? 3

    if (previewSource.workout_sets.length < sourceTargetSets) {
      const nextSetIndex = previewSource.workout_sets.length + 1
      const previewSet = previewSource.workout_sets.find(
        (set) => set.set_index === nextSetIndex - 1,
      )
      return {
        exerciseId: previewSource.id,
        exerciseName: previewSource.exercise_definition?.name ?? t('detail.exercise'),
        setIndex: nextSetIndex,
        setType: previewSet ? normalizeWorkoutSetType(previewSet.set_type) : null,
        remainingSets: Math.max(0, sourceTargetSets - previewSource.workout_sets.length),
      }
    }

    const nextExercise = ordered[previewSourceIndex + 1]
    if (nextExercise) {
      const previewSet = nextExercise.workout_sets.find((set) => set.set_index === 0)
      const nextTargetSets =
        exerciseDefaultsByDefinitionId[nextExercise.exercise_definition_id]?.defaultSets ?? 3
      return {
        exerciseId: nextExercise.id,
        exerciseName: nextExercise.exercise_definition?.name ?? t('detail.exercise'),
        setIndex: 1,
        setType: previewSet ? normalizeWorkoutSetType(previewSet.set_type) : null,
        remainingSets: Math.max(0, nextTargetSets - nextExercise.workout_sets.length),
      }
    }

    const nextSetIndex = previewSource.workout_sets.length + 1
    const previewSet = previewSource.workout_sets.find((set) => set.set_index === nextSetIndex - 1)
    return {
      exerciseId: previewSource.id,
      exerciseName: previewSource.exercise_definition?.name ?? t('detail.exercise'),
      setIndex: nextSetIndex,
      setType: previewSet ? normalizeWorkoutSetType(previewSet.set_type) : null,
      remainingSets: 0,
    }
  }

  const openNextUpState = (sourceExerciseId: string | null) => {
    if (!sourceExerciseId) {
      setNextUpPreview(null)
      setWorkoutMode('NEXT_UP')
      return
    }
    setNextUpPreview(buildNextUpPreview(sourceExerciseId))
    setWorkoutMode('NEXT_UP')
  }

  const resetRestModeState = () => {
    setRestTimer(null)
    setRestSourceExerciseId(null)
    setNextUpPreview(null)
    setWorkoutMode('WORK')
    setIsRestModalExpanded(false)
  }

  const startOrRestartRestTimer = (sourceExerciseId: string) => {
    const nextPreview = buildNextUpPreview(sourceExerciseId)

    if (nextPreview?.setType === 'drop') {
      setRestTimer(null)
      setRestSourceExerciseId(sourceExerciseId)
      setNextUpPreview(nextPreview)
      setWorkoutMode('NEXT_UP')
      return
    }

    if (!shouldStartRestTimer(restTimerSeconds)) {
      resetRestModeState()
      return
    }

    setRestTimer(startRestTimer(restTimerSeconds))
    setRestSourceExerciseId(sourceExerciseId)
    setNextUpPreview(nextPreview)
    setWorkoutMode('REST')
    triggerGentleHaptic({ reducedMotion })
  }

  const openExerciseDetail = (exercise: {
    name: string
    slug?: string | null
    muscle_group?: string | null
    equipment?: string | null
  }) => {
    setExerciseDetail(exercise)
  }

  const handleToggleExerciseFavorite = async (exerciseId: string, isFav: boolean) => {
    if (!user) return
    setFavoriteExerciseIds((prev) => {
      const next = new Set(prev)
      if (isFav) {
        next.add(exerciseId)
      } else {
        next.delete(exerciseId)
      }
      return next
    })
    const { error } = await toggleExerciseFavorite(user.id, exerciseId, isFav)
    if (error) {
      setFavoriteExerciseIds((prev) => {
        const next = new Set(prev)
        if (isFav) {
          next.delete(exerciseId)
        } else {
          next.add(exerciseId)
        }
        return next
      })
    }
  }

  const handleShareWorkoutSummary = useCallback(async (): Promise<boolean> => {
    if (isSharing || !workoutId) return false

    setIsSharing(true)
    setCelebrationShareError(null)
    capture('share_attempt', { source: 'workout_completion' })

    try {
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve())
      })

      let streakDays: number | null = null

      if (user?.id) {
        try {
          const sinceISO = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
          const { data } = await withTimeout(
            fetchCompletedWorkoutDates(sinceISO),
            SHARE_STREAK_FETCH_TIMEOUT_MS,
          )
          const synthetic = (data ?? [])
            .map((workout) => {
              const performedAt = workout.started_at ?? workout.ended_at ?? workout.created_at
              if (!performedAt) return null

              return {
                id: workout.id,
                ended_at: performedAt,
                started_at: performedAt,
                workout_exercises: [],
              }
            })
            .filter(
              (
                workout,
              ): workout is {
                id: string
                ended_at: string
                started_at: string
                workout_exercises: []
              } => Boolean(workout),
            )

          streakDays = computeStreak(synthetic)
        } catch {
          streakDays = null
        }
      }

      const finalShareData = {
        ...shareData,
        streakDays:
          Number.isFinite(streakDays) && streakDays && streakDays > 0
            ? streakDays
            : shareData.streakDays,
      }

      const fallbackText = buildWorkoutShareFallbackText(finalShareData, {
        durationLabel: t('share.duration'),
        volumeLabel: t('share.volume'),
        streakLabel: t('share.streak'),
        topLiftsLabel: t('share.topLifts'),
        prBadge: t('share.prBadge'),
        noTopLiftsLabel: t('share.noTopLifts'),
      })

      const shareResult = await shareWorkoutCard({
        cacheKey: `session_${workoutId}_${finalShareData.setCount}_${finalShareData.durationSeconds}_${units}`,
        fallbackText,
        renderImageBase64: () => captureSvgToPngBase64(shareCardSvgRef.current),
      })

      if (shareResult.shared) {
        capture('share_success', {
          source: 'workout_completion',
          used_image: shareResult.usedImage,
        })
        return true
      }

      setCelebrationShareError(t('session.complete.shareFailed'))
      return false
    } catch {
      setCelebrationShareError(t('session.complete.shareFailed'))
      return false
    } finally {
      setIsSharing(false)
    }
  }, [isSharing, shareData, t, units, user?.id, workoutId])

  useEffect(() => {
    if (finishFlowState !== 'success' || !shouldAutoShareOnSuccess || isSharing) return

    setShouldAutoShareOnSuccess(false)
    InteractionManager.runAfterInteractions(() => {
      void handleShareWorkoutSummary()
    })
  }, [finishFlowState, handleShareWorkoutSummary, isSharing, shouldAutoShareOnSuccess])

  // ─── Accordion ──────────────────────────────────────────────────────

  const handleToggleExercise = (exerciseId: string) => {
    animateNextLayout()
    setExpandedExerciseId((prev) => {
      const isCollapsing = prev === exerciseId
      // If collapsing an exercise that has an active edit, cancel the edit
      if (isCollapsing && editingSetId) {
        const collapsingExercise = exercises.find((e) => e.id === exerciseId)
        if (collapsingExercise?.workout_sets.some((s) => s.id === editingSetId)) {
          clearEditState()
        }
      }
      return isCollapsing ? null : exerciseId
    })
  }

  // ─── Exercise handlers ──────────────────────────────────────────────

  const handleAddExercise = async (exercise: ExerciseDefinitionRow) => {
    if (!workoutId) return
    const trackingMode = normalizeTrackingMode(exercise.tracking_mode)

    setIsAddingExercise(true)
    setAddExerciseError(null)
    try {
      const { data, error } = await workoutSessionData.addExercise(exercise.id, nextOrderIndex)
      if (error || !data) {
        setAddExerciseError(sanitizeErrorMessage(error?.message ?? t('session.errorAddExercise')))
        return
      }

      capture('exercise_added', {
        workout_id: workoutId,
        exercise_definition_id: exercise.id,
      })

      animateNextLayout()
      setExercises((prev) => {
        const updated = [...prev, { ...data, workout_sets: [], exercise_definition: exercise }]
        return updated.sort((a, b) => a.order_index - b.order_index)
      })

      setExpandedExerciseId(data.id)
      setCueDrafts((prev) => ({ ...prev, [data.id]: '' }))
      setSetDrafts((prev) => {
        const defaults = exerciseDefaultsByDefinitionId[exercise.id]
        const defaultReps = defaults?.defaultReps
        const nextDraft = createEmptySetDraft()

        if (trackingMode === 'weight_reps' || trackingMode === 'reps_only') {
          nextDraft.reps = defaultReps ? String(defaultReps) : ''
        }

        return {
          ...prev,
          [data.id]: nextDraft,
        }
      })
      setIsExerciseModalVisible(false)
      hapticSelection(reducedMotion ?? false)
      showSaveFeedback()
    } catch (error) {
      setAddExerciseError(
        sanitizeErrorMessage(
          error instanceof Error ? error.message : t('session.errorAddExercise'),
        ),
      )
    } finally {
      setIsAddingExercise(false)
    }
  }

  const handleDeleteExercise = async (exerciseId: string) => {
    setDeletingExerciseId(exerciseId)
    updateExerciseError(exerciseId, null)
    try {
      const { error } = await workoutSessionData.deleteExercise(exerciseId)
      if (error) {
        updateExerciseError(
          exerciseId,
          sanitizeErrorMessage(error.message ?? t('session.errorRemoveExercise')),
        )
        return
      }

      animateNextLayout()
      setExercises((prev) => {
        const removedIndex = prev.findIndex((exercise) => exercise.id === exerciseId)
        const nextExercises = prev.filter((exercise) => exercise.id !== exerciseId)

        if (expandedExerciseId === exerciseId) {
          const fallback =
            (removedIndex >= 0 && nextExercises[removedIndex]) ||
            (removedIndex > 0 && nextExercises[removedIndex - 1]) ||
            nextExercises[0] ||
            null
          setExpandedExerciseId(fallback?.id ?? null)
        }

        return nextExercises
      })

      if (editingSetId) {
        const deletedExercise = exercises.find((exercise) => exercise.id === exerciseId)
        if (deletedExercise?.workout_sets.some((set) => set.id === editingSetId)) {
          clearEditState()
        }
      }

      setSetDrafts((prev) => {
        const next = { ...prev }
        delete next[exerciseId]
        return next
      })
      setCueDrafts((prev) => {
        const next = { ...prev }
        delete next[exerciseId]
        return next
      })

      setLastCompletedSetByExercise((prev) => {
        if (!prev[exerciseId]) return prev
        const next = { ...prev }
        delete next[exerciseId]
        return next
      })
      if (completionTimeoutsRef.current[exerciseId]) {
        clearTimeout(completionTimeoutsRef.current[exerciseId])
        delete completionTimeoutsRef.current[exerciseId]
      }

      setExerciseErrors((prev) => {
        if (!prev[exerciseId]) return prev
        const next = { ...prev }
        delete next[exerciseId]
        return next
      })
      hapticDestructive(reducedMotion ?? false)
      showSaveFeedback()
    } catch (error) {
      updateExerciseError(
        exerciseId,
        sanitizeErrorMessage(
          error instanceof Error ? error.message : t('session.errorRemoveExercise'),
        ),
      )
    } finally {
      setDeletingExerciseId(null)
    }
  }

  const handleOpenDefaults = (exerciseId: string) => {
    const targetExercise = exercises.find((exercise) => exercise.id === exerciseId)
    if (!targetExercise) return

    const currentDefaults = exerciseDefaultsByDefinitionId[targetExercise.exercise_definition_id]

    setDefaultsExerciseContext({
      exerciseDefinitionId: targetExercise.exercise_definition_id,
      exerciseName: targetExercise.exercise_definition?.name ?? 'Exercise',
    })
    setDefaultSetsDraft(String(currentDefaults?.defaultSets ?? 3))
    setDefaultRepsDraft(currentDefaults?.defaultReps ? String(currentDefaults.defaultReps) : '')
    setDefaultsError(null)
    setIsDefaultsModalVisible(true)
  }

  const handleExerciseActions = (exercise: WorkoutDetail['workout_exercises'][number]) => {
    const exerciseName = exercise.exercise_definition?.name ?? t('detail.exercise')
    const options = [
      t('exerciseDetail.view'),
      t('session.setDefaults'),
      t('session.removeExercise'),
      t('common.cancel'),
    ]

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        destructiveButtonIndex: 2,
        cancelButtonIndex: 3,
        title: exerciseName,
      },
      (buttonIndex) => {
        if (buttonIndex === 0) {
          openExerciseDetail({
            name: exerciseName,
            slug: exercise.exercise_definition?.slug,
            muscle_group: exercise.exercise_definition?.muscle_group,
            equipment: exercise.exercise_definition?.equipment,
          })
        }

        if (buttonIndex === 1) {
          handleOpenDefaults(exercise.id)
        }

        if (buttonIndex === 2) {
          handleDeleteExercise(exercise.id)
        }
      },
    )
  }

  const handleSaveExerciseDefaults = async () => {
    if (!user || !defaultsExerciseContext || isSavingDefaults) return

    const parsedSets = Number.parseInt(defaultSetsDraft, 10)
    if (
      !Number.isFinite(parsedSets) ||
      parsedSets < EXERCISE_DEFAULTS_LIMITS.minSets ||
      parsedSets > EXERCISE_DEFAULTS_LIMITS.maxSets
    ) {
      setDefaultsError(
        t('session.errorDefaultSets', {
          min: EXERCISE_DEFAULTS_LIMITS.minSets,
          max: EXERCISE_DEFAULTS_LIMITS.maxSets,
        }),
      )
      return
    }

    const hasReps = defaultRepsDraft.trim().length > 0
    const parsedReps = hasReps ? Number.parseInt(defaultRepsDraft, 10) : Number.NaN

    if (
      hasReps &&
      (!Number.isFinite(parsedReps) ||
        parsedReps < EXERCISE_DEFAULTS_LIMITS.minReps ||
        parsedReps > EXERCISE_DEFAULTS_LIMITS.maxReps)
    ) {
      setDefaultsError(
        t('session.errorDefaultReps', {
          min: EXERCISE_DEFAULTS_LIMITS.minReps,
          max: EXERCISE_DEFAULTS_LIMITS.maxReps,
        }),
      )
      return
    }

    setIsSavingDefaults(true)
    setDefaultsError(null)
    try {
      await setExerciseDefault(user.id, defaultsExerciseContext.exerciseDefinitionId, {
        defaultSets: parsedSets,
        defaultReps: hasReps ? parsedReps : Number.NaN,
      })

      setExerciseDefaultsByDefinitionId((prev) => ({
        ...prev,
        [defaultsExerciseContext.exerciseDefinitionId]: {
          defaultSets: parsedSets,
          defaultReps: hasReps ? parsedReps : undefined,
        },
      }))
      setSetDrafts((prev) => {
        const next = { ...prev }

        exercises
          .filter(
            (exercise) =>
              exercise.exercise_definition_id === defaultsExerciseContext.exerciseDefinitionId,
          )
          .forEach((exercise) => {
            if (exercise.workout_sets.length > 0) return
            const trackingMode = resolveTrackingModeForExercise(exercise)
            if (trackingMode !== 'weight_reps' && trackingMode !== 'reps_only') {
              return
            }
            next[exercise.id] = {
              ...createEmptySetDraft(),
              reps: hasReps ? String(parsedReps) : '',
            }
          })

        return next
      })

      setIsDefaultsModalVisible(false)
      setDefaultsExerciseContext(null)
    } catch (error) {
      setDefaultsError(
        sanitizeErrorMessage(
          error instanceof Error ? error.message : t('session.errorDefaultSets'),
        ),
      )
    } finally {
      setIsSavingDefaults(false)
    }
  }

  // ─── Set handlers ───────────────────────────────────────────────────

  const updateDraft = (exerciseId: string, field: keyof SessionSetDraft, value: string) => {
    const baseDraft = resolveDraftForExercise(exerciseId)
    setSetDrafts((prev) => ({
      ...prev,
      [exerciseId]: {
        ...baseDraft,
        [field]: value,
      },
    }))
  }

  const handleCueChange = (exerciseId: string, value: string) => {
    setCueDrafts((prev) => ({ ...prev, [exerciseId]: value }))
  }

  const handleCueBlur = async (exerciseId: string) => {
    const exercise = exercises.find((item) => item.id === exerciseId)
    if (!exercise) return

    const nextNotes = (cueDrafts[exerciseId] ?? '').trim()
    const normalizedNext = nextNotes.length > 0 ? nextNotes : null
    const normalizedCurrent = exercise.notes?.trim() || null

    if (normalizedCurrent === normalizedNext) return

    setSavingCueExerciseId(exerciseId)
    updateExerciseError(exerciseId, null)
    try {
      const { data, error } = await withTimeout(
        workoutSessionData.updateExerciseNotes(exerciseId, normalizedNext),
        5000,
      )

      if (error || !data) {
        updateExerciseError(
          exerciseId,
          sanitizeErrorMessage(error?.message ?? t('session.errorSaveCue')),
        )
        return
      }

      setExercises((prev) =>
        prev.map((item) =>
          item.id === exerciseId ? { ...item, notes: data.notes ?? null } : item,
        ),
      )
      setCueDrafts((prev) => ({
        ...prev,
        [exerciseId]: data.notes ?? '',
      }))
      showSaveFeedback()
    } catch (error) {
      updateExerciseError(
        exerciseId,
        sanitizeErrorMessage(error instanceof Error ? error.message : t('session.errorSaveCue')),
      )
    } finally {
      setSavingCueExerciseId(null)
    }
  }

  const handleAddSet = async (exerciseId: string) => {
    const draft = resolveDraftForExercise(exerciseId)
    const target = exercises.find((exercise) => exercise.id === exerciseId)
    const trackingMode = resolveTrackingModeForExercise(target)
    const repsValue = Number.parseInt(draft?.reps ?? '', 10)
    const weightValue = Number.parseFloat((draft?.weight ?? '').replace(',', '.'))
    const durationValue = parseDurationInput(draft?.duration ?? '')
    const distanceValue = parseDistanceInput(draft?.distance ?? '', units)

    let payload: {
      trackingMode: ExerciseTrackingMode
      reps?: number | null
      weight?: number | null
      weight_kg?: number | null
      duration_seconds?: number | null
      distance_m?: number | null
    } | null = null

    if (trackingMode === 'weight_reps') {
      if (!Number.isFinite(repsValue) || repsValue < REPS_MIN || repsValue > REPS_MAX) {
        updateExerciseError(exerciseId, t('session.errorReps', { min: REPS_MIN, max: REPS_MAX }))
        return
      }

      if (!Number.isFinite(weightValue) || weightValue < WEIGHT_MIN || weightValue > WEIGHT_MAX) {
        updateExerciseError(
          exerciseId,
          t('session.errorWeight', { min: WEIGHT_MIN, max: WEIGHT_MAX }),
        )
        return
      }

      payload = {
        trackingMode,
        reps: repsValue,
        weight: weightValue,
      }
    } else if (trackingMode === 'reps_only') {
      if (!Number.isFinite(repsValue) || repsValue < REPS_MIN || repsValue > REPS_MAX) {
        updateExerciseError(exerciseId, t('session.errorReps', { min: REPS_MIN, max: REPS_MAX }))
        return
      }

      payload = {
        trackingMode,
        reps: repsValue,
        weight: null,
        weight_kg: null,
        duration_seconds: null,
        distance_m: null,
      }
    } else if (trackingMode === 'time') {
      if (durationValue === null || durationValue <= 0) {
        updateExerciseError(exerciseId, t('session.errorDuration'))
        return
      }

      payload = {
        trackingMode,
        reps: null,
        weight: null,
        weight_kg: null,
        duration_seconds: durationValue,
        distance_m: null,
      }
    } else {
      if (durationValue === null || durationValue <= 0) {
        updateExerciseError(exerciseId, t('session.errorDuration'))
        return
      }

      if (distanceValue === null || distanceValue <= 0) {
        updateExerciseError(exerciseId, t('session.errorDistance'))
        return
      }

      payload = {
        trackingMode,
        reps: null,
        weight: null,
        weight_kg: null,
        duration_seconds: durationValue,
        distance_m: distanceValue,
      }
    }

    setSavingSetId(exerciseId)
    updateExerciseError(exerciseId, null)

    const nextSetIndex =
      (target?.workout_sets ?? []).reduce((max, set) => Math.max(max, set.set_index), -1) + 1

    try {
      const { data, error } = await workoutSessionData.addSet(
        exerciseId,
        payload,
        nextSetIndex,
        units,
      )
      if (error || !data) {
        updateExerciseError(
          exerciseId,
          sanitizeErrorMessage(error?.message ?? t('session.errorAddSet')),
        )
        return
      }

      capture('set_added', {
        workout_id: workoutId ?? 'unknown',
        exercise_definition_id: target?.exercise_definition?.id ?? 'unknown',
      })

      if (
        trackingMode === 'weight_reps' &&
        target?.exercise_definition_id &&
        data.reps != null &&
        (data.weight != null || data.weight_kg != null)
      ) {
        const weight = Number(data.weight_kg ?? data.weight ?? 0)
        const reps = Number(data.reps)
        const newE1RM = computeE1RM(weight, reps)
        if (newE1RM > 0) {
          const lastPerf = lastPerformanceByDefinitionId[target.exercise_definition_id]
          let prevBest = 0
          if (lastPerf?.sets?.length) {
            prevBest = Math.max(
              ...lastPerf.sets.map((s) => computeE1RM(s.weight_kg ?? s.weight, s.reps)),
            )
          }
          if (newE1RM > prevBest && user?.id) {
            void handleTrophyEvent(
              {
                type: 'PR_ACHIEVED',
                at: new Date().toISOString(),
              },
              user.id,
            )
            setPrExerciseIds((prev) => new Set([...prev, exerciseId]))
          }
        }
      }

      animateNextLayout()
      setExercises((prev) =>
        prev.map((exercise) =>
          exercise.id === exerciseId
            ? {
                ...exercise,
                workout_sets: [...exercise.workout_sets, data].sort(
                  (a, b) => a.set_index - b.set_index,
                ),
              }
            : exercise,
        ),
      )

      setSetDrafts((prev) => ({
        ...prev,
        [exerciseId]:
          trackingMode === 'weight_reps'
            ? {
                ...createEmptySetDraft(),
                ...getDefaultSetDraft({
                  ...data,
                  reps: data.reps ?? 0,
                  weight: resolveDisplayWeight(data, units),
                }),
              }
            : trackingMode === 'reps_only'
              ? {
                  ...createEmptySetDraft(),
                  reps: Number.isFinite(data.reps) ? String(data.reps) : '',
                }
              : trackingMode === 'time'
                ? {
                    ...createEmptySetDraft(),
                    duration: formatDurationInput(data.duration_seconds),
                  }
                : {
                    ...createEmptySetDraft(),
                    duration: formatDurationInput(data.duration_seconds),
                    distance: formatDistanceLabel(data.distance_m, units),
                  },
      }))
      setLastCompletedSetByExercise((prev) => ({
        ...prev,
        [exerciseId]: data.id,
      }))
      hapticSuccess(reducedMotion ?? false)
      showSaveFeedback()
      startOrRestartRestTimer(exerciseId)

      // Auto-advance to next exercise if current exercise reached target
      const updatedSetsCount = (target?.workout_sets?.length ?? 0) + 1
      const exerciseTarget =
        exerciseDefaultsByDefinitionId[target?.exercise_definition_id ?? '']?.defaultSets ?? 3
      if (updatedSetsCount >= exerciseTarget) {
        const nextPreview = buildNextUpPreview(exerciseId)
        if (nextPreview && nextPreview.exerciseId !== exerciseId) {
          setExpandedExerciseId(nextPreview.exerciseId)
        }
      }

      if (completionTimeoutsRef.current[exerciseId]) {
        clearTimeout(completionTimeoutsRef.current[exerciseId])
      }
      completionTimeoutsRef.current[exerciseId] = setTimeout(() => {
        setLastCompletedSetByExercise((prev) => {
          if (!prev[exerciseId]) return prev
          const next = { ...prev }
          delete next[exerciseId]
          return next
        })
        delete completionTimeoutsRef.current[exerciseId]
      }, 800)
    } catch (error) {
      updateExerciseError(
        exerciseId,
        sanitizeErrorMessage(error instanceof Error ? error.message : t('session.errorAddSet')),
      )
    } finally {
      setSavingSetId(null)
    }
  }

  const handleIncrementReps = (exerciseId: string) => {
    const trackingMode = resolveTrackingModeForExerciseId(exerciseId)
    if (trackingMode !== 'weight_reps' && trackingMode !== 'reps_only') return
    const draft = resolveDraftForExercise(exerciseId)
    const adjusted = applyRepIncrement({ reps: draft.reps, weight: draft.weight })
    setSetDrafts((prev) => ({
      ...prev,
      [exerciseId]: {
        ...draft,
        reps: adjusted.reps,
      },
    }))
    updateExerciseError(exerciseId, null)
  }

  const handleDecrementReps = (exerciseId: string) => {
    const trackingMode = resolveTrackingModeForExerciseId(exerciseId)
    if (trackingMode !== 'weight_reps' && trackingMode !== 'reps_only') return
    const draft = resolveDraftForExercise(exerciseId)
    const adjusted = applyRepDecrement({ reps: draft.reps, weight: draft.weight })
    setSetDrafts((prev) => ({
      ...prev,
      [exerciseId]: {
        ...draft,
        reps: adjusted.reps,
      },
    }))
    updateExerciseError(exerciseId, null)
  }

  const handleIncrementWeight = (exerciseId: string) => {
    const trackingMode = resolveTrackingModeForExerciseId(exerciseId)
    if (trackingMode !== 'weight_reps') return
    const draft = resolveDraftForExercise(exerciseId)
    const adjusted = applyWeightIncrement({ reps: draft.reps, weight: draft.weight }, units)
    setSetDrafts((prev) => ({
      ...prev,
      [exerciseId]: {
        ...draft,
        weight: adjusted.weight,
      },
    }))
    updateExerciseError(exerciseId, null)
  }

  const handleDecrementWeight = (exerciseId: string) => {
    const trackingMode = resolveTrackingModeForExerciseId(exerciseId)
    if (trackingMode !== 'weight_reps') return
    const draft = resolveDraftForExercise(exerciseId)
    const adjusted = applyWeightDecrement({ reps: draft.reps, weight: draft.weight }, units)
    setSetDrafts((prev) => ({
      ...prev,
      [exerciseId]: {
        ...draft,
        weight: adjusted.weight,
      },
    }))
    updateExerciseError(exerciseId, null)
  }

  const handleCopyLast = (exerciseId: string) => {
    const trackingMode = resolveTrackingModeForExerciseId(exerciseId)
    if (trackingMode !== 'weight_reps') return
    const draft = resolveDraftForExercise(exerciseId)
    const lastSet = getLastSetForExercise(exerciseId)
    const copied = copyLastSet(
      { reps: draft.reps, weight: draft.weight },
      lastSet
        ? {
            reps: lastSet.reps ?? 0,
            weight: resolveDisplayWeight(lastSet, units),
          }
        : null,
    )
    setSetDrafts((prev) => ({
      ...prev,
      [exerciseId]: {
        ...draft,
        reps: copied.reps,
        weight: copied.weight,
      },
    }))
    updateExerciseError(exerciseId, null)
  }

  const handleDeleteSet = async (exerciseId: string, setId: string) => {
    setDeletingSetId(setId)
    updateExerciseError(exerciseId, null)
    try {
      const { error } = await workoutSessionData.deleteSet(setId)
      if (error) {
        updateExerciseError(
          exerciseId,
          sanitizeErrorMessage(error.message ?? t('session.errorDeleteSet')),
        )
        return
      }

      animateNextLayout()
      setExercises((prev) =>
        prev.map((exercise) =>
          exercise.id === exerciseId
            ? {
                ...exercise,
                workout_sets: exercise.workout_sets.filter((set) => set.id !== setId),
              }
            : exercise,
        ),
      )

      if (editingSetId === setId) {
        clearEditState()
      }
      hapticDestructive(reducedMotion ?? false)
      showSaveFeedback()
    } catch (error) {
      updateExerciseError(
        exerciseId,
        sanitizeErrorMessage(error instanceof Error ? error.message : t('session.errorDeleteSet')),
      )
    } finally {
      setDeletingSetId(null)
    }
  }

  const handleStartEditSet = (set: WorkoutSetRow) => {
    if (isMutating) return
    const parentExercise = exercises.find((exercise) =>
      exercise.workout_sets.some((row) => row.id === set.id),
    )
    const trackingMode = resolveTrackingModeForExercise(parentExercise)
    setEditingSetId(set.id)
    if (trackingMode === 'weight_reps') {
      setEditDraft({
        ...createEmptySetDraft(),
        reps: Number.isFinite(set.reps) ? String(set.reps) : '',
        weight: String(resolveDisplayWeight(set, units)),
      })
      return
    }

    if (trackingMode === 'reps_only') {
      setEditDraft({
        ...createEmptySetDraft(),
        reps: Number.isFinite(set.reps) ? String(set.reps) : '',
      })
      return
    }

    if (trackingMode === 'time') {
      setEditDraft({
        ...createEmptySetDraft(),
        duration: formatDurationInput(set.duration_seconds),
      })
      return
    }

    setEditDraft({
      ...createEmptySetDraft(),
      duration: formatDurationInput(set.duration_seconds),
      distance: formatDistanceLabel(set.distance_m, units),
    })
  }

  const handleCancelEditSet = () => {
    clearEditState()
  }

  const handleSaveEditSet = async (exerciseId: string, setId: string) => {
    const targetExercise = exercises.find((exercise) => exercise.id === exerciseId)
    const targetSet = targetExercise?.workout_sets.find((set) => set.id === setId)
    if (!targetSet) {
      updateExerciseError(exerciseId, t('session.errorUpdateSet'))
      return
    }

    const trackingMode = resolveTrackingModeForExerciseId(exerciseId)
    const repsValue = Number.parseInt(editDraft.reps, 10)
    const weightValue = Number.parseFloat(editDraft.weight.replace(',', '.'))
    const durationValue = parseDurationInput(editDraft.duration)
    const distanceValue = parseDistanceInput(editDraft.distance, units)

    let payload: {
      trackingMode: ExerciseTrackingMode
      reps?: number | null
      weight?: number | null
      weight_kg?: number | null
      duration_seconds?: number | null
      distance_m?: number | null
      set_type?: WorkoutSetType | null
      rir?: number | null
    } | null = null

    if (trackingMode === 'weight_reps') {
      if (!Number.isFinite(repsValue) || repsValue < REPS_MIN || repsValue > REPS_MAX) {
        updateExerciseError(exerciseId, t('session.errorReps', { min: REPS_MIN, max: REPS_MAX }))
        return
      }

      if (!Number.isFinite(weightValue) || weightValue < WEIGHT_MIN || weightValue > WEIGHT_MAX) {
        updateExerciseError(
          exerciseId,
          t('session.errorWeight', { min: WEIGHT_MIN, max: WEIGHT_MAX }),
        )
        return
      }

      payload = {
        trackingMode,
        reps: repsValue,
        weight: weightValue,
      }
    } else if (trackingMode === 'reps_only') {
      if (!Number.isFinite(repsValue) || repsValue < REPS_MIN || repsValue > REPS_MAX) {
        updateExerciseError(exerciseId, t('session.errorReps', { min: REPS_MIN, max: REPS_MAX }))
        return
      }

      payload = {
        trackingMode,
        reps: repsValue,
        weight: null,
        weight_kg: null,
        duration_seconds: null,
        distance_m: null,
      }
    } else if (trackingMode === 'time') {
      if (durationValue === null || durationValue <= 0) {
        updateExerciseError(exerciseId, t('session.errorDuration'))
        return
      }

      payload = {
        trackingMode,
        reps: null,
        weight: null,
        weight_kg: null,
        duration_seconds: durationValue,
        distance_m: null,
      }
    } else {
      if (durationValue === null || durationValue <= 0) {
        updateExerciseError(exerciseId, t('session.errorDuration'))
        return
      }

      if (distanceValue === null || distanceValue <= 0) {
        updateExerciseError(exerciseId, t('session.errorDistance'))
        return
      }

      payload = {
        trackingMode,
        reps: null,
        weight: null,
        weight_kg: null,
        duration_seconds: durationValue,
        distance_m: distanceValue,
      }
    }

    // set_type and rir are not persisted to DB; kept in local/projection only
    setUpdatingSetId(setId)
    updateExerciseError(exerciseId, null)
    try {
      const { data, error } = await workoutSessionData.updateSet(setId, payload, units)

      if (error || !data) {
        updateExerciseError(
          exerciseId,
          sanitizeErrorMessage(error?.message ?? t('session.errorUpdateSet')),
        )
        return
      }

      setExercises((prev) =>
        prev.map((exercise) =>
          exercise.id === exerciseId
            ? {
                ...exercise,
                workout_sets: exercise.workout_sets.map((s) => (s.id === setId ? data : s)),
              }
            : exercise,
        ),
      )

      clearEditState()
      showSaveFeedback()
    } catch (error) {
      updateExerciseError(
        exerciseId,
        sanitizeErrorMessage(error instanceof Error ? error.message : t('session.errorUpdateSet')),
      )
    } finally {
      setUpdatingSetId(null)
    }
  }

  const handleOpenSetAdvanced = (exerciseId: string, set: WorkoutSetRow) => {
    setAdvancedSetDraft({
      exerciseId,
      setId: set.id,
      setType: normalizeWorkoutSetType(set.set_type),
      rir: normalizeRir(set.rir),
    })
  }

  const handleAdjustAdvancedRir = (delta: number) => {
    setAdvancedSetDraft((prev) => {
      if (!prev) return prev
      const nextRir = Math.max(0, Math.min(10, prev.rir + delta))
      return {
        ...prev,
        rir: nextRir,
        setType: nextRir === 0 ? 'failure' : prev.setType,
      }
    })
  }

  const handleToggleAdvancedFailure = () => {
    setAdvancedSetDraft((prev) => {
      if (!prev) return prev
      const isFailure = prev.setType === 'failure' || prev.rir === 0
      if (isFailure) {
        return {
          ...prev,
          setType: 'normal',
          rir: 1,
        }
      }
      return {
        ...prev,
        setType: 'failure',
        rir: 0,
      }
    })
  }

  const handleSelectAdvancedSetType = (setType: WorkoutSetType) => {
    setAdvancedSetDraft((prev) => {
      if (!prev) return prev
      if (setType === 'failure') {
        return { ...prev, setType, rir: 0 }
      }
      return {
        ...prev,
        setType,
        rir: prev.rir === 0 ? 1 : prev.rir,
      }
    })
  }

  const handleSaveSetAdvanced = async () => {
    if (!advancedSetDraft) return

    const targetExercise = exercises.find((exercise) => exercise.id === advancedSetDraft.exerciseId)
    const targetSet = targetExercise?.workout_sets.find((set) => set.id === advancedSetDraft.setId)
    if (!targetExercise || !targetSet) {
      setAdvancedSetDraft(null)
      return
    }

    const trackingMode = resolveTrackingModeForExercise(targetExercise)
    setUpdatingSetId(advancedSetDraft.setId)
    updateExerciseError(advancedSetDraft.exerciseId, null)
    try {
      const { data, error } = await workoutSessionData.updateSet(
        advancedSetDraft.setId,
        {
          trackingMode,
          reps: targetSet.reps ?? null,
          weight: targetSet.weight ?? null,
          weight_kg: targetSet.weight_kg ?? null,
          duration_seconds: targetSet.duration_seconds ?? null,
          distance_m: targetSet.distance_m ?? null,
        },
        units,
      )

      if (error || !data) {
        updateExerciseError(
          advancedSetDraft.exerciseId,
          sanitizeErrorMessage(error?.message ?? t('session.errorUpdateSet')),
        )
        return
      }

      setExercises((prev) =>
        prev.map((exercise) =>
          exercise.id === advancedSetDraft.exerciseId
            ? {
                ...exercise,
                workout_sets: exercise.workout_sets.map((set) =>
                  set.id === advancedSetDraft.setId ? data : set,
                ),
              }
            : exercise,
        ),
      )
      setAdvancedSetDraft(null)
      showSaveFeedback()
    } catch (error) {
      updateExerciseError(
        advancedSetDraft.exerciseId,
        sanitizeErrorMessage(error instanceof Error ? error.message : t('session.errorUpdateSet')),
      )
    } finally {
      setUpdatingSetId(null)
    }
  }

  const handlePauseResumeRestTimer = () => {
    setRestTimer((prev) => {
      if (!prev) return prev
      if (prev.isRunning) {
        setWorkoutMode('PAUSED')
        return pauseRestTimer(prev)
      }
      setWorkoutMode('REST')
      return resumeRestTimer(prev)
    })
  }

  const handleAddRestTime = () => {
    setRestTimer((prev) => (prev ? addRestTimerSeconds(prev, 15) : prev))
  }

  const handleSubtractRestTime = () => {
    setRestTimer((prev) => (prev ? subtractRestTimerSeconds(prev, 15) : prev))
  }

  const handleSkipRestTimer = () => {
    setRestTimer((prev) => (prev ? skipRestTimer(prev) : prev))
    openNextUpState(restSourceExerciseId)
  }

  const handleContinueFromNextUp = () => {
    if (nextUpPreview?.exerciseId) {
      animateNextLayout()
      setExpandedExerciseId(nextUpPreview.exerciseId)
    }
    resetRestModeState()
  }

  // ─── Session handlers ───────────────────────────────────────────────

  const handleCancelWorkout = async () => {
    if (!workoutId || isCancelling) return

    setIsCancelling(true)
    setCancelError(null)
    try {
      const { error } = await workoutSessionData.cancelWorkout()
      if (error) {
        setCancelError(sanitizeErrorMessage(error.message ?? t('session.errorCancelWorkout')))
        return
      }

      setIsCancelModalVisible(false)
      router.replace('/(app)/(tabs)/workout')
    } catch (error) {
      setCancelError(
        sanitizeErrorMessage(
          error instanceof Error ? error.message : t('session.errorCancelWorkout'),
        ),
      )
    } finally {
      setIsCancelling(false)
    }
  }

  const buildFinishCapturePayload = useCallback(
    (request: WorkoutFinishRequest) => {
      const payload: Record<string, number | string | boolean> = {
        workout_id: workoutId ?? '',
        exercise_count: exercises.length,
        set_count: exercises.reduce((sum, ex) => sum + ex.workout_sets.length, 0),
        duration_seconds: elapsedSecondsRef.current,
      }

      if (request.mode === 'meta') {
        payload.has_effort_rating = finishEffortRating !== null
        payload.has_session_note = finishSessionNote.trim().length > 0
      }

      return payload
    },
    [exercises, finishEffortRating, finishSessionNote, workoutId],
  )

  const completeRemoteFinishSuccess = useCallback(
    (request: WorkoutFinishRequest) => {
      capture('workout_finished', buildFinishCapturePayload(request))

      const userId = user?.id
      if (userId) {
        InteractionManager.runAfterInteractions(() => {
          void handleTrophyEvent(
            { type: 'WORKOUT_COMPLETED', at: new Date().toISOString() },
            userId,
          )
            .then((ids) => {
              ids.forEach((id) => enqueueToast(id))
            })
            .catch(() => {
              // never crash
            })
        })
      }

      hapticSuccess(reducedMotion ?? false)
      void queryClient.invalidateQueries({ queryKey: ['analytics'] })
      setFinishError(null)
      setFinishQueuedDetail(null)
      setCelebrationShareError(null)
      setIsFinishModalVisible(false)
      // Defer celebration state until the FinishModal dismiss animation completes.
      // On iOS, presenting a fullscreen Modal while a transparent Modal is still
      // animating out causes a native layering conflict that results in a black screen.
      InteractionManager.runAfterInteractions(() => {
        setShouldAutoShareOnSuccess(request.shareAfterFinish)
        setFinishFlowState('success')
      })
    },
    [buildFinishCapturePayload, queryClient, reducedMotion, user?.id],
  )

  const submitFinishRequest = useCallback(
    async (request: WorkoutFinishRequest) => {
      if (!workoutId || isFinishing) return

      const parsedExistingNotes = parseWorkoutMetaNotes(sessionNotes)
      const notes = parsedExistingNotes.remainingNotes
      const sessionNote = finishSessionNote.trim()

      setPendingFinishRequest(request)
      setFinishError(null)
      setFinishQueuedDetail(null)
      setCelebrationShareError(null)
      setFinishFlowState('saving')

      try {
        const result = await withTimeout(
          request.mode === 'meta'
            ? workoutSessionData.finishWorkoutWithMeta({
                notes,
                effort_rating: finishEffortRating,
                session_note: sessionNote.length > 0 ? sessionNote : null,
              })
            : workoutSessionData.finishWorkout(),
          FINISH_WORKOUT_TIMEOUT_MS,
        )

        if (result.error) {
          setFinishError(
            sanitizeErrorMessage(result.error.message ?? t('session.errorFinishWorkout')),
          )
          setFinishFlowState('error')
          return
        }

        if (result.persistence === 'queued') {
          capture('workout_finish_queued', buildFinishCapturePayload(request))
          triggerGentleHaptic({ reducedMotion })
          setFinishFlowState('queued')
          return
        }

        completeRemoteFinishSuccess(request)
      } catch (error) {
        setFinishError(
          sanitizeErrorMessage(
            error instanceof Error ? error.message : t('session.errorFinishWorkout'),
          ),
        )
        setFinishFlowState('error')
      }
    },
    [
      buildFinishCapturePayload,
      completeRemoteFinishSuccess,
      finishEffortRating,
      finishSessionNote,
      isFinishing,
      reducedMotion,
      sessionNotes,
      t,
      workoutId,
      workoutSessionData,
    ],
  )

  const handleFinishWorkout = async (shareAfterFinish = false) => {
    await submitFinishRequest({ mode: 'plain', shareAfterFinish })
  }

  const handleFinishWorkoutWithMeta = async (shareAfterFinish = false) => {
    await submitFinishRequest({ mode: 'meta', shareAfterFinish })
  }

  const handleRetryFinish = async () => {
    if (!pendingFinishRequest) return
    await submitFinishRequest(pendingFinishRequest)
  }

  const handleRetryFinishSync = useCallback(async () => {
    if (!user?.id || !workoutId || !pendingFinishRequest) return

    setFinishError(null)
    setFinishQueuedDetail(null)
    setFinishFlowState('saving')

    try {
      await withTimeout(sync.refresh(), FINISH_WORKOUT_TIMEOUT_MS)

      const outboxState = await loadOutboxState(user.id)
      const hasPendingFinish = outboxState.events.some(
        (event) =>
          event.entity_client_uuid === workoutId && FINISH_OUTBOX_EVENT_TYPES.has(event.type),
      )

      if (!hasPendingFinish) {
        const remoteResponse = await withTimeout(
          fetchWorkoutDetail(workoutId),
          FINISH_WORKOUT_TIMEOUT_MS,
        )
        if (
          !remoteResponse.error &&
          remoteResponse.data?.status === 'completed' &&
          remoteResponse.data.ended_at
        ) {
          completeRemoteFinishSuccess(pendingFinishRequest)
          return
        }
      }

      setFinishQueuedDetail(t('session.finishQueuedStillPending'))
      setFinishFlowState('queued')
    } catch (error) {
      setFinishQueuedDetail(
        sanitizeErrorMessage(error instanceof Error ? error.message : t('session.syncDelayed')),
      )
      setFinishFlowState('queued')
    }
  }, [completeRemoteFinishSuccess, pendingFinishRequest, sync, t, user?.id, workoutId])

  const handleContinueAfterQueuedFinish = () => {
    setIsFinishModalVisible(false)
    setFinishError(null)
    setFinishQueuedDetail(null)
    setCelebrationShareError(null)
    setPendingFinishRequest(null)
    setShouldAutoShareOnSuccess(false)
    setFinishFlowState('confirm')
    router.replace('/(app)/(tabs)/workout')
  }

  const handleDismissCelebration = () => {
    setCelebrationShareError(null)
    setPendingFinishRequest(null)
    setShouldAutoShareOnSuccess(false)
    setFinishFlowState('confirm')
    router.replace('/(app)/(tabs)/workout')
  }

  const handleShareFromCelebration = async () => {
    await handleShareWorkoutSummary()
  }

  return {
    t,
    router,
    user,
    exercises,
    units,
    sessionStartedAt,
    sessionNotes,
    sessionRoutineName,
    reloadTick,
    isLoading,
    loadError,
    isAddingExercise,
    addExerciseError,
    setDrafts,
    cueDrafts,
    exerciseDefaultsByDefinitionId,
    lastTimeSummaryByDefinitionId,
    lastPerformanceByDefinitionId,
    lastCompletedSetByExercise,
    savingSetId,
    savingCueExerciseId,
    deletingSetId,
    deletingExerciseId,
    updatingSetId,
    editingSetId,
    editDraft,
    restTimer,
    workoutMode,
    restSourceExerciseId,
    nextUpPreview,
    isRestModalExpanded,
    advancedSetDraft,
    isFinishing,
    isCancelling,
    finishEffortRating,
    finishSessionNote,
    defaultsExerciseContext,
    defaultSetsDraft,
    defaultRepsDraft,
    isSavingDefaults,
    defaultsError,
    exerciseErrors,
    finishFlowState,
    finishError,
    finishQueuedDetail,
    cancelError,
    isSharing,
    celebrationShareError,
    programContext,
    exerciseDetail,
    favoriteExerciseIds,
    prExerciseIds,
    saveFeedback,
    expandedExerciseId,
    reducedMotion,
    tickScale,
    shareCardSvgRef,
    isExerciseModalVisible,
    isCancelModalVisible,
    isFinishModalVisible,
    isDefaultsModalVisible,
    isSessionLocked,
    isMutating,
    exerciseCountLabel,
    nextOrderIndex,
    programTargetByDefinitionId,
    progressionSuggestionByDefinitionId,
    shareData,
    sessionStats,
    sessionProgress,
    coachingLabel,
    restTimerTotalSeconds: restTimerSeconds,
    setReloadTick,
    setIsExerciseModalVisible,
    setIsCancelModalVisible,
    setIsFinishModalVisible,
    setIsDefaultsModalVisible,
    setEditDraft,
    setIsRestModalExpanded,
    setAdvancedSetDraft,
    setFinishEffortRating,
    setFinishSessionNote,
    setDefaultSetsDraft,
    setDefaultRepsDraft,
    setExerciseDetail,
    resolveTrackingModeForExercise,
    resolveDraftForExercise,
    updateDraft,
    handlePauseResumeRestTimer,
    handleAddRestTime,
    handleSubtractRestTime,
    handleSkipRestTimer,
    handleContinueFromNextUp,
    handleToggleExercise,
    handleAddExercise,
    handleDeleteExercise,
    handleExerciseActions,
    handleOpenSetAdvanced,
    handleAdjustAdvancedRir,
    handleToggleAdvancedFailure,
    handleSelectAdvancedSetType,
    handleSaveSetAdvanced,
    handleStartEditSet,
    handleCancelEditSet,
    handleSaveEditSet,
    handleAddSet,
    handleDecrementReps,
    handleDecrementWeight,
    handleIncrementReps,
    handleIncrementWeight,
    handleCopyLast,
    handleDeleteSet,
    handleCueChange,
    handleCueBlur,
    handleSaveExerciseDefaults,
    handleCancelWorkout,
    openFinishModal,
    closeFinishModal,
    handleFinishWorkout,
    handleFinishWorkoutWithMeta,
    handleRetryFinish,
    handleRetryFinishSync,
    handleContinueAfterQueuedFinish,
    handleToggleExerciseFavorite,
    showCelebration,
    handleDismissCelebration,
    handleShareFromCelebration,
  }
}

export type WorkoutSessionController = ReturnType<typeof useWorkoutSessionController>
