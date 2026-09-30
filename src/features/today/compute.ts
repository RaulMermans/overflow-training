import { createTranslator, type Language } from '../../i18n'
import { formatWeekdayShortByLanguage } from '../../i18n/formatters'

export interface WorkoutLike {
  ended_at?: string | null
  started_at?: string | null
  created_at?: string | null
}

export type CadenceTone = 'up' | 'neutral' | 'down'

interface CadenceSummary {
  label: string
  tone: CadenceTone
}

export interface WeekRhythmDay {
  key: string
  label: string
  dayOfMonth: string
  count: number
  completed: boolean
  isToday: boolean
}

function getWorkoutTimestamp(workout: WorkoutLike): string | null {
  return workout.started_at ?? workout.ended_at ?? workout.created_at ?? null
}

function getStartOfWeek(date: Date): Date {
  const weekStart = new Date(date)
  const day = weekStart.getDay()
  const diffToMonday = (day + 6) % 7
  weekStart.setDate(weekStart.getDate() - diffToMonday)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseWorkoutDate(timestamp: string): Date | null {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function formatRelativeLastWorkout(
  iso: string | null | undefined,
  now: Date = new Date(),
  language: Language,
): string {
  const t = createTranslator(language)
  if (!iso) return t('time.noSessions')

  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return t('common.unknown')

  const diffMs = Math.max(0, now.getTime() - target.getTime())
  const hours = Math.floor(diffMs / (1000 * 60 * 60))

  if (hours < 24) return t('time.today')
  if (hours < 48) return t('time.yesterday')
  if (hours < 168) return t('time.hoursAgo', { count: hours })

  const days = Math.floor(hours / 24)
  return t('time.daysAgo', { count: days })
}

export function getTimeBasedGreeting(now: Date = new Date(), language: Language): string {
  const hour = now.getHours()
  const t = createTranslator(language)
  if (hour < 12) return t('greeting.morning')
  if (hour < 18) return t('greeting.afternoon')
  return t('greeting.evening')
}

function getEmailPrefix(email?: string | null): string {
  if (!email) return ''
  const trimmedEmail = email.trim()
  if (!trimmedEmail) return ''
  const atIndex = trimmedEmail.indexOf('@')
  const prefix = atIndex > -1 ? trimmedEmail.slice(0, atIndex) : trimmedEmail
  return prefix.trim()
}

export function formatGreetingWithName(
  greeting: string,
  displayName?: string | null,
  email?: string | null,
): string {
  const normalizedGreeting = greeting.trim().replace(/[,\s]+$/, '')
  const normalizedDisplayName = displayName?.trim() ?? ''
  const normalizedName = normalizedDisplayName || getEmailPrefix(email)

  if (!normalizedGreeting) {
    return normalizedName || ''
  }

  if (!normalizedName) {
    return normalizedGreeting
  }

  return `${normalizedGreeting}, ${normalizedName}`
}

interface DailyMotivationLineOpts {
  userId: string
  date: Date
  lines: string[]
}

function hashString(input: string): number {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }
  return hash
}

export function pickDailyMotivationLine({ userId, date, lines }: DailyMotivationLineOpts): string {
  if (lines.length === 0) return ''

  const key = `${userId}|${toLocalDateKey(date)}`
  const hash = hashString(key)
  return lines[hash % lines.length]
}

export function countSessionsThisWeek(workouts: WorkoutLike[], now: Date = new Date()): number {
  const weekStart = getStartOfWeek(now)

  return workouts.reduce((count, workout) => {
    const timestamp = getWorkoutTimestamp(workout)
    if (!timestamp) return count

    const sessionDate = new Date(timestamp)
    if (Number.isNaN(sessionDate.getTime())) return count

    if (sessionDate >= weekStart && sessionDate <= now) {
      return count + 1
    }

    return count
  }, 0)
}

export function buildWeekRhythm(
  workouts: WorkoutLike[],
  now: Date = new Date(),
  language: Language,
): WeekRhythmDay[] {
  const weekStart = getStartOfWeek(now)
  const todayKey = toLocalDateKey(now)
  const dailyCounts = new Map<string, number>()

  workouts.forEach((workout) => {
    const timestamp = getWorkoutTimestamp(workout)
    if (!timestamp) return
    const parsed = parseWorkoutDate(timestamp)
    if (!parsed) return
    if (parsed < weekStart || parsed > now) return
    const key = toLocalDateKey(parsed)
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1)
  })

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + index)
    const key = toLocalDateKey(date)
    const count = dailyCounts.get(key) ?? 0

    return {
      key,
      label: formatWeekdayShortByLanguage(date, language) ?? '',
      dayOfMonth: String(date.getDate()),
      count,
      completed: count > 0,
      isToday: key === todayKey,
    }
  })
}

export function buildWeekSummary(
  workouts: WorkoutLike[],
  now: Date = new Date(),
  language: Language,
): string {
  const t = createTranslator(language)
  const week = buildWeekRhythm(workouts, now, language)
  const totalSessions = week.reduce((total, day) => total + day.count, 0)
  const activeDays = week.filter((day) => day.completed).length

  if (totalSessions === 0) return t('week.noSessions')
  if (totalSessions === 1) return t('week.oneSession')
  if (activeDays <= 1) {
    return t('week.sessionsOneDay', { count: totalSessions })
  }
  return t('week.sessionsMultipleDays', {
    count: totalSessions,
    days: activeDays,
  })
}

export function computeCadenceSummary(
  sessionsThisWeek: number,
  weeklyGoal: number,
  language: Language,
): CadenceSummary {
  const t = createTranslator(language)
  const safeGoal = Math.max(1, Math.round(weeklyGoal))
  const safeSessions = Math.max(0, Math.round(sessionsThisWeek))

  if (safeSessions >= safeGoal) {
    return {
      label: t('cadence.onPace', { n: safeSessions, goal: safeGoal }),
      tone: 'up',
    }
  }

  if (safeSessions === 0) {
    return {
      label: t('cadence.readyToBegin', { n: safeSessions, goal: safeGoal }),
      tone: 'down',
    }
  }

  return {
    label: t('cadence.buildingRhythm', { n: safeSessions, goal: safeGoal }),
    tone: 'neutral',
  }
}

export function getTodayPrimaryAction(hasInProgress: boolean, language: Language): string {
  const t = createTranslator(language)
  return hasInProgress ? t('today.resumeWorkout') : t('today.startWorkout')
}
