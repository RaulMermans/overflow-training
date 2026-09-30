import type { PlannedDay } from './types'
import type { Routine } from '../../lib/routines'

export type ScheduledWorkout = {
  dateKey: string
  plan: PlannedDay
  routine: Routine
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toDateKey(input: Date | string): string {
  if (typeof input === 'string') {
    return input.trim().slice(0, 10)
  }
  return toLocalDateKey(input)
}

export function getScheduledWorkoutForDate(
  plans: Record<string, PlannedDay>,
  routinesById: Record<string, Routine>,
  dateOrKey: Date | string,
): ScheduledWorkout | null {
  const dateKey = toDateKey(dateOrKey)
  const plan = plans[dateKey]
  if (!plan) return null

  const routine = routinesById[plan.routineId]
  if (!routine) return null

  return {
    dateKey,
    plan,
    routine,
  }
}

export function getNextScheduledWorkout(
  plans: Record<string, PlannedDay>,
  routinesById: Record<string, Routine>,
  fromDateOrKey: Date | string,
): ScheduledWorkout | null {
  const fromDateKey = toDateKey(fromDateOrKey)
  const nextDateKey = Object.keys(plans)
    .filter((dateKey) => dateKey > fromDateKey)
    .sort((a, b) => a.localeCompare(b))
    .find((dateKey) => routinesById[plans[dateKey]?.routineId ?? ''])

  if (!nextDateKey) return null

  const plan = plans[nextDateKey]
  const routine = routinesById[plan.routineId]
  if (!plan || !routine) return null

  return {
    dateKey: nextDateKey,
    plan,
    routine,
  }
}
