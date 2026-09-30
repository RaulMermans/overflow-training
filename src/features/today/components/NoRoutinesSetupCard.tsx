import { Box, Button, Card, Text } from '../../../components/ui'
import type { TodayTranslateFn } from '../useTodayScreenData'

interface NoRoutinesSetupCardProps {
  isTablet: boolean
  onCreateRoutine: () => void
  onScheduleRoutine: () => void
  t: TodayTranslateFn
}

export function NoRoutinesSetupCard({
  isTablet,
  onCreateRoutine,
  onScheduleRoutine,
  t,
}: NoRoutinesSetupCardProps) {
  return (
    <Card variant={isTablet ? 'elevated' : 'surface'} borderColor="accent" borderWidth={1}>
      <Text variant="label">{t('today.setupRequiredTitle')}</Text>
      <Text marginTop="xs" variant="bodySm" color="textMuted">
        {t('today.setupRequiredBody')}
      </Text>

      <Box marginTop="md" flexDirection="row" gap="sm">
        <Button title={t('today.createRoutine')} onPress={onCreateRoutine} flex={1} />
        <Button
          title={t('today.setupRequiredScheduleCta')}
          variant="secondary"
          onPress={onScheduleRoutine}
          flex={1}
        />
      </Box>
    </Card>
  )
}
