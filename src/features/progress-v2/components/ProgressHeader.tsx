import React from 'react'
import { StyleSheet, View } from 'react-native'
import { colors, space, type } from '../../../theme/tokens'
import { Text } from '../../../components/ui/Text'
import SegmentedControl from '../../../components/ui/SegmentedControl'
import { useI18n } from '../../../i18n/useI18n'
import type { ProgressLens, TimeRange } from '../progressModel'

type Props = {
  selectedRange: TimeRange
  onRangeChange: (range: TimeRange) => void
  selectedLens: ProgressLens
  onLensChange: (lens: ProgressLens) => void
}

export function ProgressHeader({
  selectedRange,
  onRangeChange,
  selectedLens,
  onLensChange,
}: Props) {
  const { t } = useI18n()

  const rangeOptions: { label: string; value: string }[] = [
    { label: '4W', value: '4W' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
  ]

  const lensOptions: { label: string; value: string }[] = [
    { label: t('progress.v2.lens.overview'), value: 'overview' },
    { label: t('progress.v2.lens.strength'), value: 'strength' },
    { label: t('progress.v2.lens.body'), value: 'body' },
  ]

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('progress.v2.title')}</Text>
      <Text style={styles.subtitle}>{t('progress.v2.subtitle')}</Text>
      <SegmentedControl
        options={lensOptions}
        value={selectedLens}
        onChange={(value) => onLensChange(value as ProgressLens)}
      />
      <SegmentedControl
        options={rangeOptions}
        value={selectedRange}
        onChange={(v) => onRangeChange(v as TimeRange)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
    paddingBottom: space[3],
    gap: space[3],
    backgroundColor: colors.bg.primary,
  },
  title: {
    ...type.h2,
    color: colors.text.primary,
  },
  subtitle: {
    ...type.bodySm,
    color: colors.text.secondary,
    marginTop: -space[1],
    lineHeight: 20,
  },
})
