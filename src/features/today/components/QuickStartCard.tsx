import { Box, Button, Card, SectionHeader, Text } from '../../../components/ui'
import type { TodayTranslateFn } from '../useTodayScreenData'

interface QuickStartCardProps {
  isTablet: boolean
  onOpenCalendar: () => void
  onBuildRoutine: () => void
  t: TodayTranslateFn
}

export function QuickStartCard({
  isTablet,
  onOpenCalendar,
  onBuildRoutine,
  t,
}: QuickStartCardProps) {
  return (
    <>
      <SectionHeader title={t('today.quickStart')} variant="dense" />

      <Card variant={isTablet ? 'elevated' : 'surface'}>
        <Text variant="label">{t('today.noScheduleNudge')}</Text>
        <Text marginTop="xs" variant="bodySm" color="textMuted">
          {t('today.noScheduleNudgeBody')}
        </Text>
        <Box marginTop="md">
          <Button title={t('today.noScheduleNudgeCta')} onPress={onOpenCalendar} />
        </Box>
        <Box marginTop="sm">
          <Button title={t('today.createRoutine')} variant="secondary" onPress={onBuildRoutine} />
        </Box>
      </Card>
    </>
  )
}
