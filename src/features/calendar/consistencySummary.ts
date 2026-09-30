import type { ProgressWorkout } from '../../db/progress'
import { computeStreakAtDate } from '../progress/compute'
import { countSessionsThisWeek } from '../today/compute'
import type { WorkoutDateRowLike } from './monthCalendar'

export interface CalendarConsistencySummary {
  sessionsThisWeek: number
  currentStreak: number
  weeklyGoal: number
}

export interface AgendaWindowKeys {
  upcomingStartDateKey: string
  upcomingEndDateKey: string
  recentStartDateKey: string
  recentEndDateKey: string
}

interface CalendarConsistencyFlagInput {
  isAgendaFeatureEnabled: boolean
  isConsistencyStripFeatureEnabled: boolean
}

interface CalendarConsistencyVisibilityInput extends CalendarConsistencyFlagInput {
  isAgendaView: boolean
}

function resolveWorkoutTimestamp(workout: WorkoutDateRowLike): string | null {
  return workout.started_at ?? workout.ended_at ?? workout.created_at ?? null
}

function toProgressWorkout(workout: WorkoutDateRowLike): ProgressWorkout | null {
  const timestamp = resolveWorkoutTimestamp(workout)
  if (!timestamp) return null

  return {
    id: workout.id,
    ended_at: timestamp,
    started_at: timestamp,
    workout_exercises: [],
  } as ProgressWorkout
}

export function addDaysToDateKey(dateKey: string, dayDelta: number): string {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + dayDelta)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildAgendaWindowKeys(todayDateKey: string, windowDays: number): AgendaWindowKeys {
  const safeWindowDays = Math.max(1, Math.floor(windowDays))
  const upcomingOffset = safeWindowDays - 1
  const recentStartOffset = -safeWindowDays
  const recentEndOffset = -1

  // Keep 14/14 windows non-overlapping:
  // upcoming includes today, recent ends yesterday.
  return {
    upcomingStartDateKey: todayDateKey,
    upcomingEndDateKey: addDaysToDateKey(todayDateKey, upcomingOffset),
    recentStartDateKey: addDaysToDateKey(todayDateKey, recentStartOffset),
    recentEndDateKey: addDaysToDateKey(todayDateKey, recentEndOffset),
  }
}

export function shouldLoadCalendarConsistency({
  isAgendaFeatureEnabled,
  isConsistencyStripFeatureEnabled,
}: CalendarConsistencyFlagInput): boolean {
  return isAgendaFeatureEnabled && isConsistencyStripFeatureEnabled
}

export function shouldShowCalendarConsistencyStrip({
  isAgendaView,
  isAgendaFeatureEnabled,
  isConsistencyStripFeatureEnabled,
}: CalendarConsistencyVisibilityInput): boolean {
  return (
    isAgendaView &&
    shouldLoadCalendarConsistency({
      isAgendaFeatureEnabled,
      isConsistencyStripFeatureEnabled,
    })
  )
}

interface BuildCalendarConsistencySummaryInput {
  workouts: WorkoutDateRowLike[]
  weeklyGoal: number
  now?: Date
}

export function buildCalendarConsistencySummary({
  workouts,
  weeklyGoal,
  now = new Date(),
}: BuildCalendarConsistencySummaryInput): CalendarConsistencySummary {
  const sessionsThisWeek = countSessionsThisWeek(workouts, now)
  const progressWorkouts = workouts
    .map(toProgressWorkout)
    .filter((workout): workout is ProgressWorkout => workout !== null)
  const currentStreak = computeStreakAtDate(progressWorkouts, now)

  return {
    sessionsThisWeek,
    currentStreak,
    weeklyGoal,
  }
}
