import { useEffect, useRef } from 'react'
import { Animated, Modal, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AccentRule, Box, Button, Chip, Text } from '../../../components/ui'
import { motion } from '../../../theme/tokens'
import { fromWeightKg } from '../../../lib/units'
import type { UnitsPreference } from '../../../lib/profilePreferences'

interface CelebrationData {
  workoutTitle: string
  dateLabel: string
  durationSeconds: number
  setCount: number
  exerciseCount: number
  volumeKg: number
  units: UnitsPreference
  prExerciseNames: string[]
}

interface CelebrationLabels {
  title: string
  confirmed: string
  motivation: string
  share: string
  sharing: string
  continue: string
  volume: string
  duration: string
  sets: string
  exercises: string
  pr: string
}

interface WorkoutCompleteCelebrationProps {
  visible: boolean
  data: CelebrationData | null
  labels: CelebrationLabels
  isSharing: boolean
  shareError: string | null
  onShare: () => void
  onDismiss: () => void
  reducedMotion?: boolean
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function StatColumn({ value, label }: { value: string; label: string }) {
  return (
    <Box flex={1} alignItems="center">
      <Text variant="h2" color="textPrimary">
        {value}
      </Text>
      <Text
        variant="heroLabel"
        color="textMuted"
        marginTop="xs"
        style={{ textTransform: 'uppercase' }}
      >
        {label}
      </Text>
    </Box>
  )
}

export function WorkoutCompleteCelebration({
  visible,
  data,
  labels,
  isSharing,
  shareError,
  onShare,
  onDismiss,
  reducedMotion = false,
}: WorkoutCompleteCelebrationProps) {
  const insets = useSafeAreaInsets()
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(20)).current

  useEffect(() => {
    if (visible && !reducedMotion) {
      fadeAnim.setValue(0)
      slideAnim.setValue(20)
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: motion.duration.slow,
          easing: motion.easing.easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: motion.duration.slower,
          easing: motion.easing.easeOut,
          useNativeDriver: true,
        }),
      ]).start()
    } else if (visible) {
      fadeAnim.setValue(1)
      slideAnim.setValue(0)
    }
  }, [visible, reducedMotion, fadeAnim, slideAnim])

  if (!data) return null

  const displayVolume = Math.round(fromWeightKg(data.volumeKg, data.units))

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onDismiss}>
      <Box
        flex={1}
        backgroundColor="warmWash"
        testID="workoutSession:celebration"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Box alignItems="center" marginTop="4xl">
            <AccentRule centered />
          </Box>

          <Box alignItems="center" marginTop="3xl">
            <Text variant="display">{labels.title}</Text>
            <Text variant="labelSm" color="accent" marginTop="sm">
              {labels.confirmed}
            </Text>
            <Text variant="bodySm" color="textMuted" marginTop="sm">
              {data.workoutTitle}
            </Text>
            <Text variant="bodySm" color="textMuted" marginTop="xs">
              {data.dateLabel}
            </Text>
          </Box>

          <Box alignItems="center" marginTop="3xl">
            <Text variant="heroStat">{displayVolume.toLocaleString()}</Text>
            <Text
              variant="heroLabel"
              color="textMuted"
              marginTop="xs"
              style={{ textTransform: 'uppercase' }}
            >
              {`${labels.volume} · ${data.units.toUpperCase()}`}
            </Text>
          </Box>

          <Box
            flexDirection="row"
            marginTop="3xl"
            marginHorizontal="2xl"
            paddingVertical="xl"
            backgroundColor="surface"
            borderRadius="xl"
          >
            <StatColumn value={formatDuration(data.durationSeconds)} label={labels.duration} />
            <Box width={1} backgroundColor="borderSubtle" />
            <StatColumn value={`${data.setCount}`} label={labels.sets} />
            <Box width={1} backgroundColor="borderSubtle" />
            <StatColumn value={`${data.exerciseCount}`} label={labels.exercises} />
          </Box>

          {data.prExerciseNames.length > 0 ? (
            <Box
              flexDirection="row"
              flexWrap="wrap"
              justifyContent="center"
              gap="sm"
              marginTop="xl"
              marginHorizontal="2xl"
            >
              {data.prExerciseNames.slice(0, 3).map((name) => (
                <Chip key={name} label={`${labels.pr} · ${name}`} variant="accent" />
              ))}
            </Box>
          ) : null}

          <Box alignItems="center" marginTop="3xl">
            <Text variant="bodySm" color="textMuted">
              {labels.motivation}
            </Text>
          </Box>
        </Animated.View>

        <Box
          paddingHorizontal="2xl"
          paddingBottom="xl"
          gap="sm"
          style={{ paddingBottom: Math.max(insets.bottom, 20) + 20 }}
        >
          {shareError ? (
            <Text color="error" variant="bodySm" testID="workoutSession:celebration:shareError">
              {shareError}
            </Text>
          ) : null}
          <Button
            title={isSharing ? labels.sharing : labels.share}
            onPress={onShare}
            isLoading={isSharing}
            disabled={isSharing}
          />
          <Button
            title={labels.continue}
            variant="ghost"
            onPress={onDismiss}
            disabled={isSharing}
          />
        </Box>
      </Box>
    </Modal>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
  },
})
