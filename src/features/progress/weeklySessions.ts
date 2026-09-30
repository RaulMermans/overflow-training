import type { ProgressWorkout } from '../../db/progress'

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getStartOfWeek(date: Date): Date {
  const weekStart = new Date(date)
  const day = weekStart.getDay()
  const diffToMonday = (day + 6) % 7
  weekStart.setDate(weekStart.getDate() - diffToMonday)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function buildWeeklySessionCounts(
  workouts: ProgressWorkout[],
  barsCount: number,
  endISO: string,
): number[] {
  const safeBarsCount = Math.max(1, barsCount)
  const endDate = new Date(endISO)
  const referenceDate = Number.isNaN(endDate.getTime()) ? new Date() : endDate
  const currentWeekStart = getStartOfWeek(referenceDate)
  const sessionIdsByWeekKey = new Map<string, Set<string>>()

  for (const workout of workouts) {
    const performedAt = workout.started_at ?? workout.ended_at
    if (!performedAt) continue

    const performedDate = new Date(performedAt)
    if (Number.isNaN(performedDate.getTime())) continue

    const weekKey = toDateKey(getStartOfWeek(performedDate))
    const sessionIds = sessionIdsByWeekKey.get(weekKey) ?? new Set<string>()
    sessionIds.add(workout.id)
    sessionIdsByWeekKey.set(weekKey, sessionIds)
  }

  const values: number[] = []
  for (let weekOffset = safeBarsCount - 1; weekOffset >= 0; weekOffset -= 1) {
    const weekDate = addDays(currentWeekStart, -weekOffset * 7)
    const key = toDateKey(weekDate)
    values.push(sessionIdsByWeekKey.get(key)?.size ?? 0)
  }

  return values
}
