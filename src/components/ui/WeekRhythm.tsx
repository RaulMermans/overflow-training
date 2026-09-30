import { Box } from './Box'
import { Text } from './Text'
import type { WeekRhythmDay } from '../../features/today/compute'

interface WeekRhythmProps {
  days: WeekRhythmDay[]
  isTablet?: boolean
}

export function WeekRhythm({ days, isTablet = false }: WeekRhythmProps) {
  const daySize = isTablet ? 64 : 52
  const indicatorSize = isTablet ? 12 : 10

  return (
    <Box flexDirection="row" justifyContent="space-between" gap={isTablet ? 'sm' : 'xs'}>
      {days.map((day) => (
        <Box
          key={day.key}
          flex={1}
          minHeight={daySize}
          borderRadius="md"
          backgroundColor={day.completed ? 'accentSecondaryMuted' : 'backgroundSecondary'}
          alignItems="center"
          justifyContent="center"
          paddingVertical={isTablet ? 'sm' : 'xs'}
          paddingHorizontal="xs"
        >
          <Text variant="micro" color={day.isToday ? 'accent' : 'textMuted'}>
            {day.label}
          </Text>
          <Text
            marginTop="xs"
            variant="tabular"
            color={day.completed ? 'textPrimary' : 'textMuted'}
          >
            {day.dayOfMonth}
          </Text>
          <Box
            marginTop="xs"
            width={indicatorSize}
            height={indicatorSize}
            borderRadius="full"
            backgroundColor={day.completed ? 'accentSecondary' : 'borderSubtle'}
          />
        </Box>
      ))}
    </Box>
  )
}
