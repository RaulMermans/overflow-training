import type { ReactNode } from 'react'
import {
  Box,
  Button,
  Card,
  ErrorState,
  Pressable,
  SectionHeader,
  Text,
} from '../../../components/ui'

interface WorkoutSessionExerciseListLabels {
  reload: string
  back: string
  exercises: string
  addExercise: string
  addFirstTitle: string
  addFirstBody: string
  addFirstCta: string
  skipForNow: string
}

interface WorkoutSessionExerciseListProps {
  loadError: string | null
  cancelError: string | null
  addExerciseError: string | null
  labels: WorkoutSessionExerciseListLabels
  isMutating: boolean
  isSessionLocked: boolean
  hasExercises: boolean
  onRetry: () => void
  onBack: () => void
  onOpenAddExercise: () => void
  onSkipForNow: () => void
  children: ReactNode
}

export function WorkoutSessionExerciseList({
  loadError,
  cancelError,
  addExerciseError,
  labels,
  isMutating,
  isSessionLocked: _isSessionLocked,
  hasExercises,
  onRetry,
  onBack,
  onOpenAddExercise,
  onSkipForNow,
  children,
}: WorkoutSessionExerciseListProps) {
  return (
    <>
      {loadError ? (
        <>
          <ErrorState message={loadError} retryLabel={labels.reload} onRetry={onRetry} />
          <Box marginTop="sm">
            <Button title={labels.back} variant="ghost" onPress={onBack} />
          </Box>
        </>
      ) : null}
      {cancelError ? <ErrorState message={cancelError} /> : null}
      {addExerciseError ? (
        <Text marginBottom="md" variant="bodySm" color="error">
          {addExerciseError}
        </Text>
      ) : null}

      <SectionHeader
        title={labels.exercises}
        variant="dense"
        actionLabel={isMutating ? undefined : labels.addExercise}
        onActionPress={isMutating ? undefined : onOpenAddExercise}
      />

      {!hasExercises ? (
        <Card marginBottom="md">
          <Text variant="h3">{labels.addFirstTitle}</Text>
          <Text marginTop="sm" variant="bodySm" color="textMuted">
            {labels.addFirstBody}
          </Text>
          <Box marginTop="md">
            <Button title={labels.addFirstCta} onPress={onOpenAddExercise} disabled={isMutating} />
          </Box>
          <Pressable
            onPress={onSkipForNow}
            accessibilityRole="button"
            disabled={isMutating}
            alignItems="center"
            justifyContent="center"
            minHeight={44}
            marginTop="xs"
          >
            {({ pressed }) => (
              <Text variant="labelSm" color="textMuted" opacity={pressed ? 0.8 : 1}>
                {labels.skipForNow}
              </Text>
            )}
          </Pressable>
        </Card>
      ) : (
        children
      )}
    </>
  )
}
