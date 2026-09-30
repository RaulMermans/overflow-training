import { useEffect, useRef } from 'react'
import type { PropsWithChildren } from 'react'
import { Animated } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { useTheme } from '@shopify/restyle'
import { motion } from '../../theme'
import { shouldAnimate, useReducedMotion } from '../../lib/motion'
import type { Theme } from '../../theme/restyleTheme'
import { Box, type BoxProps } from './Box'

interface CardProps extends PropsWithChildren<Omit<BoxProps, 'children'>> {
  variant?: 'surface' | 'elevated'
  style?: StyleProp<ViewStyle>
  animateOnMount?: boolean
  animateDelay?: number
}

export function Card({
  variant = 'surface',
  style,
  children,
  animateOnMount = false,
  animateDelay = 0,
  ...props
}: CardProps) {
  const theme = useTheme<Theme>()
  const reducedMotion = useReducedMotion()
  const opacity = useRef(new Animated.Value(1)).current
  const translateY = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!animateOnMount || !shouldAnimate(reducedMotion)) {
      opacity.setValue(1)
      translateY.setValue(0)
      return
    }

    opacity.setValue(0)
    translateY.setValue(8)

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.duration.cardEnter,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.duration.cardEnter,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }),
    ])

    if (animateDelay > 0) {
      const timer = setTimeout(() => animation.start(), animateDelay)
      return () => clearTimeout(timer)
    }

    animation.start()
  }, [animateDelay, animateOnMount, opacity, reducedMotion, translateY])

  const isElevated = variant === 'elevated'

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Box
        backgroundColor={isElevated ? 'surfaceElevated' : 'surface'}
        borderRadius="xl"
        borderWidth={isElevated ? 1 : 0}
        borderColor="borderSubtle"
        padding="lg"
        style={[theme.shadows.sm, style]}
        {...props}
      >
        {children}
      </Box>
    </Animated.View>
  )
}
