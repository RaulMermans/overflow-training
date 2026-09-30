import { Box, Button, Card, ListRow, SectionHeader, Text } from '../../../components/ui'
import type { WorkoutRow } from '../../../db/workouts'
import type { TodayTranslateFn } from '../useTodayScreenData'

interface LastWorkoutCardProps {
  isTablet: boolean
  latestWorkout: WorkoutRow | null
  latestWorkoutTimestamp: string | null
  isRepeating: boolean
  isLoading: boolean
  isStarting: boolean
  formatDateTime: (iso?: string | null) => string
  onOpenWorkout: (workoutId: string) => void
  onRepeatLastSession: () => void
  t: TodayTranslateFn
}

export function LastWorkoutCard({
  isTablet,
  latestWorkout,
  latestWorkoutTimestamp,
  isRepeating,
  isLoading,
  isStarting,
  formatDateTime,
  onOpenWorkout,
  onRepeatLastSession,
  t,
}: LastWorkoutCardProps) {
  return (
    <>
      <SectionHeader title={t('today.lastWorkout')} variant="dense" />
      {latestWorkout ? (
        <>
          <Card
            padding="none"
            marginBottom="sm"
            variant={isTablet ? 'elevated' : 'surface'}
            animateOnMount
          >
            <ListRow
              label={formatDateTime(latestWorkoutTimestamp)}
              subtitle={t('today.completedSession')}
              value={t('today.open')}
              showChevron
              onPress={() => onOpenWorkout(latestWorkout.id)}
            />
          </Card>
          <Box marginBottom="xl">
            <Button
              title={isRepeating ? t('today.preparing') : t('today.repeatLast')}
              variant="secondary"
              loading={isRepeating}
              disabled={isLoading || isStarting || isRepeating}
              onPress={onRepeatLastSession}
            />
          </Box>
        </>
      ) : (
        <Card marginBottom="sm">
          <Text variant="label">{t('today.noSessions')}</Text>
          <Text marginTop="xs" variant="bodySm" color="textMuted">
            {t('today.noSessionsBody')}
          </Text>
        </Card>
      )}
    </>
  )
}
