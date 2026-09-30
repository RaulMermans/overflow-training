import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'
import { Card } from './Card'
import { Box } from './Box'

interface SkeletonCardProps {
  lines?: Array<{ width?: number | `${number}%`; height?: number }>
}

export function SkeletonCard({ lines = [{ width: '62%' }, { width: '44%' }] }: SkeletonCardProps) {
  const opacity = useRef(new Animated.Value(0.45)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    )

    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Card>
      <Animated.View style={{ opacity }}>
        <Box gap="sm">
          {lines.map((line, index) => (
            <Box
              key={`skeleton-line-${index}`}
              height={line.height ?? 12}
              borderRadius="sm"
              backgroundColor="divider"
              style={{ width: line.width ?? '100%' }}
            />
          ))}
        </Box>
      </Animated.View>
    </Card>
  )
}
