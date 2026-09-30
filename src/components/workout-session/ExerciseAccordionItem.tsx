import { useMemo } from 'react'
import { ActivityIndicator, StyleSheet, TextInput } from 'react-native'
import { Box } from '../ui/Box'
import { Button } from '../ui/Button'
import { Divider } from '../ui/Divider'
import { Pressable } from '../ui/Pressable'
import { SetRow } from '../ui/SetRow'
import { Text } from '../ui/Text'
import { AddSetForm } from './AddSetForm'
import { colors, radius, spacing, typography } from '../../theme'
import type { WorkoutDetail, WorkoutSetRow } from '../../db/workouts'
import { useI18n } from '../../i18n/useI18n'
import { getLocalizedExerciseName } from '../../i18n/exerciseNames'

type ExerciseEntry = WorkoutDetail['workout_exercises'][number]

interface ExerciseAccordionItemProps {
  exercise: ExerciseEntry
  isExpanded: boolean
  onToggle: () => void
  // Set drafts
  draft: { reps: string; weight: string }
  onUpdateDraft: (field: 'reps' | 'weight', value: string) => void
  onAddSet: () => void
  onDeleteSet: (setId: string) => void
  onStartEditSet: (set: WorkoutSetRow) => void
  onCancelEditSet: () => void
  onSaveEditSet: (setId: string) => void
  // Edit state
  editingSetId: string | null
  editDraft: { reps: string; weight: string }
  onEditDraftChange: (field: 'reps' | 'weight', value: string) => void
  // Loading / error
  exerciseError: string | null
  savingSetId: string | null
  deletingSetId: string | null
  updatingSetId: string | null
  isMutating: boolean
  isSessionLocked: boolean
  // Actions
  onShowActions: () => void
  deletingExercise: boolean
}

export function ExerciseAccordionItem({
  exercise,
  isExpanded,
  onToggle,
  draft,
  onUpdateDraft,
  onAddSet,
  onDeleteSet,
  onStartEditSet,
  onCancelEditSet,
  onSaveEditSet,
  editingSetId,
  editDraft,
  onEditDraftChange,
  exerciseError,
  savingSetId,
  deletingSetId,
  updatingSetId,
  isMutating,
  isSessionLocked,
  onShowActions,
  deletingExercise,
}: ExerciseAccordionItemProps) {
  const { t, language } = useI18n()
  const name =
    getLocalizedExerciseName(
      exercise.exercise_definition?.slug,
      language,
      exercise.exercise_definition?.name,
    ) || t('detail.exercise')

  const summary = useMemo(() => {
    const sets = exercise.workout_sets
    if (sets.length === 0) return t('session.noSetsYet')
    const last = sets[sets.length - 1]
    return `${sets.length}\u00d7${last.reps} @ ${last.weight} lb`
  }, [exercise.workout_sets, t])

  return (
    <Box>
      {/* Header row — always visible, tappable to toggle */}
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${summary}`}
      >
        {({ pressed }) => (
          <Box
            flexDirection="row"
            alignItems="center"
            minHeight={52}
            paddingVertical="md"
            opacity={pressed ? 0.85 : 1}
          >
            <Box flex={1}>
              <Text variant="label">{name}</Text>
              <Text marginTop="xs" variant="bodySm" color="textMuted">
                {summary}
              </Text>
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
                  <Text
                    variant="label"
                    color="textMuted"
                    opacity={morePressed || isMutating ? 0.5 : 1}
                  >
                    {'\u2026'}
                  </Text>
                )}
              </Pressable>
            )}
          </Box>
        )}
      </Pressable>

      {/* Expanded content */}
      {isExpanded ? (
        <Box paddingBottom="md">
          {exerciseError ? (
            <Text marginBottom="sm" variant="bodySm" color="error">
              {exerciseError}
            </Text>
          ) : null}

          {/* Column headers */}
          {exercise.workout_sets.length > 0 ? (
            <Box
              flexDirection="row"
              alignItems="center"
              paddingVertical="xs"
              marginBottom="xs"
              borderBottomWidth={1}
              borderBottomColor="borderSubtle"
            >
              <Box width={40} alignItems="center">
                <Text variant="micro" color="textMuted">
                  SET
                </Text>
              </Box>
              <Box flex={1} alignItems="center">
                <Text variant="micro" color="textMuted">
                  REPS
                </Text>
              </Box>
              <Box flex={1} alignItems="center">
                <Text variant="micro" color="textMuted">
                  WEIGHT
                </Text>
              </Box>
              <Box width={100} />
            </Box>
          ) : null}

          {/* Set list */}
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
                    Edit set {set.set_index + 1}
                  </Text>
                  <Box flexDirection="row" gap="sm" marginTop="sm">
                    <TextInput
                      style={[styles.input, styles.halfInput]}
                      placeholder="Reps"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="number-pad"
                      value={editDraft.reps}
                      onChangeText={(value) => onEditDraftChange('reps', value)}
                      editable={updatingSetId !== set.id}
                    />
                    <TextInput
                      style={[styles.input, styles.halfInput]}
                      placeholder="Weight"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="decimal-pad"
                      value={editDraft.weight}
                      onChangeText={(value) => onEditDraftChange('weight', value)}
                      editable={updatingSetId !== set.id}
                    />
                  </Box>
                  <Box flexDirection="row" gap="sm" marginTop="sm">
                    <Box flex={1}>
                      <Button
                        title={updatingSetId === set.id ? 'Saving\u2026' : 'Save'}
                        onPress={() => onSaveEditSet(set.id)}
                        loading={updatingSetId === set.id}
                        disabled={updatingSetId === set.id}
                      />
                    </Box>
                    <Box flex={1}>
                      <Button
                        title="Cancel"
                        variant="secondary"
                        onPress={onCancelEditSet}
                        disabled={updatingSetId === set.id}
                      />
                    </Box>
                  </Box>
                </Box>
              )
            }

            return (
              <SetRow
                key={set.id}
                index={set.set_index + 1}
                reps={set.reps ?? 0}
                weight={set.weight ?? 0}
                onEdit={() => onStartEditSet(set)}
                onDelete={() => onDeleteSet(set.id)}
                disabled={isMutating}
                deleting={deletingSetId === set.id}
              />
            )
          })}

          {/* Add set form */}
          <AddSetForm
            draft={draft}
            onUpdateDraft={onUpdateDraft}
            onAddSet={onAddSet}
            saving={savingSetId === exercise.id}
            disabled={isSessionLocked}
            showAction
          />
        </Box>
      ) : null}

      <Divider />
    </Box>
  )
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.bg.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    color: colors.text.primary,
    ...typography.body,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    minHeight: 44,
  },
  halfInput: {
    flex: 1,
  },
})
