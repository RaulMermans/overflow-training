import type { RefObject } from 'react'
import Svg, { Circle, Defs, LinearGradient, Rect, Stop, Text as SvgText, G } from 'react-native-svg'
import type { WeeklyShareData } from '../../features/share/buildWeeklyShareData'
import { colors } from '../../theme/tokens'
import type { WorkoutShareCardThemeColors } from './WorkoutShareCardSvg'

interface WeeklyShareCardSvgProps {
  data: WeeklyShareData
  labels: {
    title: string
    volume: string
    streak: string
    sessions: string
  }
  themeColors?: WorkoutShareCardThemeColors
  svgRef?: RefObject<Svg | null>
  width?: number
  height?: number
}

const defaultThemeColors: WorkoutShareCardThemeColors = {
  backgroundTop: colors.bg.primary,
  backgroundBottom: colors.bg.secondary,
  panel: colors.bg.surface,
  textPrimary: colors.text.primary,
  textMuted: colors.text.muted,
  divider: colors.border.subtle,
  accent: colors.accent.primary,
  accentMuted: colors.accent.primaryMuted,
  accentText: colors.text.primary,
}

export function WeeklyShareCardSvg({
  data,
  labels,
  themeColors,
  svgRef,
  width = 1080,
  height = 1350,
}: WeeklyShareCardSvgProps) {
  const palette = themeColors ?? defaultThemeColors
  const cardPadding = 80
  const contentWidth = width - cardPadding * 2

  const rhythmY = 640
  const dotRadius = 28
  const dotSpacing = contentWidth / 7
  const dotStartX = cardPadding + dotSpacing / 2

  return (
    <Svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id="bgGradient" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.backgroundTop} />
          <Stop offset="1" stopColor={palette.backgroundBottom} />
        </LinearGradient>
      </Defs>

      <Rect x={0} y={0} width={width} height={height} fill="url(#bgGradient)" />
      <Rect x={40} y={40} width={width - 80} height={height - 80} rx={42} fill={palette.panel} />

      {/* Accent rule */}
      <Rect x={cardPadding} y={108} width={132} height={4} rx={2} fill={palette.accent} />

      {/* Title */}
      <SvgText
        x={cardPadding}
        y={190}
        fontSize={40}
        fontWeight="600"
        fill={palette.textMuted}
        letterSpacing={3}
      >
        {labels.title.toUpperCase()}
      </SvgText>

      {/* Week range */}
      <SvgText x={cardPadding} y={240} fontSize={28} fontWeight="500" fill={palette.textMuted}>
        {data.weekLabel}
      </SvgText>

      {/* Hero sessions count */}
      <SvgText x={cardPadding} y={480} fontSize={176} fontWeight="700" fill={palette.textPrimary}>
        {data.sessionsCompleted}
      </SvgText>
      <SvgText x={cardPadding} y={540} fontSize={48} fontWeight="500" fill={palette.textMuted}>
        {`/ ${data.weeklyGoal} ${labels.sessions.toLowerCase()}`}
      </SvgText>

      {/* Week rhythm dots */}
      <G>
        {data.weekRhythm.map((day, index) => {
          const cx = dotStartX + index * dotSpacing
          return (
            <G key={`day-${index}`}>
              <Circle
                cx={cx}
                cy={rhythmY}
                r={dotRadius}
                fill={day.completed ? colors.accent.secondary : colors.bg.tertiary}
              />
              <SvgText
                x={cx}
                y={rhythmY + dotRadius + 30}
                fontSize={20}
                fontWeight="500"
                fill={palette.textMuted}
                textAnchor="middle"
              >
                {day.label}
              </SvgText>
            </G>
          )
        })}
      </G>

      {/* Stats box */}
      <G transform={`translate(${cardPadding}, 780)`}>
        <Rect x={0} y={0} width={contentWidth} height={196} rx={28} fill={palette.backgroundTop} />
        <Rect x={contentWidth / 2} y={34} width={1} height={128} fill={palette.divider} />

        <G transform={`translate(${contentWidth / 4}, 74)`}>
          <SvgText
            x={0}
            y={0}
            fontSize={22}
            fontWeight="600"
            fill={palette.textMuted}
            textAnchor="middle"
          >
            {labels.volume.toUpperCase()}
          </SvgText>
          <SvgText
            x={0}
            y={52}
            fontSize={48}
            fontWeight="700"
            fill={palette.textPrimary}
            textAnchor="middle"
          >
            {`${Math.round(data.totalVolume).toLocaleString()} ${data.units}`}
          </SvgText>
        </G>

        <G transform={`translate(${(contentWidth / 4) * 3}, 74)`}>
          <SvgText
            x={0}
            y={0}
            fontSize={22}
            fontWeight="600"
            fill={palette.textMuted}
            textAnchor="middle"
          >
            {labels.streak.toUpperCase()}
          </SvgText>
          <SvgText
            x={0}
            y={52}
            fontSize={48}
            fontWeight="700"
            fill={palette.accent}
            textAnchor="middle"
          >
            {`${data.currentStreak}d`}
          </SvgText>
        </G>
      </G>

      {/* Footer */}
      <G transform={`translate(${width / 2}, ${height - 100})`}>
        <Rect x={-100} y={-30} width={200} height={2} fill={palette.divider} />
        <SvgText
          x={0}
          y={30}
          fontSize={22}
          fontWeight="600"
          fill={palette.textMuted}
          textAnchor="middle"
        >
          Overflow
        </SvgText>
      </G>
    </Svg>
  )
}
