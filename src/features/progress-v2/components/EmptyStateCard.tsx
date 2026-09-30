import React from 'react'
import { StyleSheet, View } from 'react-native'
import { colors, radii, space, type } from '../../../theme/tokens'
import { Text } from '../../../components/ui/Text'
import { useI18n } from '../../../i18n/useI18n'

type Props = {
  title: string
  body?: string
  /** Number of workouts needed before this section unlocks */
  unlocksAfter?: number
}

export function EmptyStateCard({ title, body, unlocksAfter }: Props) {
  const { t } = useI18n()

  const subtitle = body
    ? body
    : unlocksAfter != null
      ? unlocksAfter !== 1
        ? t('progress.v2.unlockAfterPlural', { count: unlocksAfter })
        : t('progress.v2.unlockAfter', { count: unlocksAfter })
      : t('progress.v2.noDataPeriod')

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{subtitle}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: space[4],
    backgroundColor: colors.bg.secondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderStyle: 'dashed',
    paddingHorizontal: space[5],
    paddingVertical: space[6],
    alignItems: 'center',
    gap: space[2],
  },
  title: {
    ...type.label,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  body: {
    ...type.bodySm,
    color: colors.text.muted,
    textAlign: 'center',
  },
})
