// Week View Component - Shows 7 days with workout status
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, radii, space, type } from '../../theme'
import { formatWeekdayShortByLanguage } from '../../i18n/formatters'
import { useI18n } from '../../i18n/useI18n'

interface DayData {
  date: Date
  label: string // e.g., "Push", "Pull", "Legs"
  isCompleted: boolean
  isMissed: boolean
  isToday: boolean
  hasWorkout: boolean
}

interface WeekViewProps {
  days: DayData[]
  onDayPress: (day: DayData) => void
}

export default function WeekView({ days, onDayPress }: WeekViewProps) {
  const { language } = useI18n()

  return (
    <View style={styles.container}>
      {days.map((day, index) => (
        <TouchableOpacity
          key={index}
          style={[
            styles.day,
            day.isToday && styles.dayToday,
            day.isCompleted && styles.dayCompleted,
            day.isMissed && styles.dayMissed,
          ]}
          onPress={() => onDayPress(day)}
        >
          <Text style={[styles.dayName, day.isToday && styles.dayNameToday]}>
            {formatWeekdayShortByLanguage(day.date, language) ??
              day.date.toLocaleDateString(undefined, { weekday: 'short' })}
          </Text>
          <Text style={[styles.dayNumber, day.isToday && styles.dayNumberToday]}>
            {day.date.getDate()}
          </Text>
          {day.hasWorkout && (
            <View style={[styles.indicator, day.isCompleted && styles.indicatorCompleted]} />
          )}
          {day.label && (
            <Text style={[styles.label, day.isToday && styles.labelToday]} numberOfLines={1}>
              {day.label}
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    paddingVertical: space[4],
  },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space[3],
    marginHorizontal: space[0.5],
    borderRadius: radii.md,
    backgroundColor: colors.surface.primary,
  },
  dayToday: {
    backgroundColor: colors.accent.primary,
  },
  dayCompleted: {
    backgroundColor: colors.semantic.success,
  },
  dayMissed: {
    backgroundColor: colors.semantic.errorMuted,
  },
  dayName: {
    fontSize: type.labelSm.fontSize,
    color: colors.text.muted,
    marginBottom: space[1],
  },
  dayNameToday: {
    color: colors.text.inverse,
    fontWeight: type.label.fontWeight,
  },
  dayNumber: {
    fontSize: type.h3.fontSize,
    fontWeight: type.h3.fontWeight,
    color: colors.text.primary,
    marginBottom: space[1],
  },
  dayNumberToday: {
    color: colors.text.inverse,
  },
  indicator: {
    width: space[1.5],
    height: space[1.5],
    borderRadius: space[1],
    backgroundColor: colors.accent.primary,
    marginTop: space[1],
  },
  indicatorCompleted: {
    backgroundColor: colors.text.inverse,
  },
  label: {
    fontSize: type.micro.fontSize,
    color: colors.text.muted,
    marginTop: space[1],
  },
  labelToday: {
    color: colors.text.inverse,
    opacity: 0.9,
  },
})
