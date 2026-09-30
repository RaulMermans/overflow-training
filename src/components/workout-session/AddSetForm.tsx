import { StyleSheet, TextInput } from 'react-native'
import { Box } from '../ui/Box'
import { Button } from '../ui/Button'
import { colors, radius, spacing, typography } from '../../theme'
import { REPS_MAX, REPS_MIN, WEIGHT_MAX, WEIGHT_MIN } from './setEntry'

interface AddSetFormProps {
  draft: { reps: string; weight: string }
  onUpdateDraft: (field: 'reps' | 'weight', value: string) => void
  onAddSet: () => void
  saving: boolean
  disabled: boolean
  showAction?: boolean
}

export function AddSetForm({
  draft,
  onUpdateDraft,
  onAddSet,
  saving,
  disabled,
  showAction = true,
}: AddSetFormProps) {
  const repsValue = Number.parseInt(draft.reps, 10)
  const weightValue = Number.parseFloat(draft.weight)
  const canAdd =
    !disabled &&
    !saving &&
    Number.isFinite(repsValue) &&
    repsValue >= REPS_MIN &&
    repsValue <= REPS_MAX &&
    Number.isFinite(weightValue) &&
    weightValue >= WEIGHT_MIN &&
    weightValue <= WEIGHT_MAX

  return (
    <Box marginTop="md">
      <Box flexDirection="row" gap="sm">
        <TextInput
          style={[styles.input, styles.halfInput]}
          placeholder="Reps"
          placeholderTextColor={colors.text.muted}
          keyboardType="number-pad"
          value={draft.reps}
          onChangeText={(value) => onUpdateDraft('reps', value)}
          editable={!disabled && !saving}
        />
        <TextInput
          style={[styles.input, styles.halfInput]}
          placeholder="Weight"
          placeholderTextColor={colors.text.muted}
          keyboardType="decimal-pad"
          value={draft.weight}
          onChangeText={(value) => onUpdateDraft('weight', value)}
          editable={!disabled && !saving}
        />
      </Box>
      {showAction ? (
        <Button
          testID="workoutSession:addSetButton"
          marginTop="sm"
          title={saving ? 'Adding set\u2026' : '+ Add set'}
          variant="ghost"
          onPress={onAddSet}
          isLoading={saving}
          disabled={!canAdd}
        />
      ) : null}
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
