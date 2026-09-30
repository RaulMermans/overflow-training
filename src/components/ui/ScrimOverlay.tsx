import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '@shopify/restyle'
import type { Theme } from '../../theme/restyleTheme'

type ScrimTone = 'soft' | 'medium' | 'strong'

interface ScrimOverlayProps {
  tone?: ScrimTone
  style?: StyleProp<ViewStyle>
}

const toneToColor: Record<ScrimTone, keyof Theme['colors']> = {
  soft: 'scrimSoft',
  medium: 'scrimMedium',
  strong: 'scrimStrong',
}

export function ScrimOverlay({ tone = 'medium', style }: ScrimOverlayProps) {
  const theme = useTheme<Theme>()

  return (
    <View
      pointerEvents="none"
      style={[styles.fill, { backgroundColor: theme.colors[toneToColor[tone]] }, style]}
    />
  )
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
})
