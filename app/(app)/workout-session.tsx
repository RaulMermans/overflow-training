import { useEffect, useRef, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import type { TranslationKey } from '../../src/i18n'
import {
  Box,
  BottomCTA,
  Button,
  ErrorState,
  Input,
  Pressable,
  Screen,
  Text,
} from '../../src/components/ui'
import { ExerciseBlock } from '../../src/components/workout-session'
import { ExerciseDetailSheet } from '../../src/components/exercises/ExerciseDetailSheet'
import ExerciseSearch from '../../src/components/ui/ExerciseSearch'
import { WorkoutShareCardSvg } from '../../src/components/share/WorkoutShareCardSvg'
import type { ExerciseDefinitionRow, WorkoutSetType } from '../../src/db/workouts'
import { EXERCISE_DEFAULTS_LIMITS } from '../../src/lib/exerciseDefaults'
import { colors, radius, spacing } from '../../src/theme'
import { getEffortLabel } from '../../src/features/workoutSession/workoutMeta'
import { convertWeightBetweenUnits } from '../../src/lib/units'
import {
  MilestoneToast,
  WorkoutSessionExerciseList,
  WorkoutSessionFinishModal,
  WorkoutSessionHeader,
  WorkoutSessionRestTimerUI,
} from '../../src/features/workoutSession/components'
import { useWorkoutSessionController } from '../../src/features/workoutSession/controller/useWorkoutSessionController'
import { useSyncStatus } from '../../src/features/sync/useSyncStatus'
import { WorkoutCompleteCelebration } from '../../src/features/workoutSession/components/WorkoutCompleteCelebration'
import { useMilestoneDetection } from '../../src/features/workoutSession/useMilestoneDetection'

const WORKOUT_SET_TYPE_OPTIONS: WorkoutSetType[] = ['normal', 'warmup', 'drop', 'failure']

export default function WorkoutSessionScreen() {
  const params = useLocalSearchParams<{ workoutId?: string | string[] }>()
  const workoutId = Array.isArray(params.workoutId) ? params.workoutId[0] : params.workoutId
  const { lastOutboxBlocked, refresh } = useSyncStatus()
  const [footerHeight, setFooterHeight] = useState<number>(spacing[10])
  const scrollViewRef = useRef<ScrollView>(null)
  const exerciseLayoutsRef = useRef<Record<string, number>>({})

  const {
    t,
    router,
    user,
    exercises,
    units,
    sessionStartedAt,
    sessionRoutineName,
    isLoading,
    loadError,
    addExerciseError,
    exerciseDefaultsByDefinitionId,
    lastTimeSummaryByDefinitionId,
    cueDrafts,
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
    nextUpPreview,
    isRestModalExpanded,
    advancedSetDraft,
    isFinishing,
    isCancelling,
    finishFlowState,
    finishEffortRating,
    finishSessionNote,
    defaultsExerciseContext,
    defaultSetsDraft,
    defaultRepsDraft,
    isSavingDefaults,
    defaultsError,
    exerciseErrors,
    finishError,
    finishQueuedDetail,
    cancelError,
    isSharing,
    celebrationShareError,
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
    programTargetByDefinitionId,
    progressionSuggestionByDefinitionId,
    shareData,
    sessionStats,
    sessionProgress,
    coachingLabel,
    restTimerTotalSeconds,
    setReloadTick,
    setIsExerciseModalVisible,
    setIsCancelModalVisible,
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
  } = useWorkoutSessionController(workoutId)

  const finishModalState =
    finishFlowState === 'saving'
      ? 'saving'
      : finishFlowState === 'error'
        ? 'error'
        : finishFlowState === 'queued'
          ? 'queued'
          : 'confirm'

  const { currentMilestone } = useMilestoneDetection({
    exercises,
    totalSets: sessionStats.sets,
    prExerciseIds,
    exerciseDefaultsByDefinitionId,
  })

  const milestoneLabel = currentMilestone
    ? currentMilestone.type === 'first_set'
      ? t('session.milestoneFirstSet')
      : currentMilestone.type === 'halfway'
        ? t('session.milestoneHalfway')
        : currentMilestone.type === 'final_exercise'
          ? t('session.milestoneFinalExercise')
          : t('session.milestonePR')
    : ''

  const milestoneMessage = currentMilestone
    ? currentMilestone.type === 'first_set'
      ? t('session.milestoneFirstSetMessage')
      : currentMilestone.type === 'halfway'
        ? t('session.milestoneHalfwayMessage')
        : currentMilestone.type === 'final_exercise'
          ? t('session.milestoneFinalExerciseMessage')
          : t('session.milestonePRMessage', { exercise: currentMilestone.exerciseName ?? '' })
    : ''

  // Auto-scroll to active exercise when it changes
  useEffect(() => {
    if (expandedExerciseId && scrollViewRef.current) {
      const y = exerciseLayoutsRef.current[expandedExerciseId]
      if (y != null) {
        scrollViewRef.current.scrollTo({ y, animated: true })
      }
    }
  }, [expandedExerciseId])

  // ─── Early returns ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Screen scroll={false} horizontalPadding="none" bottomPadding="none">
        <Box flex={1} justifyContent="center" alignItems="center">
          <ActivityIndicator size="large" color={colors.accent.primary} />
        </Box>
      </Screen>
    )
  }

  if (!workoutId) {
    return (
      <Screen scroll={false} horizontalPadding="none" bottomPadding="none">
        <Box paddingHorizontal="xl" paddingTop="2xl">
          <ErrorState message={t('session.notFound')} />
        </Box>
      </Screen>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <Screen scroll={false} horizontalPadding="none" bottomPadding="none">
      <KeyboardAvoidingView
        testID="workoutSession:root"
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <WorkoutSessionHeader
          title={t('session.title')}
          subtitle={exerciseCountLabel}
          sessionStartedAt={sessionStartedAt}
          routineLabel={
            sessionRoutineName ? t('session.fromRoutine', { routine: sessionRoutineName }) : null
          }
          saveFeedbackLabel={
            saveFeedback
              ? saveFeedback === 'saved'
                ? t('session.saved')
                : t('session.savedLocal')
              : null
          }
          statsSetsLabel={t('session.statsSets', { count: String(sessionStats.sets) })}
          statsVolumeLabel={t('session.statsVolume', {
            value: String(
              Math.round(
                units === 'lb'
                  ? convertWeightBetweenUnits(sessionStats.volumeKg, 'kg', 'lb')
                  : sessionStats.volumeKg,
              ),
            ),
            unit: units,
          })}
          progressLabel={t('session.progressLabel', {
            current: String(sessionProgress.completedExercises),
            total: String(sessionProgress.totalExercises),
          })}
          progressPercent={sessionProgress.percent}
          coachingLabel={coachingLabel}
          showRestPill={workoutMode === 'REST' || workoutMode === 'PAUSED'}
          restTitleLabel={t('session.restTitle')}
          restTimer={restTimer}
          onOpenRestModal={() => setIsRestModalExpanded(true)}
          onPauseResumeRestTimer={handlePauseResumeRestTimer}
          onAddRestTime={handleAddRestTime}
          onSkipRestTimer={handleSkipRestTimer}
        />

        {lastOutboxBlocked > 0 && (
          <Pressable
            style={styles.syncWarning}
            onPress={() => void refresh()}
            accessibilityRole="button"
            accessibilityLabel={t('session.syncDelayed')}
          >
            <Text variant="labelSm" color="warning">
              {t('session.syncDelayed')}
            </Text>
          </Pressable>
        )}

        <ScrollView
          ref={scrollViewRef}
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: footerHeight + spacing[3] }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <WorkoutSessionExerciseList
            loadError={loadError}
            cancelError={cancelError}
            addExerciseError={addExerciseError}
            labels={{
              reload: t('common.reload'),
              back: t('common.back'),
              exercises: t('session.exercises'),
              addExercise: t('session.addExercise'),
              addFirstTitle: t('session.addFirstTitle'),
              addFirstBody: t('session.addFirstBody'),
              addFirstCta: t('session.addFirstCta'),
              skipForNow: t('session.skipForNow'),
            }}
            isMutating={isMutating}
            isSessionLocked={isSessionLocked}
            hasExercises={exercises.length > 0}
            onRetry={() => setReloadTick((value) => value + 1)}
            onBack={() => router.back()}
            onOpenAddExercise={() => setIsExerciseModalVisible(true)}
            onSkipForNow={() => {
              if (router.canGoBack()) {
                router.back()
                return
              }

              router.replace('/(app)/(tabs)/workout')
            }}
          >
            {exercises.map((exercise) => (
              <View
                key={exercise.id}
                onLayout={(event) => {
                  exerciseLayoutsRef.current[exercise.id] = event.nativeEvent.layout.y
                }}
              >
                <ExerciseBlock
                  exercise={exercise}
                  trackingMode={resolveTrackingModeForExercise(exercise)}
                  units={units}
                  lastTimeSummary={
                    lastTimeSummaryByDefinitionId[exercise.exercise_definition_id] ?? null
                  }
                  targetSetCount={
                    exerciseDefaultsByDefinitionId[exercise.exercise_definition_id]?.defaultSets ??
                    3
                  }
                  defaultReps={
                    exerciseDefaultsByDefinitionId[exercise.exercise_definition_id]?.defaultReps
                  }
                  programTargetSummary={
                    programTargetByDefinitionId[exercise.exercise_definition_id]
                      ? t('programs.targetSummary', {
                          sets: String(
                            programTargetByDefinitionId[exercise.exercise_definition_id]?.sets ??
                              '',
                          ),
                          reps: String(
                            programTargetByDefinitionId[exercise.exercise_definition_id]?.reps ??
                              '',
                          ),
                        })
                      : null
                  }
                  progressionSummary={(() => {
                    const suggestion =
                      progressionSuggestionByDefinitionId[exercise.exercise_definition_id]
                    if (!suggestion) return null

                    const decision = t(`programs.decision.${suggestion.decision}` as TranslationKey)
                    const reason = t(`programs.reason.${suggestion.decision}` as TranslationKey)
                    return `${t('programs.progressionSummary', {
                      decision,
                      weight: suggestion.suggestedWeight,
                      unit: units,
                    })} ${reason}`
                  })()}
                  isExpanded={expandedExerciseId === exercise.id}
                  onToggle={() => handleToggleExercise(exercise.id)}
                  draft={resolveDraftForExercise(exercise.id)}
                  onUpdateDraft={(field, value) => updateDraft(exercise.id, field, value)}
                  onAddSet={() => handleAddSet(exercise.id)}
                  onDeleteSet={(setId) => handleDeleteSet(exercise.id, setId)}
                  onStartEditSet={handleStartEditSet}
                  onOpenSetAdvanced={(set) => handleOpenSetAdvanced(exercise.id, set)}
                  onCancelEditSet={handleCancelEditSet}
                  onSaveEditSet={(setId) => handleSaveEditSet(exercise.id, setId)}
                  onDecrementReps={() => handleDecrementReps(exercise.id)}
                  onDecrementWeight={() => handleDecrementWeight(exercise.id)}
                  onIncrementReps={() => handleIncrementReps(exercise.id)}
                  onIncrementWeight={() => handleIncrementWeight(exercise.id)}
                  onCopyLast={() => handleCopyLast(exercise.id)}
                  editingSetId={editingSetId}
                  editDraft={editDraft}
                  onEditDraftChange={(field, value) =>
                    setEditDraft((prev) => ({ ...prev, [field]: value }))
                  }
                  exerciseError={exerciseErrors[exercise.id] ?? null}
                  savingSetId={savingSetId}
                  deletingSetId={deletingSetId}
                  updatingSetId={updatingSetId}
                  cueValue={cueDrafts[exercise.id] ?? ''}
                  onCueChange={(value) => handleCueChange(exercise.id, value)}
                  onCueBlur={() => {
                    void handleCueBlur(exercise.id)
                  }}
                  savingCue={savingCueExerciseId === exercise.id}
                  isMutating={isMutating}
                  isSessionLocked={isSessionLocked}
                  onShowActions={() => handleExerciseActions(exercise)}
                  deletingExercise={deletingExerciseId === exercise.id}
                  didCompleteSetId={lastCompletedSetByExercise[exercise.id]}
                  isPR={prExerciseIds.has(exercise.id)}
                  isActive={expandedExerciseId === exercise.id}
                />
              </View>
            ))}
          </WorkoutSessionExerciseList>
        </ScrollView>

        <BottomCTA
          onLayout={(event) => {
            const nextHeight = Math.ceil(event.nativeEvent.layout.height)
            if (nextHeight !== footerHeight) {
              setFooterHeight(nextHeight)
            }
          }}
        >
          <Box width={120}>
            <Button
              title={isCancelling ? t('session.cancelling') : t('session.cancel')}
              variant="ghost"
              onPress={() => setIsCancelModalVisible(true)}
              loading={isCancelling}
              disabled={isMutating}
            />
          </Box>
          <Box flex={1}>
            <Button
              testID="workoutSession:finishButton"
              title={isFinishing ? t('session.finishing') : t('session.finish')}
              onPress={openFinishModal}
              isLoading={isFinishing}
              disabled={isMutating}
            />
          </Box>
        </BottomCTA>

        <MilestoneToast
          visible={currentMilestone !== null}
          label={milestoneLabel}
          message={milestoneMessage}
          reducedMotion={reducedMotion}
        />
      </KeyboardAvoidingView>

      <WorkoutSessionRestTimerUI
        visible={
          workoutMode === 'NEXT_UP' ||
          ((workoutMode === 'REST' || workoutMode === 'PAUSED') && isRestModalExpanded)
        }
        reducedMotion={Boolean(reducedMotion)}
        workoutMode={workoutMode}
        tickScale={tickScale}
        restTimer={restTimer}
        restTimerTotalSeconds={restTimerTotalSeconds}
        nextUpPreview={nextUpPreview}
        labels={{
          restNextUpTitle: t('session.restNextUpTitle'),
          restPausedTitle: t('session.restPausedTitle'),
          restTitle: t('session.restTitle'),
          nextUpLabel: t('session.nextUpLabel'),
          nextUpSet: (index) => t('session.nextUpSet', { index: String(index) }),
          nextUpNone: t('session.nextUpNone'),
          continueLabel: t('common.continue'),
          restPause: t('session.restPause'),
          restResume: t('session.restResume'),
          skip: t('common.skip'),
          setsRemaining: (count) => t('session.restSetsRemaining', { count: String(count) }),
          lastSet: t('session.restLastSet'),
          coachingTakeTime: t('session.restCoachingTakeTime'),
          coachingAlmostDone: t('session.restCoachingAlmostDone'),
        }}
        overlayStyle={styles.restModeOverlay}
        cardStyle={styles.restModeCard}
        onRequestClose={
          workoutMode === 'NEXT_UP' ? handleContinueFromNextUp : () => setIsRestModalExpanded(false)
        }
        onContinue={handleContinueFromNextUp}
        onAddRestTime={handleAddRestTime}
        onSubtractRestTime={handleSubtractRestTime}
        onPauseResumeRestTimer={handlePauseResumeRestTimer}
        onSkipRestTimer={handleSkipRestTimer}
      />

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

      {/* ─── Add exercise modal ─────────────────────────────────────── */}
      <Modal
        visible={isExerciseModalVisible}
        animationType="slide"
        onRequestClose={() => setIsExerciseModalVisible(false)}
      >
        <ExerciseSearch
          onSelectExercise={handleAddExercise}
          onClose={() => setIsExerciseModalVisible(false)}
          userId={user?.id}
          recentExercises={exercises
            .map((exercise) => exercise.exercise_definition)
            .filter((exercise): exercise is ExerciseDefinitionRow => Boolean(exercise))}
          favoriteIds={favoriteExerciseIds}
          onToggleFavorite={(exerciseId, isFav) => {
            void handleToggleExerciseFavorite(exerciseId, isFav)
          }}
        />
      </Modal>

      <Modal
        visible={isDefaultsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDefaultsModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text variant="h3">{t('session.exerciseDefaults')}</Text>
            <Text marginTop="xs" variant="bodySm" color="textMuted">
              {defaultsExerciseContext?.exerciseName ?? 'Exercise'}
            </Text>

            <Box marginTop="md">
              <Text marginBottom="xs" variant="labelSm" color="textMuted">
                {t('session.defaultSets', {
                  min: EXERCISE_DEFAULTS_LIMITS.minSets,
                  max: EXERCISE_DEFAULTS_LIMITS.maxSets,
                })}
              </Text>
              <Input
                value={defaultSetsDraft}
                onChangeText={setDefaultSetsDraft}
                keyboardType="number-pad"
                placeholder="3"
                editable={!isSavingDefaults}
              />
            </Box>

            <Box marginTop="md">
              <Text marginBottom="xs" variant="labelSm" color="textMuted">
                {t('session.defaultReps')}
              </Text>
              <Input
                value={defaultRepsDraft}
                onChangeText={setDefaultRepsDraft}
                keyboardType="number-pad"
                placeholder="8"
                editable={!isSavingDefaults}
              />
            </Box>

            {defaultsError ? (
              <Text marginTop="sm" variant="bodySm" color="error">
                {defaultsError}
              </Text>
            ) : null}

            <Box flexDirection="row" gap="sm" marginTop="lg">
              <Box flex={1}>
                <Button
                  title={t('common.cancel')}
                  variant="secondary"
                  onPress={() => setIsDefaultsModalVisible(false)}
                  disabled={isSavingDefaults}
                />
              </Box>
              <Box flex={1}>
                <Button
                  title={isSavingDefaults ? t('common.saving') : t('common.save')}
                  loading={isSavingDefaults}
                  disabled={isSavingDefaults}
                  onPress={() => {
                    void handleSaveExerciseDefaults()
                  }}
                />
              </Box>
            </Box>
          </View>
        </View>
      </Modal>

      <Modal
        visible={advancedSetDraft !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAdvancedSetDraft(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text variant="h3">{t('session.setAdvancedTitle')}</Text>

            {advancedSetDraft ? (
              <>
                <Box
                  marginTop="md"
                  flexDirection="row"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Text variant="labelSm" color="textMuted">
                    {t('session.rirLabel')}
                  </Text>
                  <Box flexDirection="row" alignItems="center" gap="sm">
                    <Button
                      title="-"
                      variant="secondary"
                      onPress={() => handleAdjustAdvancedRir(-1)}
                      disabled={updatingSetId === advancedSetDraft.setId}
                    />
                    <Text variant="h3">{String(advancedSetDraft.rir)}</Text>
                    <Button
                      title="+"
                      variant="secondary"
                      onPress={() => handleAdjustAdvancedRir(1)}
                      disabled={updatingSetId === advancedSetDraft.setId}
                    />
                  </Box>
                </Box>

                <Box
                  marginTop="md"
                  flexDirection="row"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Text variant="labelSm" color="textMuted">
                    {t('session.toFailure')}
                  </Text>
                  <Button
                    title={
                      advancedSetDraft.setType === 'failure' || advancedSetDraft.rir === 0
                        ? t('session.failureOn')
                        : t('session.failureOff')
                    }
                    variant="ghost"
                    onPress={handleToggleAdvancedFailure}
                    disabled={updatingSetId === advancedSetDraft.setId}
                  />
                </Box>

                <Box marginTop="md">
                  <Text marginBottom="xs" variant="labelSm" color="textMuted">
                    {t('session.setTypeLabel')}
                  </Text>
                  <Box flexDirection="row" flexWrap="wrap" gap="sm">
                    {WORKOUT_SET_TYPE_OPTIONS.map((setTypeOption) => {
                      const selected = advancedSetDraft.setType === setTypeOption
                      return (
                        <Pressable
                          key={setTypeOption}
                          onPress={() => handleSelectAdvancedSetType(setTypeOption)}
                          borderWidth={1}
                          borderColor={selected ? 'accent' : 'borderDefault'}
                          borderRadius="md"
                          paddingHorizontal="md"
                          paddingVertical="sm"
                          backgroundColor={selected ? 'accentMuted' : 'surface'}
                          disabled={updatingSetId === advancedSetDraft.setId}
                        >
                          {({ pressed }) => (
                            <Text
                              variant="labelSm"
                              color={selected ? 'accent' : 'textPrimary'}
                              opacity={pressed ? 0.8 : 1}
                            >
                              {t(`session.setType.${setTypeOption}` as TranslationKey)}
                            </Text>
                          )}
                        </Pressable>
                      )
                    })}
                  </Box>
                </Box>

                <Box flexDirection="row" gap="sm" marginTop="lg">
                  <Box flex={1}>
                    <Button
                      title={t('common.cancel')}
                      variant="secondary"
                      onPress={() => setAdvancedSetDraft(null)}
                      disabled={updatingSetId === advancedSetDraft.setId}
                    />
                  </Box>
                  <Box flex={1}>
                    <Button
                      title={
                        updatingSetId === advancedSetDraft.setId
                          ? t('common.saving')
                          : t('common.save')
                      }
                      loading={updatingSetId === advancedSetDraft.setId}
                      disabled={updatingSetId === advancedSetDraft.setId}
                      onPress={() => {
                        void handleSaveSetAdvanced()
                      }}
                    />
                  </Box>
                </Box>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ─── Cancel confirmation modal ──────────────────────────────── */}
      <Modal
        visible={isCancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCancelModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text variant="h3">{t('session.cancelTitle')}</Text>
            <Text marginTop="sm" variant="bodySm" color="textMuted">
              {t('session.cancelBody')}
            </Text>
            <Box flexDirection="row" gap="sm" marginTop="lg">
              <Box flex={1}>
                <Button
                  title={t('session.cancelKeep')}
                  variant="secondary"
                  onPress={() => setIsCancelModalVisible(false)}
                />
              </Box>
              <Box flex={1}>
                <Button
                  title={isCancelling ? t('session.cancelDiscarding') : t('session.cancelDiscard')}
                  variant="destructive"
                  onPress={handleCancelWorkout}
                  loading={isCancelling}
                />
              </Box>
            </Box>
          </View>
        </View>
      </Modal>

      <WorkoutSessionFinishModal
        visible={isFinishModalVisible}
        state={finishModalState}
        errorMessage={finishError}
        queuedDetail={finishQueuedDetail}
        effortRating={finishEffortRating}
        sessionNote={finishSessionNote}
        labels={{
          finishTitle: t('session.finishTitle'),
          finishBody: t('session.finishBody'),
          finishNoteLabel: t('session.finishNoteLabel'),
          finishNotePlaceholder: t('session.finishNotePlaceholder'),
          finishHint: t('session.finishHint'),
          close: t('common.close'),
          finishSubmitting: t('session.finishSubmitting'),
          finishNotNow: t('session.finishNotNow'),
          finishSubmit: t('session.finishSubmit'),
          finishAndShare: t('session.finishAndShare'),
          finishSavingTitle: t('session.finishSavingTitle'),
          finishSavingBody: t('session.finishSavingBody'),
          finishErrorTitle: t('session.finishErrorTitle'),
          finishRetry: t('session.finishRetry'),
          finishDismiss: t('session.finishDismiss'),
          finishQueuedTitle: t('session.finishQueuedTitle'),
          finishQueuedBody: t('session.finishQueuedBody'),
          finishQueuedContinue: t('session.finishQueuedContinue'),
          finishRetrySync: t('session.finishRetrySync'),
        }}
        effortLabelForRating={(rating) => getEffortLabel(rating) ?? 'Moderate'}
        overlayStyle={styles.overlay}
        cardStyle={styles.confirmCard}
        onRequestClose={() => {
          if (finishModalState === 'confirm') {
            closeFinishModal()
          }
        }}
        onSelectEffortRating={setFinishEffortRating}
        onChangeSessionNote={setFinishSessionNote}
        onClose={closeFinishModal}
        onFinishNotNow={() => {
          void handleFinishWorkout()
        }}
        onFinishWithMeta={() => {
          void handleFinishWorkoutWithMeta()
        }}
        onFinishAndShare={() => {
          if (finishEffortRating === null) {
            void handleFinishWorkout(true)
            return
          }
          void handleFinishWorkoutWithMeta(true)
        }}
        onRetry={() => {
          void handleRetryFinish()
        }}
        onRetrySync={() => {
          void handleRetryFinishSync()
        }}
        onContinueAfterQueued={handleContinueAfterQueuedFinish}
      />

      <WorkoutCompleteCelebration
        visible={showCelebration}
        data={
          showCelebration
            ? {
                workoutTitle: sessionRoutineName ?? t('session.title'),
                dateLabel: new Date().toLocaleDateString(),
                durationSeconds: sessionStartedAt
                  ? Math.max(
                      0,
                      Math.floor((Date.now() - new Date(sessionStartedAt).getTime()) / 1000),
                    )
                  : 0,
                setCount: sessionStats.sets,
                exerciseCount: exercises.length,
                volumeKg: sessionStats.volumeKg,
                units,
                prExerciseNames: exercises
                  .filter((ex) => prExerciseIds.has(ex.id))
                  .map((ex) => ex.exercise_definition?.name ?? t('detail.exercise'))
                  .slice(0, 3),
              }
            : null
        }
        labels={{
          title: t('session.complete.title'),
          confirmed: t('session.complete.confirmed'),
          motivation: t('session.complete.motivation'),
          share: t('session.complete.share'),
          sharing: t('share.sharing'),
          continue: t('session.complete.continue'),
          volume: t('session.complete.volume'),
          duration: t('session.complete.duration'),
          sets: t('session.complete.sets'),
          exercises: t('session.complete.exercises'),
          pr: t('session.complete.pr'),
        }}
        isSharing={isSharing}
        shareError={celebrationShareError}
        onShare={() => {
          void handleShareFromCelebration()
        }}
        onDismiss={handleDismissCelebration}
        reducedMotion={reducedMotion ?? false}
      />

      <ExerciseDetailSheet
        visible={exerciseDetail !== null}
        onClose={() => setExerciseDetail(null)}
        exercise={exerciseDetail}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[10],
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: 'flex-end',
  },
  restModeOverlay: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[6],
  },
  restModeCard: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.xl,
    padding: spacing[5],
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  sheet: {
    backgroundColor: colors.bg.secondary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing[4],
    maxHeight: '78%',
  },
  results: {
    marginTop: spacing[3],
  },
  resultsContent: {
    paddingBottom: spacing[4],
  },
  confirmCard: {
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
  syncWarning: {
    backgroundColor: colors.semantic.warningMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.semantic.warning,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
    alignItems: 'center' as const,
  },
})
