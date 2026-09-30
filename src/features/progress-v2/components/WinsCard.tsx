import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '../../../components/ui/Text'
import { useI18n } from '../../../i18n/useI18n'
import { colors, elevation, radii, space, type } from '../../../theme/tokens'
import type { ProgressWin } from '../winsModel'

type Props = {
  wins: ProgressWin[]
}

const WIN_VARIANT_STYLE: Record<ProgressWin['variant'], { iconBg: string; iconColor: string }> = {
  positive: {
    iconBg: colors.semantic.successMuted,
    iconColor: colors.semantic.success,
  },
  neutral: {
    iconBg: colors.accent.primaryMuted,
    iconColor: colors.accent.tertiary,
  },
}

const WIN_ICON: Record<ProgressWin['icon'], keyof typeof Ionicons.glyphMap> = {
  trophy: 'trophy',
  trend: 'trending-up',
  consistency: 'flame',
  return: 'refresh',
}

export function WinsCard({ wins }: Props) {
  const { t } = useI18n()

  if (wins.length === 0) return null

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('progress.v2.wins.title')}</Text>

      <View style={styles.list}>
        {wins.map((win) => {
          const variantStyle = WIN_VARIANT_STYLE[win.variant]
          return (
            <View key={win.id} style={styles.row}>
              <View style={[styles.icon, { backgroundColor: variantStyle.iconBg }]}>
                <Ionicons name={WIN_ICON[win.icon]} size={11} color={variantStyle.iconColor} />
              </View>

              <View style={styles.textColumn}>
                <Text style={styles.rowTitle}>{t(win.title.key, win.title.params)}</Text>
                <Text style={styles.rowBody}>{t(win.body.key, win.body.params)}</Text>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space[4],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: space[4],
    gap: space[3],
    ...elevation.sm,
  },
  title: {
    ...type.label,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 11,
  },
  list: {
    gap: space[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  icon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textColumn: {
    flex: 1,
    gap: space[1],
  },
  rowTitle: {
    ...type.labelSm,
    color: colors.text.primary,
  },
  rowBody: {
    ...type.bodySm,
    color: colors.text.muted,
    lineHeight: 18,
  },
})
