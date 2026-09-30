import { AccentRule, Box, Card, Pressable, Text, WeekRhythm } from '../../../components/ui'
import ProgressBar from '../../../components/ui/ProgressBar'
import type { WeekRhythmDay } from '../compute'
import type { TodayTranslateFn } from '../useTodayScreenData'
import { colors } from '../../../theme/tokens'

interface WeekInsightsCardProps {
  isTablet: boolean
  sessionsThisWeek: number
  weeklyGoal: number
  cadenceTone: 'up' | 'neutral' | 'down'
  currentStreak: number
  weekRhythm: WeekRhythmDay[]
  weekSummary: string
  lastWorkoutRelative: string
  onOpenCalendar: () => void
  onOpenRoutines: () => void
  onShareWeek?: () => void
  t: TodayTranslateFn
}

export function WeekInsightsCard({
  isTablet,
  sessionsThisWeek,
  weeklyGoal,
  cadenceTone: _cadenceTone,
  currentStreak,
  weekRhythm,
  weekSummary,
  lastWorkoutRelative,
  onOpenCalendar,
  onOpenRoutines,
  onShareWeek,
  t,
}: WeekInsightsCardProps) {
  const safeGoal = Math.max(1, weeklyGoal)
  const goalProgress = Math.min((sessionsThisWeek / safeGoal) * 100, 100)

  // Show streak as hero if >= 3, otherwise show sessions
  const showStreakAsHero = currentStreak >= 3
  const heroValue = showStreakAsHero ? currentStreak : sessionsThisWeek
  const heroLabel = showStreakAsHero ? t('today.streak') : t('today.thisWeek')

  return (
    <Card variant={isTablet ? 'elevated' : 'surface'}>
      <AccentRule />

      <Box alignItems="center" marginTop="lg" marginBottom="md">
        <Text variant="heroStat">{heroValue}</Text>
        <Text
          variant="heroLabel"
          color="textMuted"
          marginTop="xs"
          style={{ textTransform: 'uppercase' }}
        >
          {heroLabel}
        </Text>
        {showStreakAsHero ? (
          <Text variant="bodySm" color="textMuted" marginTop="xs">
            {`${sessionsThisWeek}/${safeGoal} ${t('today.sessions').toLowerCase()}`}
          </Text>
        ) : null}
      </Box>

      <WeekRhythm days={weekRhythm} isTablet={isTablet} />

      <Box marginTop="sm">
        <ProgressBar value={goalProgress} height={4} color={colors.accent.primary} />
      </Box>

      <Text marginTop="sm" variant="bodySm" color="textMuted">
        {weekSummary}
      </Text>

      <Box alignItems="center" marginTop="sm">
        <Text variant="bodySm" color="textMuted">
          {t('today.lastSession', { time: lastWorkoutRelative })}
        </Text>
      </Box>

      <Box flexDirection="row" justifyContent="center" gap="sm" marginTop="sm">
        <Pressable
          onPress={onOpenCalendar}
          accessibilityRole="link"
          alignItems="center"
          justifyContent="center"
          minHeight={44}
          paddingHorizontal="md"
        >
          {({ pressed }) => (
            <Text variant="labelSm" color="accent" opacity={pressed ? 0.8 : 1}>
              {t('today.viewHistory')}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={onOpenRoutines}
          accessibilityRole="link"
          alignItems="center"
          justifyContent="center"
          minHeight={44}
          paddingHorizontal="md"
        >
          {({ pressed }) => (
            <Text variant="labelSm" color="accent" opacity={pressed ? 0.8 : 1}>
              {t('today.routines')}
            </Text>
          )}
        </Pressable>
        {onShareWeek ? (
          <Pressable
            onPress={onShareWeek}
            accessibilityRole="button"
            alignItems="center"
            justifyContent="center"
            minHeight={44}
            paddingHorizontal="md"
          >
            {({ pressed }) => (
              <Text variant="labelSm" color="accent" opacity={pressed ? 0.8 : 1}>
                {t('today.shareWeek')}
              </Text>
            )}
          </Pressable>
        ) : null}
      </Box>
    </Card>
  )
}
