import { Fragment, type RefObject } from 'react'
import Svg, { Defs, LinearGradient, Rect, Stop, Text as SvgText, G } from 'react-native-svg'
import type { WorkoutShareData } from '../../features/share/buildWorkoutShareData'
import { colors } from '../../theme/tokens'

interface WorkoutShareCardSvgLabels {
  duration: string
  volume: string
  streak: string
  topLifts: string
  prBadge: string
  noTopLifts: string
}

export interface WorkoutShareCardThemeColors {
  backgroundTop: string
  backgroundBottom: string
  panel: string
  textPrimary: string
  textMuted: string
  divider: string
  accent: string
  accentMuted: string
  accentText: string
}

interface WorkoutShareCardSvgProps {
  data: WorkoutShareData
  labels: WorkoutShareCardSvgLabels
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

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function formatDuration(durationSeconds: number): string {
  const hours = Math.floor(durationSeconds / 3600)
  const minutes = Math.floor((durationSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function WorkoutShareCardSvg({
  data,
  labels,
  themeColors,
  svgRef,
  width = 1080,
  height = 1350,
}: WorkoutShareCardSvgProps) {
  const palette = themeColors ?? defaultThemeColors
  const cardPadding = 80
  const contentWidth = width - cardPadding * 2

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
      <Rect x={cardPadding} y={108} width={132} height={4} rx={2} fill={palette.accent} />

      <SvgText x={cardPadding} y={184} fontSize={66} fontWeight="700" fill={palette.textPrimary}>
        {truncate(data.title, 24)}
      </SvgText>

      <SvgText x={cardPadding} y={236} fontSize={28} fontWeight="500" fill={palette.textMuted}>
        {data.performedDateLabel}
      </SvgText>

      <G transform={`translate(${cardPadding}, 330)`}>
        <SvgText x={0} y={100} fontSize={176} fontWeight="700" fill={palette.textPrimary}>
          {Math.round(data.totalVolume).toLocaleString()}
        </SvgText>
        <SvgText x={0} y={160} fontSize={30} fontWeight="600" fill={palette.accent}>
          {`${labels.volume} · ${data.units.toUpperCase()}`}
        </SvgText>
      </G>

      <G transform={`translate(${cardPadding}, 560)`}>
        <Rect x={0} y={0} width={contentWidth} height={196} rx={28} fill={palette.backgroundTop} />
        <Rect x={contentWidth / 3} y={34} width={1} height={128} fill={palette.divider} />
        <Rect x={(contentWidth / 3) * 2} y={34} width={1} height={128} fill={palette.divider} />

        <BoxStat
          x={contentWidth / 6}
          y={74}
          label={labels.duration}
          value={formatDuration(data.durationSeconds)}
          palette={palette}
        />
        <BoxStat
          x={contentWidth / 2}
          y={74}
          label="Sets"
          value={`${data.setCount}`}
          palette={palette}
        />
        <BoxStat
          x={(contentWidth / 6) * 5}
          y={74}
          label={data.streakDays ? labels.streak : 'Exercises'}
          value={data.streakDays ? `${data.streakDays}d` : `${data.exerciseCount}`}
          palette={palette}
          valueColor={data.streakDays ? palette.accent : palette.textPrimary}
        />
      </G>

      <G transform={`translate(${cardPadding}, 840)`}>
        <SvgText x={0} y={0} fontSize={40} fontWeight="700" fill={palette.textPrimary}>
          {labels.topLifts}
        </SvgText>
        <Rect x={0} y={20} width={contentWidth} height={1} fill={palette.divider} />

        {data.topLifts.length === 0 ? (
          <SvgText x={0} y={88} fontSize={26} fontWeight="500" fill={palette.textMuted}>
            {labels.noTopLifts}
          </SvgText>
        ) : (
          data.topLifts.slice(0, 3).map((lift, index) => {
            const rowY = 80 + index * 132
            return (
              <Fragment key={`lift-${lift.exerciseDefinitionId}`}>
                <Rect
                  x={0}
                  y={rowY - 56}
                  width={contentWidth}
                  height={96}
                  rx={20}
                  fill={palette.backgroundTop}
                />
                <SvgText
                  x={28}
                  y={rowY - 8}
                  fontSize={32}
                  fontWeight="600"
                  fill={palette.textPrimary}
                >
                  {truncate(lift.exerciseName, 26)}
                </SvgText>
                <SvgText x={28} y={rowY + 30} fontSize={24} fontWeight="500" fill={palette.accent}>
                  {`${lift.weight} ${data.units.toLowerCase()} × ${lift.reps}`}
                </SvgText>
                {lift.isPR ? (
                  <G transform={`translate(${contentWidth - 122}, ${rowY - 42})`}>
                    <Rect width={94} height={40} rx={20} fill={palette.accentMuted} />
                    <SvgText
                      x={47}
                      y={28}
                      fontSize={18}
                      fontWeight="800"
                      fill={palette.accentText}
                      textAnchor="middle"
                    >
                      {labels.prBadge}
                    </SvgText>
                  </G>
                ) : null}
              </Fragment>
            )
          })
        )}
      </G>

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

function BoxStat({
  x,
  y,
  label,
  value,
  palette,
  valueColor,
}: {
  x: number
  y: number
  label: string
  value: string
  palette: WorkoutShareCardThemeColors
  valueColor?: string
}) {
  return (
    <G transform={`translate(${x}, ${y})`}>
      <SvgText
        x={0}
        y={0}
        fontSize={22}
        fontWeight="600"
        fill={palette.textMuted}
        textAnchor="middle"
      >
        {label}
      </SvgText>
      <SvgText
        x={0}
        y={52}
        fontSize={48}
        fontWeight="700"
        fill={valueColor ?? palette.textPrimary}
        textAnchor="middle"
      >
        {value}
      </SvgText>
    </G>
  )
}
