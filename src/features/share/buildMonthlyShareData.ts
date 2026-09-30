import type { UnitsPreference } from '../../lib/profilePreferences'

export interface MonthlyShareData {
  monthLabel: string
  yearLabel: string
  totalSessions: number
  totalVolume: number
  units: UnitsPreference
  longestStreak: number
  completedDayNumbers: number[]
  daysInMonth: number
  firstDayOffset: number
}

interface BuildMonthlyShareDataInput {
  completedDateKeys: string[]
  totalVolumeDisplay: number
  units: UnitsPreference
  longestStreak: number
  month: number // 0-indexed
  year: number
  locale?: string
}

export function buildMonthlyShareData(input: BuildMonthlyShareDataInput): MonthlyShareData {
  const { month, year } = input

  const monthDate = new Date(year, month, 1)
  const monthLabel = monthDate.toLocaleDateString(input.locale ?? 'en', { month: 'long' })
  const yearLabel = String(year)

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOffset = new Date(year, month, 1).getDay() // 0=Sun

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  const completedDayNumbers = input.completedDateKeys
    .filter((key) => key.startsWith(monthPrefix))
    .map((key) => {
      const day = parseInt(key.slice(-2), 10)
      return Number.isFinite(day) ? day : 0
    })
    .filter((day) => day > 0 && day <= daysInMonth)

  return {
    monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
    yearLabel,
    totalSessions: completedDayNumbers.length,
    totalVolume: input.totalVolumeDisplay,
    units: input.units,
    longestStreak: input.longestStreak,
    completedDayNumbers,
    daysInMonth,
    firstDayOffset,
  }
}
