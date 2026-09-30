import type { RefObject } from 'react'
import Svg, { Circle, Defs, LinearGradient, Rect, Stop, Text as SvgText, G } from 'react-native-svg'
import type { MonthlyShareData } from '../../features/share/buildMonthlyShareData'
import { colors } from '../../theme/tokens'
import type { WorkoutShareCardThemeColors } from './WorkoutShareCardSvg'

interface MonthlyShareCardSvgProps {
  data: MonthlyShareData
  labels: {
    sessions: string
    volume: string
    streak: string
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

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function MonthlyShareCardSvg({
  data,
  labels,
  themeColors,
  svgRef,
  width = 1080,
  height = 1350,
}: MonthlyShareCardSvgProps) {
  const palette = themeColors ?? defaultThemeColors
  const cardPadding = 80
  const contentWidth = width - cardPadding * 2

  // Calendar grid layout
  const gridStartY = 380
  const cellSize = contentWidth / 7
  const dotRadius = 22
  const completedSet = new Set(data.completedDayNumbers)

  // Build grid rows
  const gridCells: { day: number; col: number; row: number }[] = []
  let currentRow = 0
  let currentCol = data.firstDayOffset

  for (let day = 1; day <= data.daysInMonth; day++) {
    gridCells.push({ day, col: currentCol, row: currentRow })
    currentCol++
    if (currentCol >= 7) {
      currentCol = 0
      currentRow++
    }
  }

  const totalRows = currentRow + (currentCol > 0 ? 1 : 0)
  const gridHeight = totalRows * (dotRadius * 2 + 16) + 40

  // Stats position below grid
  const statsY = gridStartY + gridHeight + 60

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

      {/* Month name — large editorial */}
      <SvgText x={cardPadding} y={230} fontSize={96} fontWeight="700" fill={palette.textPrimary}>
        {data.monthLabel}
      </SvgText>

      {/* Year */}
      <SvgText x={cardPadding} y={280} fontSize={28} fontWeight="500" fill={palette.textMuted}>
        {data.yearLabel}
      </SvgText>

      {/* Weekday headers */}
      <G transform={`translate(${cardPadding}, ${gridStartY - 30})`}>
        {WEEKDAY_LABELS.map((label, index) => (
          <SvgText
            key={`wk-${index}`}
            x={index * cellSize + cellSize / 2}
            y={0}
            fontSize={18}
            fontWeight="600"
            fill={palette.textMuted}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}
      </G>

      {/* Calendar grid */}
      <G transform={`translate(${cardPadding}, ${gridStartY})`}>
        {gridCells.map(({ day, col, row }) => {
          const cx = col * cellSize + cellSize / 2
          const cy = row * (dotRadius * 2 + 16) + dotRadius
          const isCompleted = completedSet.has(day)

          return (
            <G key={`day-${day}`}>
              <Circle
                cx={cx}
                cy={cy}
                r={dotRadius}
                fill={isCompleted ? colors.accent.secondary : colors.bg.tertiary}
              />
              <SvgText
                x={cx}
                y={cy + 6}
                fontSize={18}
                fontWeight={isCompleted ? '700' : '500'}
                fill={isCompleted ? palette.panel : palette.textMuted}
                textAnchor="middle"
              >
                {day}
              </SvgText>
            </G>
          )
        })}
      </G>

      {/* Stats row */}
      <G transform={`translate(${cardPadding}, ${statsY})`}>
        <Rect x={0} y={0} width={contentWidth} height={196} rx={28} fill={palette.backgroundTop} />
        <Rect x={contentWidth / 3} y={34} width={1} height={128} fill={palette.divider} />
        <Rect x={(contentWidth / 3) * 2} y={34} width={1} height={128} fill={palette.divider} />

        <G transform={`translate(${contentWidth / 6}, 74)`}>
          <SvgText
            x={0}
            y={0}
            fontSize={22}
            fontWeight="600"
            fill={palette.textMuted}
            textAnchor="middle"
          >
            {labels.sessions.toUpperCase()}
          </SvgText>
          <SvgText
            x={0}
            y={52}
            fontSize={48}
            fontWeight="700"
            fill={palette.textPrimary}
            textAnchor="middle"
          >
            {data.totalSessions}
          </SvgText>
        </G>

        <G transform={`translate(${contentWidth / 2}, 74)`}>
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
            {`${Math.round(data.totalVolume).toLocaleString()}`}
          </SvgText>
        </G>

        <G transform={`translate(${(contentWidth / 6) * 5}, 74)`}>
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
            {`${data.longestStreak}d`}
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
