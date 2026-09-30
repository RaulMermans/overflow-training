import React from 'react'
import { StyleSheet, View } from 'react-native'
import { colors, elevation, fontFamily, radii, space, type } from '../../../theme/tokens'
import { Text } from '../../../components/ui/Text'
import type { Delta } from '../../../features/analytics'

type Props = {
  /** Primary numeric value (already formatted as string) */
  value: string
  /** Short descriptor below the value */
  label: string
  /** Secondary line below the label (e.g., unit context or sub-metric) */
  sub?: string
  /** Period-over-period delta to show at bottom of card */
  delta?: Delta
  /** Highlight the card with an accent background (e.g., new PR) */
  highlight?: boolean
  accessibilityLabel?: string
}

export function MetricCard({
  value,
  label,
  sub,
  delta,
  highlight = false,
  accessibilityLabel,
}: Props) {
  const deltaColor =
    delta == null
      ? colors.text.muted
      : delta.tone === 'up'
        ? colors.semantic.success
        : delta.tone === 'down'
          ? colors.semantic.error
          : colors.text.muted

  return (
    <View
      style={[styles.card, highlight && styles.cardHighlight]}
      accessibilityLabel={accessibilityLabel}
      accessible
    >
      <Text
        style={[styles.value, highlight && styles.valueHighlight]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {sub != null ? (
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
      {delta != null ? (
        <View style={styles.deltaRow}>
          <Text style={[styles.deltaText, { color: deltaColor }]} numberOfLines={1}>
            {delta.label}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.bg.surface,
    borderRadius: radii.md,
    padding: space[4],
    minHeight: 96,
    ...elevation.sm,
    gap: 2,
  },
  cardHighlight: {
    backgroundColor: colors.accent.primaryMuted,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  value: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.3,
    color: colors.text.primary,
  },
  valueHighlight: {
    color: colors.accent.primary,
  },
  label: {
    ...type.labelSm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  sub: {
    ...type.micro,
    color: colors.text.muted,
    marginTop: 1,
  },
  deltaRow: {
    marginTop: space[1],
  },
  deltaText: {
    ...type.micro,
    fontWeight: '600',
  },
})
