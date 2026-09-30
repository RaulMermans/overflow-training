import React, { useMemo } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@shopify/restyle'
import type { UnitsPreference } from '../../lib/profilePreferences'
import { Input } from '../ui/Input'
import { Box } from '../ui/Box'
import { Button } from '../ui/Button'
import { Divider } from '../ui/Divider'
import { Pressable } from '../ui/Pressable'
import { SetRow } from '../../features/workoutSession/components/SetRow'
import { Text } from '../ui/Text'
import { IncrementChips } from './IncrementChips'
import { canSubmitSetDraft } from './setEntry'
import { colors } from '../../theme'
import type { Theme } from '../../theme/restyleTheme'
import type { ExerciseTrackingMode, WorkoutDetail, WorkoutSetRow } from '../../db/workouts'
import { resolveDisplayWeight } from '../../lib/units'
import { useI18n } from '../../i18n/useI18n'
import { getLocalizedExerciseName } from '../../i18n/exerciseNames'
import {
  distanceUnitForPreference,
  formatDistanceLabel,
  formatDurationLabel,
  formatPaceLabel,
  parseDistanceInput,
  parseDurationInput,
} from '../../features/workoutSession/setMetrics'

type ExerciseEntry = WorkoutDetail['workout_exercises'][number]
type SetDraftFields = {
  reps: string
  weight: string
  duration: string
  distance: string
}
type DraftField = keyof SetDraftFields

interface ExerciseBlockProps {
  exercise: ExerciseEntry
  trackingMode: ExerciseTrackingMode
  units: UnitsPreference
  lastTimeSummary?: string | null
  targetSetCount: number
  defaultReps?: number
  programTargetSummary?: string | null
  progressionSummary?: string | null
  isExpanded: boolean
  onToggle: () => void
  draft: SetDraftFields
  onUpdateDraft: (field: DraftField, value: string) => void
  onAddSet: () => void
  onDeleteSet: (setId: string) => void
  onStartEditSet: (set: WorkoutSetRow) => void
  onOpenSetAdvanced: (set: WorkoutSetRow) => void
  onCancelEditSet: () => void
  onSaveEditSet: (setId: string) => void
  onDecrementReps: () => void
  onDecrementWeight: () => void
  onIncrementReps: () => void
  onIncrementWeight: () => void
  onCopyLast: () => void
  editingSetId: string | null
  editDraft: SetDraftFields
  onEditDraftChange: (field: DraftField, value: string) => void
  exerciseError: string | null
  savingSetId: string | null
  deletingSetId: string | null
  updatingSetId: string | null
  cueValue: string
  onCueChange: (value: string) => void
  onCueBlur: () => void
  savingCue: boolean
  isMutating: boolean
  isSessionLocked: boolean
  onShowActions: () => void
  deletingExercise: boolean
  didCompleteSetId?: string
  isPR?: boolean
  isActive?: boolean
}

export const ExerciseBlock = React.memo(function ExerciseBlock({
  exercise,
  trackingMode,
  units,
  lastTimeSummary,
  targetSetCount,
  defaultReps,
  programTargetSummary,
  progressionSummary,
  isExpanded,
  onToggle,
  draft,
  onUpdateDraft,
  onAddSet,
  onDeleteSet,
  onStartEditSet,
  onOpenSetAdvanced,
  onCancelEditSet,
  onSaveEditSet,
  onDecrementReps,
  onDecrementWeight,
  onIncrementReps,
  onIncrementWeight,
  onCopyLast,
  editingSetId,
  editDraft,
  onEditDraftChange,
  exerciseError,
  savingSetId,
  deletingSetId,
  updatingSetId,
  cueValue,
  onCueChange,
  onCueBlur,
  savingCue,
  isMutating,
  isSessionLocked,
  onShowActions,
  deletingExercise,
  didCompleteSetId,
  isPR = false,
  isActive = false,
}: ExerciseBlockProps) {
  const theme = useTheme<Theme>()
  const { t, language } = useI18n()
  const name =
    getLocalizedExerciseName(
      exercise.exercise_definition?.slug,
      language,
      exercise.exercise_definition?.name,
    ) || t('detail.exercise')
  const hasLastSet = exercise.workout_sets.length > 0
  const distanceUnit = distanceUnitForPreference(units)

  const isWeightReps = trackingMode === 'weight_reps'
  const isRepsOnly = trackingMode === 'reps_only'
  const isTimeMode = trackingMode === 'time'
  const isDistanceTimeMode = trackingMode === 'distance_time'
  const supportsReps = isWeightReps || isRepsOnly

  const canAdd = useMemo(() => {
    if (isWeightReps) {
      return canSubmitSetDraft({
        reps: draft.reps,
        weight: draft.weight,
      })
    }
    if (isRepsOnly) {
      const reps = Number.parseInt(draft.reps, 10)
      return Number.isFinite(reps) && reps > 0
    }
    if (isTimeMode) {
      const duration = parseDurationInput(draft.duration)
      return duration !== null && duration > 0
    }
    const duration = parseDurationInput(draft.duration)
    const distance = parseDistanceInput(draft.distance, units)
    return duration !== null && duration > 0 && distance !== null && distance > 0
  }, [
    draft.distance,
    draft.duration,
    draft.reps,
    draft.weight,
    isDistanceTimeMode,
    isRepsOnly,
    isTimeMode,
    isWeightReps,
    units,
  ])

  const remainingTargetSets = supportsReps
    ? Math.max(0, targetSetCount - exercise.workout_sets.length)
    : 0

  const summary = useMemo(() => {
    const sets = exercise.workout_sets
    if (sets.length === 0) return t('session.noSetsYet')
    const last = sets[sets.length - 1]

    if (isWeightReps) {
      const displayWeight = resolveDisplayWeight(last, units)
      return `${sets.length}×${last.reps ?? 0} @ ${displayWeight} ${units}`
    }

    if (isRepsOnly) {
      return `${sets.length}×${last.reps ?? 0}`
    }

    if (isTimeMode) {
      return `${sets.length}×${formatDurationLabel(last.duration_seconds)}`
    }

    const distance = formatDistanceLabel(last.distance_m, units)
    const duration = formatDurationLabel(last.duration_seconds)
    return `${sets.length}×${distance} ${distanceUnit} · ${duration}`
  }, [distanceUnit, exercise.workout_sets, isRepsOnly, isTimeMode, isWeightReps, t, units])

  const renderHeaderColumns = () => {
    if (isWeightReps) {
      return (
        <Box
          flexDirection="row"
          alignItems="center"
          paddingVertical="xs"
          marginBottom="xs"
          borderBottomWidth={1}
          borderBottomColor="borderSubtle"
        >
          <Box width={40} alignItems="center">
            <Text variant="labelSm" color="textMuted">
              {t('session.columnSet')}
            </Text>
          </Box>
          <Box flex={1} alignItems="center">
            <Text variant="labelSm" color="textMuted">
              {t('session.columnReps')}
            </Text>
          </Box>
          <Box flex={1} alignItems="center">
            <Text variant="labelSm" color="textMuted">
              {t('session.columnWeight')}
            </Text>
          </Box>
          <Box width={100} />
        </Box>
      )
    }

    if (isRepsOnly) {
      return (
        <Box
          flexDirection="row"
          alignItems="center"
          paddingVertical="xs"
          marginBottom="xs"
          borderBottomWidth={1}
          borderBottomColor="borderSubtle"
        >
          <Box width={40} alignItems="center">
            <Text variant="labelSm" color="textMuted">
              {t('session.columnSet')}
            </Text>
          </Box>
          <Box flex={1} alignItems="center">
            <Text variant="labelSm" color="textMuted">
              {t('session.columnReps')}
            </Text>
          </Box>
          <Box width={100} />
        </Box>
      )
    }

    if (isTimeMode) {
      return (
        <Box
          flexDirection="row"
          alignItems="center"
          paddingVertical="xs"
          marginBottom="xs"
          borderBottomWidth={1}
          borderBottomColor="borderSubtle"
        >
          <Box width={40} alignItems="center">
            <Text variant="labelSm" color="textMuted">
              {t('session.columnSet')}
            </Text>
          </Box>
          <Box flex={1} alignItems="center">
            <Text variant="labelSm" color="textMuted">
              {t('session.columnDuration')}
            </Text>
          </Box>
          <Box width={100} />
        </Box>
      )
    }

    return (
      <Box
        flexDirection="row"
        alignItems="center"
        paddingVertical="xs"
        marginBottom="xs"
        borderBottomWidth={1}
        borderBottomColor="borderSubtle"
      >
        <Box width={40} alignItems="center">
          <Text variant="labelSm" color="textMuted">
            {t('session.columnSet')}
          </Text>
        </Box>
        <Box flex={1} alignItems="center">
          <Text variant="labelSm" color="textMuted">
            {t('session.columnDistance')}
          </Text>
        </Box>
        <Box flex={1} alignItems="center">
          <Text variant="labelSm" color="textMuted">
            {t('session.columnDuration')}
          </Text>
        </Box>
        <Box flex={1} alignItems="center">
          <Text variant="labelSm" color="textMuted">
            {t('session.columnPace')}
          </Text>
        </Box>
        <Box width={100} />
      </Box>
    )
  }

  const renderEditFields = (set: WorkoutSetRow) => {
    if (isWeightReps) {
      return (
        <Box flexDirection="row" gap="sm" marginTop="sm">
          <Box flex={1}>
            <Input
              placeholder={t('session.fieldReps')}
              keyboardType="number-pad"
              value={editDraft.reps}
              onChangeText={(value) => onEditDraftChange('reps', value)}
              editable={updatingSetId !== set.id}
            />
          </Box>
          <Box flex={1}>
            <Input
              placeholder={t('session.fieldWeight', { unit: units })}
              keyboardType="decimal-pad"
              value={editDraft.weight}
              onChangeText={(value) => onEditDraftChange('weight', value)}
              editable={updatingSetId !== set.id}
            />
          </Box>
        </Box>
      )
    }

    if (isRepsOnly) {
      return (
        <Box marginTop="sm">
          <Input
            placeholder={t('session.fieldReps')}
            keyboardType="number-pad"
            value={editDraft.reps}
            onChangeText={(value) => onEditDraftChange('reps', value)}
            editable={updatingSetId !== set.id}
          />
        </Box>
      )
    }

    if (isTimeMode) {
      return (
        <Box marginTop="sm">
          <Input
            placeholder={t('session.fieldDurationHint')}
            keyboardType="numbers-and-punctuation"
            value={editDraft.duration}
            onChangeText={(value) => onEditDraftChange('duration', value)}
            editable={updatingSetId !== set.id}
          />
        </Box>
      )
    }

    return (
      <Box flexDirection="row" gap="sm" marginTop="sm">
        <Box flex={1}>
          <Input
            placeholder={t('session.fieldDistance', { unit: distanceUnit })}
            keyboardType="decimal-pad"
            value={editDraft.distance}
            onChangeText={(value) => onEditDraftChange('distance', value)}
            editable={updatingSetId !== set.id}
          />
        </Box>
        <Box flex={1}>
          <Input
            placeholder={t('session.fieldDurationHint')}
            keyboardType="numbers-and-punctuation"
            value={editDraft.duration}
            onChangeText={(value) => onEditDraftChange('duration', value)}
            editable={updatingSetId !== set.id}
          />
        </Box>
      </Box>
    )
  }

  const renderNonStrengthSetRow = (set: WorkoutSetRow) => {
    const distanceText = `${formatDistanceLabel(set.distance_m, units)} ${distanceUnit}`
    const durationText = formatDurationLabel(set.duration_seconds)
    const pace = formatPaceLabel(set.distance_m, set.duration_seconds, units)

    return (
      <Box key={set.id} borderBottomWidth={1} borderBottomColor="borderSubtle" paddingVertical="sm">
        <Box flexDirection="row" alignItems="center" minHeight={44}>
          <Box width={40} alignItems="center">
            <Text variant="tabular" color="textMuted">
              {set.set_index + 1}
            </Text>
          </Box>
          {isRepsOnly ? (
            <Box flex={1} alignItems="center">
              <Text variant="tabular">{set.reps ?? 0}</Text>
            </Box>
          ) : null}
          {isTimeMode ? (
            <Box flex={1} alignItems="center">
              <Text variant="tabular">{durationText}</Text>
            </Box>
          ) : null}
          {isDistanceTimeMode ? (
            <>
              <Box flex={1} alignItems="center">
                <Text variant="tabular">{distanceText}</Text>
              </Box>
              <Box flex={1} alignItems="center">
                <Text variant="tabular">{durationText}</Text>
              </Box>
              <Box flex={1} alignItems="center">
                <Text variant="tabular">{pace ?? '--'}</Text>
              </Box>
            </>
          ) : null}
          <Box flexDirection="row" alignItems="center" marginLeft="sm">
            <Pressable
              onPress={() => onStartEditSet(set)}
              disabled={isMutating}
              accessibilityRole="button"
            >
              {({ pressed }) => (
                <Text variant="labelSm" color="accent" opacity={pressed || isMutating ? 0.6 : 1}>
                  {t('common.edit')}
                </Text>
              )}
            </Pressable>
            <Box width={12} />
            <Pressable
              onPress={() => onDeleteSet(set.id)}
              disabled={isMutating}
              accessibilityRole="button"
            >
              {({ pressed }) => (
                <Box minWidth={44} alignItems="flex-end" opacity={pressed || isMutating ? 0.6 : 1}>
                  {deletingSetId === set.id ? (
                    <ActivityIndicator size="small" color={theme.colors.error} />
                  ) : (
                    <Text variant="labelSm" color="error">
                      {t('common.delete')}
                    </Text>
                  )}
                </Box>
              )}
            </Pressable>
          </Box>
        </Box>
      </Box>
    )
  }

  const renderEntryRow = () => {
    if (isWeightReps) {
      return (
        <SetRow
          variant="entry"
          draft={{ reps: draft.reps, weight: draft.weight }}
          onDraftChange={(field, value) => onUpdateDraft(field, value)}
          onAddSet={onAddSet}
          adding={savingSetId === exercise.id}
          disabled={isSessionLocked}
          canAdd={canAdd}
          units={units}
        />
      )
    }

    if (isRepsOnly) {
      return (
        <Box borderBottomWidth={1} borderBottomColor="borderSubtle" paddingVertical="sm">
          <Box flexDirection="row" alignItems="center">
            <Box width={40} alignItems="center">
              <Text variant="micro" color="textMuted">
                NEW
              </Text>
            </Box>
            <Box flex={1}>
              <Input
                placeholder={t('session.fieldReps')}
                keyboardType="number-pad"
                value={draft.reps}
                onChangeText={(value) => onUpdateDraft('reps', value)}
                editable={!isSessionLocked && savingSetId !== exercise.id}
              />
            </Box>
            <Box width={88} marginLeft="sm">
              <Button
                testID="workoutSession:addSetButton"
                title={savingSetId === exercise.id ? t('session.adding') : t('common.add')}
                variant="ghost"
                onPress={onAddSet}
                loading={savingSetId === exercise.id}
                disabled={isSessionLocked || savingSetId === exercise.id || !canAdd}
              />
            </Box>
          </Box>
        </Box>
      )
    }

    if (isTimeMode) {
      return (
        <Box borderBottomWidth={1} borderBottomColor="borderSubtle" paddingVertical="sm">
          <Box flexDirection="row" alignItems="center">
            <Box width={40} alignItems="center">
              <Text variant="micro" color="textMuted">
                NEW
              </Text>
            </Box>
            <Box flex={1}>
              <Input
                placeholder={t('session.fieldDurationHint')}
                keyboardType="numbers-and-punctuation"
                value={draft.duration}
                onChangeText={(value) => onUpdateDraft('duration', value)}
                editable={!isSessionLocked && savingSetId !== exercise.id}
              />
            </Box>
            <Box width={88} marginLeft="sm">
              <Button
                testID="workoutSession:addSetButton"
                title={savingSetId === exercise.id ? t('session.adding') : t('common.add')}
                variant="ghost"
                onPress={onAddSet}
                loading={savingSetId === exercise.id}
                disabled={isSessionLocked || savingSetId === exercise.id || !canAdd}
              />
            </Box>
          </Box>
        </Box>
      )
    }

    const pacePreview = formatPaceLabel(
      parseDistanceInput(draft.distance, units),
      parseDurationInput(draft.duration),
      units,
    )

    return (
      <Box borderBottomWidth={1} borderBottomColor="borderSubtle" paddingVertical="sm">
        <Box flexDirection="row" alignItems="center" gap="sm">
          <Box width={40} alignItems="center">
            <Text variant="micro" color="textMuted">
              NEW
            </Text>
          </Box>
          <Box flex={1}>
            <Input
              placeholder={t('session.fieldDistance', { unit: distanceUnit })}
              keyboardType="decimal-pad"
              value={draft.distance}
              onChangeText={(value) => onUpdateDraft('distance', value)}
              editable={!isSessionLocked && savingSetId !== exercise.id}
            />
          </Box>
          <Box flex={1}>
            <Input
              placeholder={t('session.fieldDurationHint')}
              keyboardType="numbers-and-punctuation"
              value={draft.duration}
              onChangeText={(value) => onUpdateDraft('duration', value)}
              editable={!isSessionLocked && savingSetId !== exercise.id}
            />
          </Box>
          <Box width={88}>
            <Button
              testID="workoutSession:addSetButton"
              title={savingSetId === exercise.id ? t('session.adding') : t('common.add')}
              variant="ghost"
              onPress={onAddSet}
              loading={savingSetId === exercise.id}
              disabled={isSessionLocked || savingSetId === exercise.id || !canAdd}
            />
          </Box>
        </Box>
        {pacePreview ? (
          <Text marginTop="xs" variant="micro" color="textMuted">
            {t('session.columnPace')}: {pacePreview}
          </Text>
        ) : null}
      </Box>
    )
  }

  return (
    <Box marginBottom="sm" style={isActive ? styles.activeLeft : undefined}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${summary}`}
      >
        {({ pressed }) => (
          <Box
            flexDirection="row"
            alignItems="center"
            minHeight={56}
            paddingVertical="md"
            opacity={pressed ? 0.85 : 1}
          >
            <Box flex={1}>
              <Box flexDirection="row" alignItems="center" gap="xs" flexWrap="wrap">
                <Text variant="label">{name}</Text>
                {isPR ? (
                  <Text variant="labelSm" color="accent">
                    PR
                  </Text>
                ) : null}
              </Box>
              <Text marginTop="xs" variant="bodySm" color="textMuted">
                {summary}
              </Text>
              {lastTimeSummary ? (
                <Text marginTop="xs" variant="bodySm" color="textMuted">
                  {lastTimeSummary}
                </Text>
              ) : null}
              <Text
                marginTop="xs"
                variant="bodySm"
                color={
                  (exercise.workout_sets?.length ?? 0) >= targetSetCount ? 'accent' : 'textMuted'
                }
              >
                {t('session.setProgress', {
                  done: String(exercise.workout_sets?.length ?? 0),
                  target: String(targetSetCount),
                })}
                {defaultReps ? ` · ${defaultReps} reps` : ''}
              </Text>
              {programTargetSummary ? (
                <Text marginTop="xs" variant="bodySm" color="textMuted">
                  {programTargetSummary}
                </Text>
              ) : null}
              {progressionSummary ? (
                <Text marginTop="xs" variant="bodySm" color="accent">
                  {progressionSummary}
                </Text>
              ) : null}
            </Box>

            {deletingExercise ? (
              <Box minWidth={44} alignItems="center" justifyContent="center">
                <ActivityIndicator size="small" color={colors.text.muted} />
              </Box>
            ) : (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.()
                  onShowActions()
                }}
                disabled={isMutating}
                accessibilityRole="button"
                accessibilityLabel={t('session.exerciseOptions')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                minWidth={44}
                alignItems="center"
                justifyContent="center"
              >
                {({ pressed: morePressed }) => (
                  <Box opacity={morePressed || isMutating ? 0.5 : 1}>
                    <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textMuted} />
                  </Box>
                )}
              </Pressable>
            )}
          </Box>
        )}
      </Pressable>

      {isExpanded ? (
        <Box
          paddingHorizontal="sm"
          paddingBottom="md"
          borderRadius="md"
          borderWidth={1}
          borderColor="borderSubtle"
          backgroundColor="surface"
        >
          {exerciseError ? (
            <Text marginTop="sm" marginBottom="sm" variant="bodySm" color="error">
              {exerciseError}
            </Text>
          ) : null}

          <Box marginTop="sm" marginBottom="sm">
            <Text marginBottom="xs" variant="labelSm" color="textMuted">
              {t('session.cueOptional')}
            </Text>
            <Input
              value={cueValue}
              onChangeText={onCueChange}
              onBlur={onCueBlur}
              placeholder={t('session.cuePlaceholder')}
              editable={!isSessionLocked}
              returnKeyType="done"
            />
            {savingCue ? (
              <Text marginTop="xs" variant="micro" color="textMuted">
                {t('session.savingCue')}
              </Text>
            ) : null}
          </Box>

          {exercise.workout_sets.length > 0 || remainingTargetSets > 0
            ? renderHeaderColumns()
            : null}

          {exercise.workout_sets.length === 0 && isExpanded ? (
            <Text marginBottom="xs" variant="micro" color="textMuted">
              {t('session.exerciseLogFirst')}
            </Text>
          ) : exercise.workout_sets.length > 0 &&
            exercise.workout_sets.length < targetSetCount &&
            isExpanded ? (
            <Text marginBottom="xs" variant="micro" color="textMuted">
              {t('session.exerciseSetsToGo', {
                count: String(targetSetCount - exercise.workout_sets.length),
              })}
            </Text>
          ) : null}

          {exercise.workout_sets.map((set) => {
            if (editingSetId === set.id) {
              return (
                <Box
                  key={set.id}
                  paddingVertical="sm"
                  borderBottomWidth={1}
                  borderBottomColor="borderSubtle"
                >
                  <Text variant="bodySm" color="textMuted">
                    {t('session.editSet', { index: String(set.set_index + 1) })}
                  </Text>
                  {renderEditFields(set)}
                  <Box flexDirection="row" gap="sm" marginTop="sm">
                    <Box flex={1}>
                      <Button
                        title={updatingSetId === set.id ? t('common.saving') : t('common.save')}
                        onPress={() => onSaveEditSet(set.id)}
                        loading={updatingSetId === set.id}
                        disabled={updatingSetId === set.id}
                      />
                    </Box>
                    <Box flex={1}>
                      <Button
                        title={t('common.cancel')}
                        variant="secondary"
                        onPress={onCancelEditSet}
                        disabled={updatingSetId === set.id}
                      />
                    </Box>
                  </Box>
                  <Box marginTop="sm">
                    <Button
                      title={t('session.setAdvanced')}
                      variant="ghost"
                      onPress={() => onOpenSetAdvanced(set)}
                      disabled={updatingSetId === set.id}
                    />
                  </Box>
                </Box>
              )
            }

            if (isWeightReps) {
              return (
                <SetRow
                  key={set.id}
                  index={set.set_index + 1}
                  reps={set.reps ?? 0}
                  weight={resolveDisplayWeight(set, units)}
                  onEdit={() => onStartEditSet(set)}
                  onDelete={() => onDeleteSet(set.id)}
                  disabled={isMutating}
                  deleting={deletingSetId === set.id}
                  didComplete={didCompleteSetId === set.id}
                />
              )
            }

            return renderNonStrengthSetRow(set)
          })}

          {Array.from({ length: remainingTargetSets }, (_, index) => (
            <Box
              key={`target-set-${exercise.id}-${index}`}
              borderBottomWidth={1}
              borderBottomColor="borderSubtle"
              paddingVertical="sm"
              flexDirection="row"
              alignItems="center"
              minHeight={44}
            >
              <Box width={40} alignItems="center">
                <Text variant="tabular" color="textMuted">
                  {exercise.workout_sets.length + index + 1}
                </Text>
              </Box>
              <Box flex={1} alignItems="center">
                <Text variant="bodySm" color="textMuted">
                  {defaultReps ? `${defaultReps}` : '--'}
                </Text>
              </Box>
              {isWeightReps ? (
                <Box flex={1} alignItems="center">
                  <Text variant="bodySm" color="textMuted">
                    --
                  </Text>
                </Box>
              ) : null}
              <Box width={100} alignItems="flex-end">
                <Text variant="micro" color="textMuted">
                  {t('session.targetSet')}
                </Text>
              </Box>
            </Box>
          ))}

          {renderEntryRow()}

          {supportsReps ? (
            <IncrementChips
              units={units}
              disabled={isSessionLocked}
              canCopyLast={hasLastSet}
              showWeightIncrement={isWeightReps}
              showCopyLast={isWeightReps}
              onDecrementRep={onDecrementReps}
              onDecrementWeight={onDecrementWeight}
              onIncrementRep={onIncrementReps}
              onIncrementWeight={onIncrementWeight}
              onCopyLast={onCopyLast}
            />
          ) : null}
        </Box>
      ) : null}

      <Box marginTop="xs">
        <Divider />
      </Box>
    </Box>
  )
})

const styles = StyleSheet.create({
  activeLeft: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accent.secondary,
    paddingLeft: 8,
  },
})
