import { useEffect, useRef } from 'react'
import { Animated, StyleSheet } from 'react-native'
import { colors, motion, spacing } from '../../../theme'
import { shouldAnimate } from '../../../lib/motion'
import { Box } from '../../../components/ui/Box'
import { Text } from '../../../components/ui/Text'

interface MilestoneToastProps {
  visible: boolean
  label: string
  message: string
  reducedMotion: boolean | null | undefined
}

export function MilestoneToast({ visible, label, message, reducedMotion }: MilestoneToastProps) {
  const translateY = useRef(new Animated.Value(60)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      if (!shouldAnimate(Boolean(reducedMotion))) {
        translateY.setValue(0)
        opacity.setValue(1)
        return
      }
      translateY.setValue(60)
      opacity.setValue(0)
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: motion.duration.slow,
          easing: motion.easing.easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.duration.slow,
          easing: motion.easing.easeOut,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      if (!shouldAnimate(Boolean(reducedMotion))) {
        translateY.setValue(60)
        opacity.setValue(0)
        return
      }
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 60,
          duration: motion.duration.normal,
          easing: motion.easing.easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: motion.duration.normal,
          easing: motion.easing.easeOut,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [visible, reducedMotion, translateY, opacity])

  if (!visible && !shouldAnimate(Boolean(reducedMotion))) return null

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }], opacity }]}
      pointerEvents="none"
    >
      <Box
        flexDirection="row"
        alignItems="center"
        paddingVertical="sm"
        paddingHorizontal="lg"
        style={styles.card}
      >
        <Box style={styles.accentBorder} />
        <Box marginLeft="sm" flex={1}>
          <Text variant="label" color="textPrimary">
            {label}
          </Text>
          <Text variant="micro" color="textMuted">
            {message}
          </Text>
        </Box>
      </Box>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: spacing[5],
    right: spacing[5],
    zIndex: 100,
  },
  card: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 10,
    shadowColor: colors.shadow.default,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  accentBorder: {
    width: 2,
    height: '100%',
    minHeight: 28,
    backgroundColor: colors.accent.secondary,
    borderRadius: 1,
  },
})
