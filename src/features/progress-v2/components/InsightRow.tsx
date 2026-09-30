import React, { useState } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { colors, radii, space, type } from '../../../theme/tokens'
import { Text } from '../../../components/ui/Text'
import { useI18n } from '../../../i18n/useI18n'
import type { Insight } from '../../analytics/insights/insightTypes'

const TONE_CONFIG = {
  positive: {
    bg: colors.semantic.successMuted,
    border: colors.semantic.success,
    text: colors.semantic.success,
    icon: '↑',
  },
  warning: {
    bg: colors.semantic.warningMuted,
    border: colors.semantic.warning,
    text: colors.semantic.warning,
    icon: '→',
  },
  neutral: {
    bg: colors.accent.primaryMuted,
    border: colors.accent.tertiary,
    text: colors.text.muted,
    icon: '·',
  },
} as const

type Props = { insight: Insight }

export function InsightRow({ insight }: Props) {
  const { t } = useI18n()
  const cfg = TONE_CONFIG[insight.tone]
  const hasExpandable = (insight.details && insight.details.length > 0) || !!insight.nextStep
  const [expanded, setExpanded] = useState(false)

  const content = (
    <View style={[styles.container, { backgroundColor: cfg.bg, borderLeftColor: cfg.border }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.icon, { color: cfg.border }]} accessibilityElementsHidden>
          {cfg.icon}
        </Text>
        <Text
          style={[styles.message, { color: cfg.text }]}
          numberOfLines={expanded ? undefined : 2}
        >
          {insight.message}
        </Text>
        {hasExpandable && (
          <Text style={[styles.chevron, { color: cfg.border }]}>{expanded ? '∧' : '∨'}</Text>
        )}
      </View>

      {/* Expandable section */}
      {expanded && hasExpandable && (
        <View style={styles.expandedSection}>
          {insight.details && insight.details.length > 0 && (
            <View style={styles.detailsList}>
              {insight.details.map((bullet, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={[styles.bulletDot, { color: cfg.border }]}>•</Text>
                  <Text style={[styles.bulletText, { color: cfg.text }]}>{bullet}</Text>
                </View>
              ))}
            </View>
          )}
          {insight.nextStep && (
            <View style={[styles.nextStepRow, { borderTopColor: cfg.border + '33' }]}>
              <Text style={[styles.nextStepLabel, { color: cfg.border }]}>
                {t('progress.v2.nextStep')}
              </Text>
              <Text style={[styles.nextStepText, { color: cfg.text }]}>{insight.nextStep}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )

  if (!hasExpandable) return content

  return (
    <TouchableOpacity
      onPress={() => setExpanded((prev) => !prev)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={insight.message}
      accessibilityHint={expanded ? t('progress.v2.collapseHint') : t('progress.v2.expandHint')}
    >
      {content}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 2,
    borderRadius: radii.sm,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    marginTop: space[3],
    gap: space[2],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  icon: {
    ...type.labelSm,
    lineHeight: 21,
  },
  message: {
    flex: 1,
    ...type.bodySm,
    lineHeight: 20,
  },
  chevron: {
    ...type.micro,
    lineHeight: 21,
    paddingTop: 1,
  },
  expandedSection: {
    gap: space[2],
    paddingLeft: space[4],
  },
  detailsList: {
    gap: space[1],
  },
  bulletRow: {
    flexDirection: 'row',
    gap: space[2],
  },
  bulletDot: {
    ...type.micro,
    lineHeight: 18,
  },
  bulletText: {
    flex: 1,
    ...type.micro,
    lineHeight: 18,
  },
  nextStepRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space[2],
    gap: space[1],
  },
  nextStepLabel: {
    ...type.micro,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  nextStepText: {
    ...type.bodySm,
    lineHeight: 18,
  },
})
