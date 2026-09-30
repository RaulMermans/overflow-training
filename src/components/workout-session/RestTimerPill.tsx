import { formatRestCountdown } from '../../features/workoutSession/restTimer'
import { Box } from '../ui/Box'
import { Pressable } from '../ui/Pressable'
import { Text } from '../ui/Text'

interface RestTimerPillProps {
  remainingSeconds: number
  isRunning: boolean
  onPauseResume: () => void
  onAddSeconds: () => void
  onSkip: () => void
}

interface PillActionProps {
  label: string
  onPress: () => void
}

function PillAction({ label, onPress }: PillActionProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      minHeight={30}
      borderRadius="full"
      borderWidth={1}
      borderColor="borderDefault"
      backgroundColor="surfaceElevated"
      paddingHorizontal="sm"
      justifyContent="center"
      alignItems="center"
    >
      {({ pressed }) => (
        <Text variant="labelSm" color="textSecondary" opacity={pressed ? 0.8 : 1}>
          {label}
        </Text>
      )}
    </Pressable>
  )
}

export function RestTimerPill({
  remainingSeconds,
  isRunning,
  onPauseResume,
  onAddSeconds,
  onSkip,
}: RestTimerPillProps) {
  return (
    <Box
      borderRadius="full"
      borderWidth={1}
      borderColor="borderDefault"
      backgroundColor="surface"
      paddingHorizontal="md"
      paddingVertical="sm"
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      gap="md"
    >
      <Box>
        <Text variant="labelSm" color="textMuted">
          Rest
        </Text>
        <Text variant="label">{formatRestCountdown(remainingSeconds)}</Text>
      </Box>
      <Box flexDirection="row" alignItems="center" gap="sm">
        <PillAction label={isRunning ? 'Pause' : 'Resume'} onPress={onPauseResume} />
        <PillAction label="+15s" onPress={onAddSeconds} />
        <PillAction label="Skip" onPress={onSkip} />
      </Box>
    </Box>
  )
}
