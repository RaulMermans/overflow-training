import { Box, Button, Card, Text } from '../../../components/ui'
import type { TodayTranslateFn } from '../useTodayScreenData'

interface CheckinDueCardProps {
  isTablet: boolean
  checkinDueDateLabel: string | null
  onPress: () => void
  t: TodayTranslateFn
}

export function CheckinDueCard({ isTablet, checkinDueDateLabel, onPress, t }: CheckinDueCardProps) {
  return (
    <Card variant={isTablet ? 'elevated' : 'surface'} animateOnMount>
      <Text variant="label">{t('today.checkinDue.title')}</Text>
      <Text marginTop="xs" variant="bodySm" color="textMuted">
        {checkinDueDateLabel
          ? t('today.checkinDue.bodyDue', { date: checkinDueDateLabel })
          : t('today.checkinDue.bodyNoDate')}
      </Text>
      <Box marginTop="md">
        <Button title={t('today.checkinDue.cta')} onPress={onPress} />
      </Box>
    </Card>
  )
}
