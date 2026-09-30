import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  ActionSheetIOS,
  Alert,
  InteractionManager,
  Modal,
  Platform,
  StyleSheet,
  View,
} from 'react-native'
import type Svg from 'react-native-svg'
import { useLocalSearchParams } from 'expo-router'
import {
  Screen,
  Box,
  Text,
  Card,
  Button,
  Input,
  ListRow,
  SectionHeader,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../../src/components/ui'
import {
  type ExerciseTrackingMode,
  fetchCompletedWorkoutDates,
  fetchLastExercisePerformance,
  fetchWorkoutDetail,
  updateWorkoutSessionDate,
  type WorkoutDetail,
} from '../../../src/db/workouts'
import { useAuth } from '../../../src/auth/useAuth'
import { useI18n } from '../../../src/i18n/useI18n'
import {
  getEffortLabel,
  parseWorkoutMetaNotes,
} from '../../../src/features/workoutSession/workoutMeta'
import { upsertRoutine, type Routine, type RoutineSection } from '../../../src/lib/routines'
import { toCloudRoutinePayload } from '../../../src/db/routineCloudPayload'
import { upsertCloudRoutineWithItems } from '../../../src/db/routinesPlans'
import { loadProfilePreferences, type UnitsPreference } from '../../../src/lib/profilePreferences'
import { formatSetSummary, resolveDisplayWeight } from '../../../src/lib/units'
import { colors, radius, spacing } from '../../../src/theme'
import { sanitizeErrorMessage } from '../../../src/utils/errorMessages'
import { capture } from '../../../src/analytics/posthogClient'
import { WorkoutShareCardSvg } from '../../../src/components/share/WorkoutShareCardSvg'
import {
  buildWorkoutShareData,
  buildWorkoutShareFallbackText,
} from '../../../src/features/share/buildWorkoutShareData'
import {
  captureSvgToPngBase64,
  shareWorkoutCard,
} from '../../../src/features/share/shareWorkoutCard'
import { computeE1RM, computeStreak } from '../../../src/features/progress/compute'
import { SyncStatusPill } from '../../../src/components/sync/SyncStatusPill'
import { generateUuid } from '../../../src/lib/ids'
import {
  distanceUnitForPreference,
  formatDistanceLabel,
  formatDurationLabel,
  formatPaceLabel,
} from '../../../src/features/workoutSession/setMetrics'
import { withTimeout } from '../../../src/lib/withTimeout'

const SHARE_STREAK_FETCH_TIMEOUT_MS = 10_000

function generateRoutineId(): string {
  return generateUuid()
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

function inferRoutineSection(category: string | null | undefined): RoutineSection {
  if (category === 'warmup') return 'warmup'
  if (category === 'stretch') return 'cooldown'
  return 'main'
}

export default function WorkoutDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>()
  const workoutId = Array.isArray(params.id) ? params.id[0] : params.id
  const { user } = useAuth()
  const { t } = useI18n()

  const [workout, setWorkout] = useState<WorkoutDetail | null>(null)
  const [units, setUnits] = useState<UnitsPreference>('kg')
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdatingDate, setIsUpdatingDate] = useState(false)
  const [isSavingRoutine, setIsSavingRoutine] = useState(false)
  const [isEditDateModalVisible, setIsEditDateModalVisible] = useState(false)
  const [isSaveRoutineModalVisible, setIsSaveRoutineModalVisible] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [dateDraft, setDateDraft] = useState('')
  const [routineNameDraft, setRoutineNameDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [previousBestE1rmByDefinitionId, setPreviousBestE1rmByDefinitionId] = useState<
    Record<string, number | null>
  >({})
  const shareCardSvgRef = useRef<Svg | null>(null)

  useEffect(() => {
    const loadWorkout = async () => {
      if (!workoutId) {
        setError(t('detail.notFound'))
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)
      const [{ data, error }, preferences] = await Promise.all([
        fetchWorkoutDetail(workoutId),
        loadProfilePreferences(),
      ])
      if (error || !data) {
        setError(sanitizeErrorMessage(error?.message ?? t('detail.errorLoad')))
        setWorkout(null)
        setPreviousBestE1rmByDefinitionId({})
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
        setWorkout({ ...data, workout_exercises: normalized })
        setUnits(preferences.units)
      }
      setIsLoading(false)
    }

    loadWorkout()
  }, [t, workoutId])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void loadProfilePreferences().then((preferences) => {
        if (!cancelled) {
          setUnits(preferences.units)
        }
      })

      return () => {
        cancelled = true
      }
    }, []),
  )

  useEffect(() => {
    if (!workout?.id) {
      setPreviousBestE1rmByDefinitionId({})
      return
    }

    const uniqueDefinitionIds = Array.from(
      new Set(
        workout.workout_exercises
          .map((exercise) => exercise.exercise_definition_id)
          .filter((id): id is string => Boolean(id)),
      ),
    )

    if (uniqueDefinitionIds.length === 0) {
      setPreviousBestE1rmByDefinitionId({})
      return
    }

    let cancelled = false

    const loadPreviousBestByExercise = async () => {
      const responses = await Promise.all(
        uniqueDefinitionIds.map((definitionId) =>
          fetchLastExercisePerformance(user?.id ?? '', definitionId, workout.id),
        ),
      )
      if (cancelled) return

      const next: Record<string, number | null> = {}
      uniqueDefinitionIds.forEach((definitionId, index) => {
        const response = responses[index]
        if (response.error || !response.data) {
          next[definitionId] = null
          return
        }

        const bestE1rmKg = response.data.sets.reduce((best, set) => {
          const e1rm = computeE1RM(Number(set.weight_kg), set.reps)
          return Number.isFinite(e1rm) ? Math.max(best, e1rm) : best
        }, 0)

        next[definitionId] = bestE1rmKg > 0 ? bestE1rmKg : null
      })

      setPreviousBestE1rmByDefinitionId(next)
    }

    void loadPreviousBestByExercise()

    return () => {
      cancelled = true
    }
  }, [user?.id, workout])

  const getDisplayDateISO = (targetWorkout: WorkoutDetail | null): string | null => {
    if (!targetWorkout) return null
    return targetWorkout.started_at ?? targetWorkout.ended_at ?? targetWorkout.created_at ?? null
  }

  const getDateWithPreservedTime = (targetDate: Date): Date => {
    const sourceISO = getDisplayDateISO(workout)
    const sourceDate = sourceISO ? new Date(sourceISO) : new Date()
    const nextDate = new Date(targetDate)
    nextDate.setHours(
      sourceDate.getHours(),
      sourceDate.getMinutes(),
      sourceDate.getSeconds(),
      sourceDate.getMilliseconds(),
    )
    return nextDate
  }

  const handleUpdateSessionDate = async (targetDate: Date) => {
    if (!workoutId || !workout) return

    const nextDate = getDateWithPreservedTime(targetDate)
    setIsUpdatingDate(true)
    setError(null)
    const { data, error: updateError } = await updateWorkoutSessionDate({
      workoutId,
      newDateISO: nextDate.toISOString(),
      currentStartedAt: workout.started_at,
      currentEndedAt: workout.ended_at,
    })
    if (updateError || !data) {
      setError(sanitizeErrorMessage(updateError?.message ?? t('detail.errorUpdateDate')))
      setIsUpdatingDate(false)
      return
    }

    setWorkout((prev) =>
      prev
        ? {
            ...prev,
            started_at: data.started_at ?? prev.started_at,
            ended_at: data.ended_at ?? prev.ended_at,
          }
        : prev,
    )
    setIsEditDateModalVisible(false)
    setIsUpdatingDate(false)
  }

  const handleEditDatePress = () => {
    if (!workout) return

    const currentISO = getDisplayDateISO(workout)
    setDateDraft(toDateInputValue(currentISO ? new Date(currentISO) : new Date()))

    if (Platform.OS !== 'ios') {
      setIsEditDateModalVisible(true)
      return
    }

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          t('detail.today'),
          t('detail.yesterday'),
          t('detail.pickDate'),
          t('common.cancel'),
        ],
        cancelButtonIndex: 3,
      },
      (buttonIndex) => {
        if (buttonIndex === 0) {
          void handleUpdateSessionDate(new Date())
          return
        }
        if (buttonIndex === 1) {
          const yesterday = new Date()
          yesterday.setDate(yesterday.getDate() - 1)
          void handleUpdateSessionDate(yesterday)
          return
        }
        if (buttonIndex === 2) {
          setIsEditDateModalVisible(true)
        }
      },
    )
  }

  const formatDate = (iso?: string | null) => {
    if (!iso) return t('detail.unknownDate')
    const date = new Date(iso)
    return date.toLocaleDateString()
  }

  const formatTime = (iso?: string | null) => {
    if (!iso) return ''
    const date = new Date(iso)
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const toDateInputValue = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const parseDateInput = (value: string): Date | null => {
    const trimmed = value.trim()
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null

    const year = Number.parseInt(match[1], 10)
    const month = Number.parseInt(match[2], 10)
    const day = Number.parseInt(match[3], 10)

    const parsed = new Date(year, month - 1, day)
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      return null
    }
    return parsed
  }

  const shareData = useMemo(() => {
    if (!workout) return null

    const performedAt =
      workout.started_at ?? workout.ended_at ?? workout.created_at ?? new Date().toISOString()
    const endedAt = workout.ended_at ?? performedAt

    return buildWorkoutShareData({
      workoutId: workout.id,
      title: t('share.title'),
      performedAt,
      performedDateLabel: new Date(performedAt).toLocaleDateString(),
      startedAt: workout.started_at ?? performedAt,
      endedAt,
      units,
      exercises: workout.workout_exercises.map((exercise) => ({
        exerciseDefinitionId: exercise.exercise_definition_id,
        exerciseName: exercise.exercise_definition?.name ?? t('detail.exercise'),
        previousBestE1rmKg: previousBestE1rmByDefinitionId[exercise.exercise_definition_id] ?? null,
        sets: exercise.workout_sets.map((set) => ({
          reps: set.reps ?? 0,
          weight: resolveDisplayWeight(set, units),
          weightKg: set.weight_kg,
          isWeightCanonical: set.is_weight_canonical,
        })),
      })),
    })
  }, [previousBestE1rmByDefinitionId, t, units, workout])

  const handleShareWorkout = async () => {
    if (!shareData || isSharing) return

    setIsSharing(true)
    setError(null)
    capture('share_attempt', { source: 'workout_detail' })

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
            .map((entry) => {
              const performedAt = entry.started_at ?? entry.ended_at ?? entry.created_at
              if (!performedAt) return null
              return {
                id: entry.id,
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
        cacheKey: `detail_${finalShareData.workoutId}_${finalShareData.setCount}_${units}`,
        fallbackText,
        renderImageBase64: () => captureSvgToPngBase64(shareCardSvgRef.current),
      })

      if (shareResult.shared) {
        capture('share_success', {
          source: 'workout_detail',
          used_image: shareResult.usedImage,
        })
        return
      }

      setError(t('share.failed'))
    } finally {
      setIsSharing(false)
    }
  }

  const getDefaultRoutineName = (): string => {
    const muscleGroups = (workout?.workout_exercises ?? [])
      .map((exercise) => exercise.exercise_definition?.muscle_group?.toLowerCase().trim() ?? '')
      .filter((group) => group.length > 0)

    const legMovements = muscleGroups.filter((group) => group === 'legs').length
    if (legMovements >= 2 && legMovements >= Math.ceil(muscleGroups.length / 2)) {
      return t('detail.legDay')
    }

    const iso = getDisplayDateISO(workout)
    if (!iso) return t('detail.defaultRoutineName')
    const date = new Date(iso)
    return t('detail.sessionDate', {
      date: date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    })
  }

  const handleOpenSaveRoutine = () => {
    if (!workout || workout.workout_exercises.length === 0) {
      Alert.alert(t('detail.noExercisesToSaveTitle'), t('detail.noExercisesToSaveBody'))
      return
    }

    setRoutineNameDraft(getDefaultRoutineName())
    setIsSaveRoutineModalVisible(true)
  }

  const handleSaveAsRoutine = async () => {
    if (!workout || isSavingRoutine) return

    if (!user) {
      Alert.alert(t('detail.signInRequired'), t('detail.signInRequiredBody'))
      return
    }

    const trimmedName = routineNameDraft.trim()
    if (!trimmedName) {
      Alert.alert(t('detail.nameRequired'), t('detail.nameRequiredBody'))
      return
    }

    const routineItems = [...workout.workout_exercises]
      .sort((a, b) => a.order_index - b.order_index)
      .map((exercise, orderIndex) => ({
        exerciseDefinitionId: exercise.exercise_definition_id,
        orderIndex,
        section: inferRoutineSection(exercise.exercise_definition?.category),
        defaultSets: null,
        defaultReps: null,
      }))
      .filter((item) => Boolean(item.exerciseDefinitionId))

    if (routineItems.length === 0) {
      Alert.alert(t('detail.noExercisesToSaveTitle'), t('detail.noSavableExercises'))
      return
    }

    setIsSavingRoutine(true)

    const now = new Date().toISOString()
    const routine: Routine = {
      id: generateRoutineId(),
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
      pinned: undefined,
      items: routineItems,
    }

    try {
      await upsertRoutine(user.id, routine)
      const payload = toCloudRoutinePayload(routine)
      const cloudResult = await upsertCloudRoutineWithItems({
        userId: user.id,
        routine: payload.routine,
        items: payload.items,
      })
      if (cloudResult.error) {
        const msg = cloudResult.error.message?.toLowerCase() ?? ''
        if (
          msg.includes('failed to fetch') ||
          msg.includes('network') ||
          msg.includes('offline') ||
          msg.includes('load failed')
        ) {
          Alert.alert(t('detail.routineSaved'), t('routine.new.savedLocallyOffline'))
        } else {
          Alert.alert(t('detail.unableToSave'), sanitizeErrorMessage(cloudResult.error.message))
          return
        }
      }
      setIsSaveRoutineModalVisible(false)
      Alert.alert(t('detail.routineSaved'), t('detail.routineSavedBody'))
    } catch (saveError) {
      Alert.alert(
        t('detail.unableToSave'),
        sanitizeErrorMessage(
          saveError instanceof Error ? saveError.message : t('detail.errorSaveRoutine'),
        ),
      )
    } finally {
      setIsSavingRoutine(false)
    }
  }

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <Box flex={1} justifyContent="center" alignItems="center">
          <LoadingState message={t('detail.loading')} />
        </Box>
      </Screen>
    )
  }

  if (!workout || error) {
    return (
      <Screen scroll={false}>
        <Box flex={1} justifyContent="center" alignItems="center">
          <ErrorState message={error ?? t('detail.notFound')} />
        </Box>
      </Screen>
    )
  }

  const displayDate = workout.started_at ?? workout.ended_at ?? workout.created_at
  const parsedMeta = parseWorkoutMetaNotes(workout.notes)
  const effortRating = workout.effort_rating ?? parsedMeta.effortRating
  const sessionNote = workout.session_note ?? parsedMeta.sessionNote
  const effortLabel = effortRating ? getEffortLabel(effortRating) : null
  const effortSummary = effortRating
    ? effortLabel
      ? `${effortLabel} (${effortRating}/5)`
      : `${effortRating}/10`
    : null

  return (
    <>
      <Screen>
        <SyncStatusPill />
        <Card marginBottom="xl">
          <SectionHeader
            title={t('detail.session')}
            variant="dense"
            actionLabel={isUpdatingDate ? undefined : t('detail.editDate')}
            onActionPress={isUpdatingDate ? undefined : handleEditDatePress}
          />
          <Text variant="bodySm" color="textMuted">
            {formatDate(displayDate)} {displayDate ? `- ${formatTime(displayDate)}` : ''}
          </Text>
          {effortSummary ? (
            <Text marginTop="sm" variant="bodySm" color="textMuted">
              {t('detail.effort', { rating: effortSummary })}
            </Text>
          ) : null}
          {sessionNote ? (
            <Text marginTop="xs" variant="bodySm" color="textMuted">
              {t('detail.note', { note: sessionNote })}
            </Text>
          ) : null}
          <Box marginTop="md" flexDirection="row" gap="sm">
            <Box flex={1}>
              <Button
                title={isSavingRoutine ? t('detail.savingRoutine') : t('detail.saveAsRoutine')}
                variant="secondary"
                loading={isSavingRoutine}
                disabled={isSavingRoutine || isSharing}
                onPress={handleOpenSaveRoutine}
              />
            </Box>
            <Box flex={1}>
              <Button
                title={isSharing ? t('share.sharing') : t('share.action')}
                variant="secondary"
                loading={isSharing}
                disabled={isSharing || isSavingRoutine}
                onPress={() => {
                  void handleShareWorkout()
                }}
              />
            </Box>
          </Box>
        </Card>

        {workout.workout_exercises.length === 0 ? (
          <EmptyState title={t('detail.noExercises')} body={t('detail.noExercisesBody')} />
        ) : (
          workout.workout_exercises.map((exercise) => (
            <Card key={exercise.id} marginBottom="lg">
              <Text variant="h3" marginBottom="sm">
                {exercise.exercise_definition?.name ?? t('detail.exercise')}
              </Text>
              {exercise.workout_sets.length === 0 ? (
                <Text variant="bodySm" color="textMuted">
                  {t('detail.noSets')}
                </Text>
              ) : (
                <Card padding="none">
                  {exercise.workout_sets.map((set) => {
                    const trackingMode = normalizeTrackingMode(
                      exercise.exercise_definition?.tracking_mode,
                    )
                    const value =
                      trackingMode === 'weight_reps'
                        ? formatSetSummary(set.reps ?? 0, resolveDisplayWeight(set, units), units)
                        : trackingMode === 'reps_only'
                          ? String(set.reps ?? 0)
                          : trackingMode === 'time'
                            ? formatDurationLabel(set.duration_seconds)
                            : (() => {
                                const distance = `${formatDistanceLabel(
                                  set.distance_m,
                                  units,
                                )} ${distanceUnitForPreference(units)}`
                                const duration = formatDurationLabel(set.duration_seconds)
                                const pace = formatPaceLabel(
                                  set.distance_m,
                                  set.duration_seconds,
                                  units,
                                )
                                return pace
                                  ? `${distance} · ${duration} · ${pace}`
                                  : `${distance} · ${duration}`
                              })()

                    return (
                      <ListRow
                        key={set.id}
                        label={t('detail.set', { index: String(set.set_index + 1) })}
                        value={value}
                        valueVariant="tabular"
                        showChevron={false}
                      />
                    )
                  })}
                </Card>
              )}
            </Card>
          ))
        )}
      </Screen>

      {shareData ? (
        <View style={styles.hiddenShareCard} pointerEvents="none">
          <WorkoutShareCardSvg
            data={shareData}
            labels={{
              duration: t('share.duration'),
              volume: t('share.volume'),
              streak: t('share.streak'),
              topLifts: t('share.topLifts'),
              prBadge: t('share.prBadge'),
              noTopLifts: t('share.noTopLifts'),
            }}
            svgRef={shareCardSvgRef}
          />
        </View>
      ) : null}

      <Modal
        visible={isEditDateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditDateModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text variant="h3">{t('detail.pickDate')}</Text>
            <Text marginTop="xs" variant="bodySm" color="textMuted">
              {t('detail.pickDateBody')}
            </Text>
            <Box marginTop="md">
              <Input
                value={dateDraft}
                onChangeText={setDateDraft}
                placeholder={t('detail.pickDatePlaceholder')}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                editable={!isUpdatingDate}
              />
            </Box>
            <Box flexDirection="row" gap="sm" marginTop="md">
              <Box flex={1}>
                <Button
                  title={t('common.cancel')}
                  variant="secondary"
                  onPress={() => setIsEditDateModalVisible(false)}
                  disabled={isUpdatingDate}
                />
              </Box>
              <Box flex={1}>
                <Button
                  title={isUpdatingDate ? t('common.saving') : t('common.save')}
                  onPress={() => {
                    const parsed = parseDateInput(dateDraft)
                    if (!parsed) {
                      setError(t('detail.pickDateInvalid'))
                      return
                    }
                    void handleUpdateSessionDate(parsed)
                  }}
                  loading={isUpdatingDate}
                  disabled={isUpdatingDate}
                />
              </Box>
            </Box>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isSaveRoutineModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSaveRoutineModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text variant="h3">{t('detail.saveAsRoutine')}</Text>
            <Text marginTop="xs" variant="bodySm" color="textMuted">
              {t('detail.saveRoutineBody')}
            </Text>
            <Box marginTop="md">
              <Input
                value={routineNameDraft}
                onChangeText={setRoutineNameDraft}
                placeholder={t('detail.saveRoutineName')}
                autoCapitalize="words"
                editable={!isSavingRoutine}
              />
            </Box>
            <Box flexDirection="row" gap="sm" marginTop="md">
              <Box flex={1}>
                <Button
                  title={t('common.cancel')}
                  variant="secondary"
                  onPress={() => setIsSaveRoutineModalVisible(false)}
                  disabled={isSavingRoutine}
                />
              </Box>
              <Box flex={1}>
                <Button
                  title={isSavingRoutine ? t('common.saving') : t('common.save')}
                  onPress={() => {
                    void handleSaveAsRoutine()
                  }}
                  loading={isSavingRoutine}
                  disabled={isSavingRoutine}
                />
              </Box>
            </Box>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: 'flex-end',
  },
  card: {
    marginHorizontal: spacing[5],
    marginBottom: spacing[8],
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  hiddenShareCard: {
    position: 'absolute',
    top: -3000,
    left: -3000,
    opacity: 0,
  },
})
