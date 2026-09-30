import type { WorkoutLike } from '../today/compute'
import { countSessionsThisWeek, buildWeekRhythm } from '../today/compute'
import type { UnitsPreference } from '../../lib/profilePreferences'

export interface WeeklyShareData {
  weekLabel: string
  sessionsCompleted: number
  weeklyGoal: number
  currentStreak: number
  totalVolume: number
  units: UnitsPreference
  weekRhythm: { label: string; completed: boolean }[]
}

interface BuildWeeklyShareDataInput {
  workouts: WorkoutLike[]
  weeklyGoal: number
  currentStreak: number
  totalVolumeDisplay: number
  units: UnitsPreference
  language: 'en' | 'es'
  now?: Date
}

function formatWeekRange(now: Date): string {
  const weekStart = new Date(now)
  const day = weekStart.getDay()
  const diffToMonday = (day + 6) % 7
  weekStart.setDate(weekStart.getDate() - diffToMonday)
  weekStart.setHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const startMonth = weekStart.toLocaleDateString('en', { month: 'short' })
  const endMonth = weekEnd.toLocaleDateString('en', { month: 'short' })

  if (startMonth === endMonth) {
    return `${startMonth} ${weekStart.getDate()} – ${weekEnd.getDate()}`
  }
  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}`
}

export function buildWeeklyShareData(input: BuildWeeklyShareDataInput): WeeklyShareData {
  const now = input.now ?? new Date()
  const sessionsCompleted = countSessionsThisWeek(input.workouts, now)
  const rhythm = buildWeekRhythm(input.workouts, now, input.language)

  return {
    weekLabel: formatWeekRange(now),
    sessionsCompleted,
    weeklyGoal: input.weeklyGoal,
    currentStreak: input.currentStreak,
    totalVolume: input.totalVolumeDisplay,
    units: input.units,
    weekRhythm: rhythm.map((day) => ({
      label: day.label,
      completed: day.completed,
    })),
  }
}
