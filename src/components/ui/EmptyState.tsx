import { useEffect, useRef, type ReactNode } from 'react'
import { Animated } from 'react-native'
import { motion } from '../../theme'
import { shouldAnimate, useReducedMotion } from '../../lib/motion'
import { Box } from './Box'
import { Button } from './Button'
import { Text } from './Text'

interface EmptyStateProps {
  title: string
  message?: string
  body?: string
  icon?: ReactNode
  ctaLabel?: string
  onCtaPress?: () => void
  testID?: string
  ctaTestID?: string
}

export function EmptyState({
  title,
  message,
  body,
  icon,
  ctaLabel,
  onCtaPress,
  testID,
  ctaTestID,
}: EmptyStateProps) {
  const description = body ?? message ?? ''
  const reducedMotion = useReducedMotion()
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(12)).current

  useEffect(() => {
    if (!shouldAnimate(reducedMotion)) {
      opacity.setValue(1)
      translateY.setValue(0)
      return
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.duration.normal,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.duration.normal,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }),
    ]).start()
  }, [opacity, reducedMotion, translateY])

  return (
    <Animated.View testID={testID} style={{ opacity, transform: [{ translateY }] }}>
      <Box alignItems="center" justifyContent="center" paddingVertical="3xl">
        {icon ? <Box marginBottom="sm">{icon}</Box> : null}
        <Text variant="h3">{title}</Text>
        <Text marginTop="sm" variant="bodySm" color="textMuted" textAlign="center">
          {description}
        </Text>
        {ctaLabel && onCtaPress ? (
          <Button testID={ctaTestID} marginTop="lg" title={ctaLabel} onPress={onCtaPress} />
        ) : null}
      </Box>
    </Animated.View>
  )
}
