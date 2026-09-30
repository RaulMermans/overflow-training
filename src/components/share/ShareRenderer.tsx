import type { RefObject } from 'react'
import { View, StyleSheet } from 'react-native'
import { useTheme } from '@shopify/restyle'
import type Svg from 'react-native-svg'
import type { WorkoutShareData } from '../../features/share/buildWorkoutShareData'
import type { Theme } from '../../theme/restyleTheme'
import { ScrimOverlay } from '../ui/ScrimOverlay'
import { WorkoutShareCardSvg } from './WorkoutShareCardSvg'

interface ShareRendererLabels {
  duration: string
  volume: string
  streak: string
  topLifts: string
  prBadge: string
  noTopLifts: string
}

interface ShareRendererProps {
  data: WorkoutShareData
  labels: ShareRendererLabels
  svgRef?: RefObject<Svg | null>
  variant?: 'poster' | 'sticker'
}

export function ShareRenderer({ data, labels, svgRef, variant = 'poster' }: ShareRendererProps) {
  const theme = useTheme<Theme>()
  const themeColors = {
    backgroundTop: theme.colors.background,
    backgroundBottom: theme.colors.backgroundSecondary,
    panel: theme.colors.surface,
    textPrimary: theme.colors.textPrimary,
    textMuted: theme.colors.textMuted,
    divider: theme.colors.borderSubtle,
    accent: theme.colors.textSecondary,
    accentMuted: theme.colors.borderSubtle,
    accentText: theme.colors.textPrimary,
  }

  return (
    <View style={styles.root}>
      {variant === 'poster' ? <ScrimOverlay tone="medium" /> : null}
      <WorkoutShareCardSvg data={data} labels={labels} themeColors={themeColors} svgRef={svgRef} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
  },
})
