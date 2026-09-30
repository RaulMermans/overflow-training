import { Box, Button, Card, Pressable, Text } from '../../../components/ui'
import type { TodayScheduledWorkout, TodayTranslateFn } from '../useTodayScreenData'

interface PrimaryActionCardProps {
  isTablet: boolean
  hasInProgress: boolean
  scheduledToday: TodayScheduledWorkout | null
  nextScheduled: TodayScheduledWorkout | null
  nextScheduledDateLabel: string | null
  isStarting: boolean
  isStartingRoutineId: string | null
  todayCardActionDisabled: boolean
  onResumeWorkout: () => void
  onStartQuickRoutine: (routineId: string, plannedDateKey: string) => void
  onOpenCalendar: () => void
  onBuildRoutine: () => void
  t: TodayTranslateFn
}

export function PrimaryActionCard({
  isTablet,
  hasInProgress,
  scheduledToday,
  nextScheduled,
  nextScheduledDateLabel,
  isStarting,
  isStartingRoutineId,
  todayCardActionDisabled,
  onResumeWorkout,
  onStartQuickRoutine,
  onOpenCalendar,
  onBuildRoutine,
  t,
}: PrimaryActionCardProps) {
  return (
    <Card
      testID="workout:primaryActionCard"
      variant={isTablet ? 'elevated' : 'surface'}
      animateOnMount
    >
      {hasInProgress ? (
        <>
          <Text variant="label">{t('today.primary.resumeTitle')}</Text>
          <Text marginTop="xs" variant="bodySm" color="textMuted">
            {t('today.primary.resumeBody')}
          </Text>
          <Box marginTop="md">
            <Button
              testID="workout:resumeButton"
              title={t('today.primary.resumeCta')}
              loading={isStarting}
              disabled={todayCardActionDisabled}
              onPress={onResumeWorkout}
            />
          </Box>
        </>
      ) : scheduledToday ? (
        <>
          <Text variant="label">{t('today.primary.nextWorkoutTitle')}</Text>
          <Text marginTop="xs" variant="bodySm" color="textMuted">
            {t('today.primary.scheduledTodayBody', {
              routine: scheduledToday.routine.name,
            })}
          </Text>
          <Box marginTop="md">
            <Button
              testID="workout:startScheduledButton"
              title={t('today.primary.startWorkoutCta')}
              disabled={todayCardActionDisabled}
              loading={isStartingRoutineId === scheduledToday.routine.id}
              onPress={() => onStartQuickRoutine(scheduledToday.routine.id, scheduledToday.dateKey)}
            />
          </Box>
          <Pressable
            onPress={onOpenCalendar}
            accessibilityRole="link"
            alignItems="center"
            justifyContent="center"
            minHeight={44}
            paddingVertical="xs"
            marginTop="xs"
          >
            {({ pressed }) => (
              <Text variant="labelSm" color="accent" opacity={pressed ? 0.8 : 1}>
                {t('today.primary.viewScheduleCta')}
              </Text>
            )}
          </Pressable>
        </>
      ) : nextScheduled ? (
        <>
          <Text variant="label">{t('today.primary.nextWorkoutTitle')}</Text>
          <Text marginTop="xs" variant="bodySm" color="textMuted">
            {t('today.primary.nextScheduledBody', {
              date: nextScheduledDateLabel ?? nextScheduled.dateKey,
              routine: nextScheduled.routine.name,
            })}
          </Text>
          <Box marginTop="md">
            <Button
              title={t('today.primary.viewScheduleCta')}
              disabled={todayCardActionDisabled}
              onPress={onOpenCalendar}
            />
          </Box>
          <Pressable
            onPress={onBuildRoutine}
            accessibilityRole="link"
            alignItems="center"
            justifyContent="center"
            minHeight={44}
            paddingVertical="xs"
            marginTop="xs"
          >
            {({ pressed }) => (
              <Text variant="labelSm" color="accent" opacity={pressed ? 0.8 : 1}>
                {t('today.createRoutine')}
              </Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <Text variant="label">{t('today.primary.noScheduleTitle')}</Text>
          <Text marginTop="xs" variant="bodySm" color="textMuted">
            {t('today.primary.noScheduleBody')}
          </Text>
          <Box marginTop="md">
            <Button
              title={t('today.primary.scheduleWorkoutsCta')}
              disabled={todayCardActionDisabled}
              onPress={onOpenCalendar}
            />
          </Box>
          <Pressable
            onPress={onBuildRoutine}
            accessibilityRole="link"
            alignItems="center"
            justifyContent="center"
            minHeight={44}
            paddingVertical="xs"
            marginTop="xs"
          >
            {({ pressed }) => (
              <Text variant="labelSm" color="accent" opacity={pressed ? 0.8 : 1}>
                {t('today.createRoutine')}
              </Text>
            )}
          </Pressable>
        </>
      )}
    </Card>
  )
}
