import { View, Text, StyleSheet } from 'react-native'
import { colors, typography, radius } from '../../theme'

interface DayData {
  date: string
  level: number // 0-4
}

interface StreakGridProps {
  data: DayData[][] // array of weeks, each week is 7 days
}

const levelColors = [
  colors.streak.level0,
  colors.streak.level1,
  colors.streak.level2,
  colors.streak.level3,
  colors.streak.level4,
]

const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', '']

export default function StreakGrid({ data }: StreakGridProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Activity</Text>
        <Text style={styles.headerSub}>Last 12 weeks</Text>
      </View>

      <View style={styles.grid} accessibilityLabel="Workout activity over the last 12 weeks">
        <View style={styles.dayLabelsCol}>
          {dayLabels.map((label, i) => (
            <View key={i} style={styles.dayLabelCell}>
              <Text style={styles.dayLabelText}>{label}</Text>
            </View>
          ))}
        </View>
        {data.map((week, weekIdx) => (
          <View key={weekIdx} style={styles.weekCol}>
            {week.map((day, dayIdx) => (
              <View
                key={dayIdx}
                style={[styles.cell, { backgroundColor: levelColors[Math.min(day.level, 4)] }]}
              />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendText}>Less</Text>
        {levelColors.map((color, i) => (
          <View key={i} style={[styles.legendCell, { backgroundColor: color }]} />
        ))}
        <Text style={styles.legendText}>More</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLabel: {
    ...typography.label,
    color: colors.text.primary,
  },
  headerSub: {
    ...typography.bodySm,
    color: colors.text.muted,
  },
  grid: {
    flexDirection: 'row',
    gap: 4,
  },
  dayLabelsCol: {
    flexDirection: 'column',
    gap: 2,
    marginRight: 4,
  },
  dayLabelCell: {
    height: 10,
    justifyContent: 'center',
  },
  dayLabelText: {
    ...typography.micro,
    fontSize: 9,
    color: colors.text.muted,
  },
  weekCol: {
    flexDirection: 'column',
    gap: 2,
  },
  cell: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 12,
  },
  legendText: {
    ...typography.micro,
    color: colors.text.muted,
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
})
