import { useRef, useEffect } from 'react'
import { View, StyleSheet, Animated } from 'react-native'
import { colors } from '../../theme'

interface ProgressBarProps {
  value: number
  height?: number
  color?: string
  animated?: boolean
}

export default function ProgressBar({
  value,
  height = 4,
  color = colors.accent.primary,
  animated = true,
}: ProgressBarProps) {
  const animatedWidth = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (animated) {
      Animated.timing(animatedWidth, {
        toValue: Math.min(Math.max(value, 0), 100),
        duration: 300,
        useNativeDriver: false,
      }).start()
    } else {
      animatedWidth.setValue(value)
    }
  }, [value, animated])

  const widthInterpolated = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  })

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            width: widthInterpolated,
            height,
            borderRadius: height / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.bg.elevated,
    overflow: 'hidden',
  },
  fill: {},
})
