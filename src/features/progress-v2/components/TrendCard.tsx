import React, { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors, elevation, radii, space, type } from '../../../theme/tokens'
import { Text } from '../../../components/ui/Text'
import type { WeekPoint } from '../../../features/analytics'

// ── Bar chart implementation (View-based, no SVG dependency) ─────────

type BarProps = {
  value: number
  maxValue: number
  /** Whether to highlight as the rightmost (most recent) bar */
  isLatest?: boolean
  /** Whether this is a zero-filled gap (lighter colour) */
  isFilled?: boolean
}

const BAR_CHART_HEIGHT = 64

function Bar({ value, maxValue, isLatest, isFilled }: BarProps) {
  const heightPct = maxValue > 0 ? Math.max(value / maxValue, 0.03) : 0.03
  const barHeight = Math.round(BAR_CHART_HEIGHT * heightPct)

  const fill = isLatest
    ? colors.accent.primary
    : isFilled
      ? colors.border.subtle
      : colors.accent.tertiaryMuted

  return (
    <View style={styles.barWrapper}>
      <View
        style={{
          height: barHeight,
          backgroundColor: fill,
          borderRadius: 3,
          width: '100%',
        }}
      />
    </View>
  )
}

// ── TrendCard ────────────────────────────────────────────────────────

type Props = {
  /** Card title, e.g. "Weekly Volume" */
  title: string
  /** Summary value shown top-right (already formatted) */
  summaryValue?: string
  /** Sub-label for the summary, e.g. unit */
  summaryLabel?: string
  /** Data series to render */
  series: WeekPoint[]
  /** Colour of the most recent bar; defaults to accent.primary */
  accentColor?: string
}

export function TrendCard({ title, summaryValue, summaryLabel, series }: Props) {
  const maxValue = useMemo(() => Math.max(...series.map((p) => p.value), 1), [series])

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {summaryValue != null && (
          <View style={styles.summary}>
            <Text style={styles.summaryValue}>{summaryValue}</Text>
            {summaryLabel != null && <Text style={styles.summaryLabel}> {summaryLabel}</Text>}
          </View>
        )}
      </View>

      {/* Bar chart */}
      <View style={[styles.chartArea, { height: BAR_CHART_HEIGHT }]}>
        {series.map((point, i) => (
          <Bar
            key={point.weekStart}
            value={point.value}
            maxValue={maxValue}
            isLatest={i === series.length - 1}
            isFilled={point.isFilled}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space[4],
    backgroundColor: colors.bg.surface,
    borderRadius: radii.md,
    padding: space[4],
    ...elevation.sm,
    gap: space[3],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  title: {
    ...type.labelSm,
    color: colors.text.secondary,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  summaryValue: {
    ...type.label,
    color: colors.text.primary,
    fontWeight: '600',
  },
  summaryLabel: {
    ...type.micro,
    color: colors.text.muted,
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  barWrapper: {
    flex: 1,
    height: BAR_CHART_HEIGHT,
    justifyContent: 'flex-end',
  },
})
