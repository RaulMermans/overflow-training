import { AppHeader, Box, Pressable, Text } from '../../../components/ui'
import ProgressBar from '../../../components/ui/ProgressBar'
import { SyncStatusPill } from '../../../components/sync/SyncStatusPill'
import { RestTimerPill } from '../../../components/workout-session'
import type { RestTimerState } from '../restTimer'
import { colors, spacing } from '../../../theme'
import { useElapsedTimer } from '../useElapsedTimer'
import { formatElapsed } from '../controller/useWorkoutSessionController'

interface WorkoutSessionHeaderProps {
  title: string
  subtitle: string
  /** ISO timestamp for the session start. The header owns the 1-second tick
   *  so only it re-renders each second, not the whole workout screen. */
  sessionStartedAt: string | null
  routineLabel: string | null
  saveFeedbackLabel: string | null
  statsSetsLabel: string
  statsVolumeLabel: string
  progressLabel: string
  progressPercent: number
  coachingLabel: string | null
  showRestPill: boolean
  restTitleLabel: string
  restTimer: RestTimerState | null
  onOpenRestModal: () => void
  onPauseResumeRestTimer: () => void
  onAddRestTime: () => void
  onSkipRestTimer: () => void
}

export function WorkoutSessionHeader({
  title,
  subtitle,
  sessionStartedAt,
  routineLabel,
  saveFeedbackLabel,
  statsSetsLabel,
  statsVolumeLabel,
  progressLabel,
  progressPercent,
  coachingLabel,
  showRestPill,
  restTitleLabel,
  restTimer,
  onOpenRestModal,
  onPauseResumeRestTimer,
  onAddRestTime,
  onSkipRestTimer,
}: WorkoutSessionHeaderProps) {
  const elapsedSeconds = useElapsedTimer(sessionStartedAt)
  const elapsedFormatted = formatElapsed(elapsedSeconds)

  return (
    <Box paddingHorizontal="xl">
      <AppHeader title={title} subtitle={subtitle} meta={elapsedFormatted} variant="compact" />
      {routineLabel ? (
        <Text marginTop="xs" variant="bodySm" color="textMuted">
          {routineLabel}
        </Text>
      ) : null}
      <Box flexDirection="row" alignItems="center" justifyContent="space-between">
        <SyncStatusPill />
        {saveFeedbackLabel ? (
          <Text variant="labelSm" color="textMuted">
            {saveFeedbackLabel}
          </Text>
        ) : null}
      </Box>

      <Box marginTop="sm" flexDirection="row" alignItems="center" gap="md" flexWrap="wrap">
        <Text variant="labelSm" color="textMuted">
          {statsSetsLabel}
        </Text>
        <Text variant="labelSm" color="textMuted">
          {statsVolumeLabel}
        </Text>
        <Text variant="labelSm" color="textMuted">
          {elapsedFormatted}
        </Text>
      </Box>

      <Box marginTop="sm">
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text variant="labelSm" color="textMuted">
            {progressLabel}
          </Text>
          <Text variant="labelSm" color="textMuted">
            {progressPercent}%
          </Text>
        </Box>
        <Box marginTop="xs">
          <ProgressBar value={progressPercent} height={3} color={colors.accent.secondary} />
        </Box>
      </Box>

      {coachingLabel ? (
        <Text marginTop="xs" variant="bodySm" color="accent">
          {coachingLabel}
        </Text>
      ) : null}

      {showRestPill && restTimer ? (
        <Pressable
          onPress={onOpenRestModal}
          style={{ marginTop: spacing[2] }}
          accessibilityLabel={restTitleLabel}
          accessibilityRole="button"
          accessibilityHint="Tap to expand rest timer"
        >
          <RestTimerPill
            remainingSeconds={restTimer.remainingSeconds}
            isRunning={restTimer.isRunning}
            onPauseResume={onPauseResumeRestTimer}
            onAddSeconds={onAddRestTime}
            onSkip={onSkipRestTimer}
          />
        </Pressable>
      ) : null}
    </Box>
  )
}
