import { Animated, Modal, View, type StyleProp, type ViewStyle } from 'react-native'
import { Box, Button, Text } from '../../../components/ui'
import ProgressBar from '../../../components/ui/ProgressBar'
import { formatRestCountdown, type RestTimerState } from '../restTimer'
import { colors } from '../../../theme'
import type { WorkoutSetType } from '../../../db/workouts'

type WorkoutMode = 'WORK' | 'REST' | 'PAUSED' | 'NEXT_UP'

type NextUpPreview = {
  exerciseId: string
  exerciseName: string
  setIndex: number
  setType: WorkoutSetType | null
  remainingSets: number
}

interface RestTimerLabels {
  restNextUpTitle: string
  restPausedTitle: string
  restTitle: string
  nextUpLabel: string
  nextUpSet: (index: number) => string
  nextUpNone: string
  continueLabel: string
  restPause: string
  restResume: string
  skip: string
  setsRemaining: (count: number) => string
  lastSet: string
  coachingTakeTime: string
  coachingAlmostDone: string
}

interface WorkoutSessionRestTimerUIProps {
  visible: boolean
  reducedMotion: boolean
  workoutMode: WorkoutMode
  tickScale: Animated.Value
  restTimer: RestTimerState | null
  restTimerTotalSeconds: number
  nextUpPreview: NextUpPreview | null
  labels: RestTimerLabels
  overlayStyle: StyleProp<ViewStyle>
  cardStyle: StyleProp<ViewStyle>
  onRequestClose: () => void
  onContinue: () => void
  onAddRestTime: () => void
  onSubtractRestTime: () => void
  onPauseResumeRestTimer: () => void
  onSkipRestTimer: () => void
}

export function WorkoutSessionRestTimerUI({
  visible,
  reducedMotion,
  workoutMode,
  tickScale,
  restTimer,
  restTimerTotalSeconds,
  nextUpPreview,
  labels,
  overlayStyle,
  cardStyle,
  onRequestClose,
  onContinue,
  onAddRestTime,
  onSubtractRestTime,
  onPauseResumeRestTimer,
  onSkipRestTimer,
}: WorkoutSessionRestTimerUIProps) {
  const remaining = restTimer?.remainingSeconds ?? 0
  const elapsed = Math.max(0, restTimerTotalSeconds - remaining)
  const restPercent =
    restTimerTotalSeconds > 0 ? Math.round((elapsed / restTimerTotalSeconds) * 100) : 0

  const remainingSets = nextUpPreview?.remainingSets ?? 0
  const remainingSetsLabel =
    remainingSets <= 1 ? labels.lastSet : labels.setsRemaining(remainingSets)
  const coachingCue = remainingSets <= 1 ? labels.coachingAlmostDone : labels.coachingTakeTime

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={onRequestClose}
    >
      <View style={overlayStyle}>
        <View style={cardStyle}>
          <Text variant="labelSm" color="textMuted">
            {workoutMode === 'NEXT_UP'
              ? labels.restNextUpTitle
              : workoutMode === 'PAUSED'
                ? labels.restPausedTitle
                : labels.restTitle}
          </Text>

          {workoutMode !== 'NEXT_UP' ? (
            <>
              <Animated.View style={{ transform: [{ scale: tickScale }] }}>
                <Text
                  marginTop="sm"
                  variant="h1"
                  style={{ fontSize: 48, fontWeight: '700', letterSpacing: -1 }}
                >
                  {formatRestCountdown(remaining)}
                </Text>
              </Animated.View>
              <Box marginTop="sm">
                <ProgressBar value={restPercent} height={3} color={colors.accent.secondary} />
              </Box>
            </>
          ) : null}

          <Box marginTop="lg">
            <Text variant="labelSm" color="textMuted">
              {labels.nextUpLabel}
            </Text>
            {nextUpPreview ? (
              <>
                <Text marginTop="xs" variant="h3">
                  {nextUpPreview.exerciseName}
                </Text>
                <Text marginTop="xs" variant="bodySm" color="textMuted">
                  {labels.nextUpSet(nextUpPreview.setIndex)}
                </Text>
                <Text variant="micro" color="textMuted">
                  {remainingSetsLabel}
                </Text>
              </>
            ) : (
              <Text marginTop="xs" variant="bodySm" color="textMuted">
                {labels.nextUpNone}
              </Text>
            )}
          </Box>

          {workoutMode !== 'NEXT_UP' && nextUpPreview ? (
            <Text marginTop="sm" variant="micro" color="textMuted">
              {coachingCue}
            </Text>
          ) : null}

          {workoutMode === 'NEXT_UP' ? (
            <Box marginTop="lg">
              <Button title={labels.continueLabel} onPress={onContinue} />
            </Box>
          ) : (
            <>
              <Box marginTop="lg" flexDirection="row" gap="sm">
                <Box flex={1}>
                  <Button title="+15" variant="secondary" onPress={onAddRestTime} />
                </Box>
                <Box flex={1}>
                  <Button title="-15" variant="secondary" onPress={onSubtractRestTime} />
                </Box>
              </Box>

              <Box marginTop="sm" flexDirection="row" gap="sm">
                <Box flex={1}>
                  <Button
                    title={restTimer?.isRunning ? labels.restPause : labels.restResume}
                    variant="ghost"
                    onPress={onPauseResumeRestTimer}
                  />
                </Box>
                <Box flex={1}>
                  <Button title={labels.skip} variant="ghost" onPress={onSkipRestTimer} />
                </Box>
              </Box>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}
