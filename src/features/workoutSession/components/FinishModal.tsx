import { ActivityIndicator, Modal, View, type StyleProp, type ViewStyle } from 'react-native'
import { Box, Button, Input, Pressable, Text } from '../../../components/ui'

export type WorkoutSessionFinishModalState = 'confirm' | 'saving' | 'error' | 'queued'

interface FinishModalLabels {
  finishTitle: string
  finishBody: string
  finishNoteLabel: string
  finishNotePlaceholder: string
  finishHint: string
  close: string
  finishSubmitting: string
  finishNotNow: string
  finishSubmit: string
  finishAndShare: string
  finishSavingTitle: string
  finishSavingBody: string
  finishErrorTitle: string
  finishRetry: string
  finishDismiss: string
  finishQueuedTitle: string
  finishQueuedBody: string
  finishQueuedContinue: string
  finishRetrySync: string
}

interface WorkoutSessionFinishModalProps {
  visible: boolean
  state: WorkoutSessionFinishModalState
  errorMessage: string | null
  queuedDetail: string | null
  effortRating: number | null
  sessionNote: string
  labels: FinishModalLabels
  effortLabelForRating: (rating: number) => string
  overlayStyle: StyleProp<ViewStyle>
  cardStyle: StyleProp<ViewStyle>
  onRequestClose: () => void
  onSelectEffortRating: (rating: number) => void
  onChangeSessionNote: (value: string) => void
  onClose: () => void
  onFinishNotNow: () => void
  onFinishWithMeta: () => void
  onFinishAndShare: () => void
  onRetry: () => void
  onRetrySync: () => void
  onContinueAfterQueued: () => void
}

export function WorkoutSessionFinishModal({
  visible,
  state,
  errorMessage,
  queuedDetail,
  effortRating,
  sessionNote,
  labels,
  effortLabelForRating,
  overlayStyle,
  cardStyle,
  onRequestClose,
  onSelectEffortRating,
  onChangeSessionNote,
  onClose,
  onFinishNotNow,
  onFinishWithMeta,
  onFinishAndShare,
  onRetry,
  onRetrySync,
  onContinueAfterQueued,
}: WorkoutSessionFinishModalProps) {
  const isConfirmState = state === 'confirm'

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={overlayStyle}>
        <View style={cardStyle} testID="workoutSession:finishModal">
          {state === 'confirm' ? (
            <>
              <Text variant="h3">{labels.finishTitle}</Text>
              <Text marginTop="xs" variant="bodySm" color="textMuted">
                {labels.finishBody}
              </Text>

              <Box marginTop="md" gap="xs">
                {[1, 2, 3, 4, 5].map((rating) => {
                  const selected = effortRating === rating
                  const label = effortLabelForRating(rating)
                  return (
                    <Pressable
                      key={rating}
                      onPress={() => onSelectEffortRating(rating)}
                      borderWidth={1}
                      borderColor={selected ? 'accent' : 'borderDefault'}
                      borderRadius="md"
                      paddingHorizontal="md"
                      paddingVertical="sm"
                      backgroundColor={selected ? 'accentMuted' : 'surface'}
                      accessibilityRole="button"
                      accessibilityLabel={`${rating} ${label}`}
                    >
                      {({ pressed }) => (
                        <Box
                          flexDirection="row"
                          justifyContent="space-between"
                          opacity={pressed ? 0.85 : 1}
                        >
                          <Text variant="label">{rating}</Text>
                          <Text variant="bodySm" color="textMuted">
                            {label}
                          </Text>
                        </Box>
                      )}
                    </Pressable>
                  )
                })}
              </Box>

              <Text marginTop="md" marginBottom="xs" variant="labelSm" color="textMuted">
                {labels.finishNoteLabel}
              </Text>
              <Input
                value={sessionNote}
                onChangeText={onChangeSessionNote}
                placeholder={labels.finishNotePlaceholder}
                editable={isConfirmState}
              />

              {effortRating === null ? (
                <Text marginTop="xs" variant="micro" color="textMuted">
                  {labels.finishHint}
                </Text>
              ) : null}

              <Box marginTop="sm">
                <Button title={labels.close} variant="ghost" onPress={onClose} />
              </Box>

              <Box flexDirection="row" gap="sm" marginTop="lg">
                <Box flex={1}>
                  <Button
                    title={labels.finishNotNow}
                    variant="secondary"
                    onPress={onFinishNotNow}
                  />
                </Box>
                <Box flex={1}>
                  <Button
                    testID="workoutSession:finishSubmitButton"
                    title={labels.finishSubmit}
                    onPress={onFinishWithMeta}
                    disabled={effortRating === null}
                  />
                </Box>
              </Box>
              <Box marginTop="sm">
                <Button title={labels.finishAndShare} variant="ghost" onPress={onFinishAndShare} />
              </Box>
            </>
          ) : null}

          {state === 'saving' ? (
            <Box
              alignItems="center"
              justifyContent="center"
              paddingVertical="lg"
              testID="workoutSession:finishModal:savingState"
            >
              <ActivityIndicator />
              <Text marginTop="md" variant="h3">
                {labels.finishSavingTitle}
              </Text>
              <Text marginTop="xs" variant="bodySm" color="textMuted" textAlign="center">
                {labels.finishSavingBody}
              </Text>
            </Box>
          ) : null}

          {state === 'error' ? (
            <Box testID="workoutSession:finishModal:errorState">
              <Text variant="h3">{labels.finishErrorTitle}</Text>
              <Text
                marginTop="xs"
                variant="bodySm"
                color="error"
                testID="workoutSession:finishModal:errorMessage"
              >
                {errorMessage ?? labels.finishSavingBody}
              </Text>
              <Box flexDirection="row" gap="sm" marginTop="lg">
                <Box flex={1}>
                  <Button
                    title={labels.finishDismiss}
                    variant="secondary"
                    onPress={onClose}
                    testID="workoutSession:finishModal:dismissButton"
                  />
                </Box>
                <Box flex={1}>
                  <Button
                    title={labels.finishRetry}
                    onPress={onRetry}
                    testID="workoutSession:finishModal:retryButton"
                  />
                </Box>
              </Box>
            </Box>
          ) : null}

          {state === 'queued' ? (
            <Box testID="workoutSession:finishModal:queuedState">
              <Text variant="h3">{labels.finishQueuedTitle}</Text>
              <Text marginTop="xs" variant="bodySm" color="textMuted">
                {labels.finishQueuedBody}
              </Text>
              {queuedDetail ? (
                <Text
                  marginTop="md"
                  variant="bodySm"
                  color="warning"
                  testID="workoutSession:finishModal:queuedDetail"
                >
                  {queuedDetail}
                </Text>
              ) : null}
              <Box flexDirection="row" gap="sm" marginTop="lg">
                <Box flex={1}>
                  <Button
                    title={labels.finishQueuedContinue}
                    variant="secondary"
                    onPress={onContinueAfterQueued}
                    testID="workoutSession:finishModal:queuedContinueButton"
                  />
                </Box>
                <Box flex={1}>
                  <Button
                    title={labels.finishRetrySync}
                    onPress={onRetrySync}
                    testID="workoutSession:finishModal:retrySyncButton"
                  />
                </Box>
              </Box>
            </Box>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}
