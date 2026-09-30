import { StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Box, Button, Card, ListRow, Pressable, Text } from '../../../components/ui'
import { useI18n } from '../../../i18n/useI18n'
import { colors } from '../../../theme'
import type { SelectedDayModel } from '../monthCalendar'

interface DayDetailSheetProps {
  selectedDay: SelectedDayModel
  isStartingDateKey: string | null
  isSyncing: boolean
  formatCalendarDate: (dateKey: string) => string
  formatWorkoutTime: (iso: string) => string
  onStartWorkout: (dateKey: string) => void | Promise<void>
  onPickRoutine: (dateKey: string) => void
  onClearPlan: (dateKey: string) => void
  onOpenWorkout: (workoutId: string) => void
  onSyncNow: () => void
  onClose: () => void
}

export function DayDetailSheet({
  selectedDay,
  isStartingDateKey,
  isSyncing,
  formatCalendarDate,
  formatWorkoutTime,
  onStartWorkout,
  onPickRoutine,
  onClearPlan,
  onOpenWorkout,
  onSyncNow,
  onClose,
}: DayDetailSheetProps) {
  const { t } = useI18n()

  return (
    <Box paddingBottom="xl">
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="flex-start"
        marginBottom="lg"
        gap="md"
      >
        <Box flex={1}>
          <Text variant="h2" style={styles.sheetTitle}>
            {t('calendar.dayDetailsTitle', {
              date: formatCalendarDate(selectedDay.dateKey),
            })}
          </Text>
        </Box>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          width={36}
          height={36}
          borderRadius="full"
          backgroundColor="backgroundSecondary"
          borderWidth={1}
          borderColor="borderSubtle"
          alignItems="center"
          justifyContent="center"
        >
          <Ionicons name="close" size={18} color={colors.text.primary} />
        </Pressable>
      </Box>

      {selectedDay.hasPlan ? (
        <>
          <Text variant="micro" color="textMuted" style={styles.sectionLabel}>
            {t('calendar.dayDetailsPlan')}
          </Text>
          {selectedDay.routine ? (
            <Card variant="elevated">
              <Text variant="label" style={styles.cardTitle}>
                {selectedDay.routine.name}
              </Text>
              <Text marginTop="xs" variant="bodySm" color="textMuted">
                {t('calendar.exerciseCount', {
                  count: selectedDay.routine.items.length,
                  plural: selectedDay.routine.items.length === 1 ? '' : 's',
                })}
              </Text>
              <Box marginTop="lg" gap="sm">
                <Button
                  testID="calendar:startWorkoutButton"
                  title={
                    isStartingDateKey === selectedDay.dateKey
                      ? t('calendar.starting')
                      : t('calendar.start')
                  }
                  loading={isStartingDateKey === selectedDay.dateKey}
                  disabled={isStartingDateKey === selectedDay.dateKey}
                  onPress={() => {
                    void onStartWorkout(selectedDay.dateKey)
                  }}
                />
                <Box flexDirection="row" gap="sm">
                  <Button
                    title={t('calendar.change')}
                    variant="secondary"
                    flex={1}
                    onPress={() => onPickRoutine(selectedDay.dateKey)}
                  />
                  <Button
                    testID="calendar:clearPlanButton"
                    title={t('calendar.clear')}
                    variant="ghost"
                    flex={1}
                    onPress={() => onClearPlan(selectedDay.dateKey)}
                  />
                </Box>
              </Box>
            </Card>
          ) : (
            <Card variant="elevated">
              <Text variant="label" color="warning">
                {t('calendar.routineUnavailable')}
              </Text>
              <Text marginTop="xs" variant="bodySm" color="textMuted">
                {t('calendar.dayDetailsPlanMissing')}
              </Text>
              <Box marginTop="lg" gap="sm">
                <Button
                  title={t('calendar.syncNow')}
                  variant="secondary"
                  loading={isSyncing}
                  disabled={isSyncing}
                  onPress={onSyncNow}
                />
                <Box flexDirection="row" gap="sm">
                  <Button
                    title={t('calendar.change')}
                    variant="secondary"
                    flex={1}
                    onPress={() => onPickRoutine(selectedDay.dateKey)}
                  />
                  <Button
                    testID="calendar:clearPlanButton"
                    title={t('calendar.clear')}
                    variant="ghost"
                    flex={1}
                    onPress={() => onClearPlan(selectedDay.dateKey)}
                  />
                </Box>
              </Box>
            </Card>
          )}
        </>
      ) : (
        <Card variant="elevated">
          <Text variant="bodySm" color="textMuted">
            {t('calendar.dayDetailsNoPlan')}
          </Text>
          <Box marginTop="lg">
            <Button
              testID="calendar:addPlanButton"
              title={t('calendar.addPlan')}
              onPress={() => onPickRoutine(selectedDay.dateKey)}
            />
          </Box>
        </Card>
      )}

      {selectedDay.hasWorkouts ? (
        <>
          <Text marginTop="lg" variant="micro" color="textMuted" style={styles.sectionLabel}>
            {t('calendar.dayDetailsWorkouts')}
          </Text>
          <Card variant="elevated" padding="none">
            {selectedDay.workouts.map((workout) => (
              <ListRow
                key={workout.id}
                title={formatWorkoutTime(workout.performedAt)}
                subtitle={t('calendar.completedSession')}
                showChevron
                onPress={() => onOpenWorkout(workout.id)}
              />
            ))}
          </Card>
        </>
      ) : null}

      {selectedDay.isEmpty ? (
        <Text marginTop="sm" variant="bodySm" color="textMuted">
          {t('calendar.dayDetailsEmpty')}
        </Text>
      ) : null}
    </Box>
  )
}

const styles = StyleSheet.create({
  sheetTitle: {
    letterSpacing: -0.6,
  },
  sectionLabel: {
    letterSpacing: 1,
  },
  cardTitle: {
    letterSpacing: -0.2,
  },
})
