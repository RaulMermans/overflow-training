import { StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '@shopify/restyle'
import type { Theme } from '../../theme/restyleTheme'

interface SunriseWashProps {
  height?: number
}

export function SunriseWash({ height = 260 }: SunriseWashProps) {
  const theme = useTheme<Theme>()

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[theme.colors.accentTertiaryMuted, theme.colors.background]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.wash, { height }]}
    />
  )
}

const styles = StyleSheet.create({
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
})
