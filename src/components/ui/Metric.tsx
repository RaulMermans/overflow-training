import { useEffect, useRef } from 'react'
import { Animated, StyleSheet } from 'react-native'
import { useTheme } from '@shopify/restyle'
import { motion, radius } from '../../theme'
import { shouldAnimate, useReducedMotion } from '../../lib/motion'
import type { Theme } from '../../theme/restyleTheme'
import { Box } from './Box'
import { Card } from './Card'
import { Text } from './Text'

type DeltaTone = 'up' | 'down' | 'neutral'
type MetricHighlight = 'none' | 'pr'

interface MetricProps {
  value: string | number
  label: string
  delta?: string
  deltaTone?: DeltaTone
  variant?: 'default' | 'compact'
  highlight?: MetricHighlight
}

const toneColor: Record<DeltaTone, 'success' | 'warning' | 'textMuted'> = {
  up: 'success',
  down: 'warning',
  neutral: 'textMuted',
}

const valueVariantByKind = {
  default: 'h2',
  compact: 'h3',
} as const

const cardPaddingByKind = {
  default: 'lg',
  compact: 'md',
} as const

export function Metric({
  value,
  label,
  delta,
  deltaTone = 'neutral',
  variant = 'default',
  highlight = 'none',
}: MetricProps) {
  const theme = useTheme<Theme>()
  const reducedMotion = useReducedMotion()
  const glowOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (highlight !== 'pr' || !shouldAnimate(reducedMotion)) {
      glowOpacity.setValue(0)
      return
    }

    glowOpacity.setValue(motion.opacity.glowFrom)
    Animated.sequence([
      Animated.timing(glowOpacity, {
        toValue: motion.opacity.glowTo,
        duration: motion.duration.prGlow,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: motion.opacity.glowFrom,
        duration: motion.duration.prGlow,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }),
    ]).start()
  }, [glowOpacity, highlight, reducedMotion])

  return (
    <Box position="relative">
      <Card padding={cardPaddingByKind[variant]}>
        <Text variant={valueVariantByKind[variant]}>{String(value)}</Text>
        <Text
          marginTop="xs"
          variant="bodySm"
          color="textMuted"
          numberOfLines={variant === 'compact' ? 2 : undefined}
          ellipsizeMode={variant === 'compact' ? 'tail' : undefined}
        >
          {label}
        </Text>
        {delta ? (
          <Text marginTop="sm" variant="labelSm" color={toneColor[deltaTone]}>
            {delta}
          </Text>
        ) : null}
      </Card>
      {highlight === 'pr' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              backgroundColor: theme.colors.accentMuted,
              opacity: glowOpacity,
              borderColor: theme.colors.accent,
            },
          ]}
        />
      ) : null}
    </Box>
  )
}

const styles = StyleSheet.create({
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
})
