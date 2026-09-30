import type { PlannedDay } from '../schedule/types'
import type { Routine } from '../../lib/routines'
import { getScheduledWorkoutForDate } from '../schedule/selectors'

export interface WorkoutDateRowLike {
  id: string
  started_at: string | null
  ended_at: string | null
  created_at?: string | null
}

export interface CalendarWorkoutItem {
  id: string
  performedAt: string
}

export type WorkoutsByDate = Record<string, CalendarWorkoutItem[]>

export interface CalendarMarkedDot {
  key: 'workout' | 'plan'
  color: string
}

export interface CalendarMarkedDay {
  marked?: boolean
  dots?: CalendarMarkedDot[]
  selected?: boolean
  selectedColor?: string
  selectedTextColor?: string
}

export type CalendarMarkedDates = Record<string, CalendarMarkedDay>

interface BuildMarkedDatesInput {
  workoutDateKeys: Iterable<string>
  planDateKeys: Iterable<string>
  selectedDateKey?: string | null
  colors: {
    workoutDot: string
    planDot: string
    selectedBackground: string
    selectedText: string
  }
}

export interface SelectedDayModel {
  dateKey: string
  workouts: CalendarWorkoutItem[]
  plan: PlannedDay | null
  routine: Routine | null
  routineMissing: boolean
  hasPlan: boolean
  hasWorkouts: boolean
  isEmpty: boolean
}

export function toDateKeyFromIso(iso: string): string {
  const date = new Date(iso)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function resolveWorkoutTimestamp(workout: WorkoutDateRowLike): string | null {
  return workout.started_at ?? workout.ended_at ?? workout.created_at ?? null
}

export function groupWorkoutsByDate(workouts: WorkoutDateRowLike[]): WorkoutsByDate {
  const grouped: WorkoutsByDate = {}

  for (const workout of workouts) {
    const timestamp = resolveWorkoutTimestamp(workout)
    if (!timestamp) continue

    const dateKey = toDateKeyFromIso(timestamp)
    const current = grouped[dateKey] ?? []

    current.push({
      id: workout.id,
      performedAt: timestamp,
    })

    grouped[dateKey] = current
  }

  for (const dateKey of Object.keys(grouped)) {
    grouped[dateKey] = [...grouped[dateKey]].sort((a, b) =>
      b.performedAt.localeCompare(a.performedAt),
    )
  }

  return grouped
}

export function buildMarkedDates({
  workoutDateKeys,
  planDateKeys,
  selectedDateKey,
  colors,
}: BuildMarkedDatesInput): CalendarMarkedDates {
  const marks: CalendarMarkedDates = {}

  const ensure = (dateKey: string) => {
    const existing = marks[dateKey]
    if (existing) return existing

    const created: CalendarMarkedDay = {}
    marks[dateKey] = created
    return created
  }

  for (const dateKey of workoutDateKeys) {
    const mark = ensure(dateKey)
    const currentDots = mark.dots ?? []
    mark.marked = true
    mark.dots = [...currentDots, { key: 'workout', color: colors.workoutDot }]
  }

  for (const dateKey of planDateKeys) {
    const mark = ensure(dateKey)
    const currentDots = mark.dots ?? []
    const hasWorkoutDot = currentDots.some((dot) => dot.key === 'workout')
    const hasPlanDot = currentDots.some((dot) => dot.key === 'plan')
    if (hasWorkoutDot) continue
    mark.marked = true
    mark.dots = hasPlanDot ? currentDots : [...currentDots, { key: 'plan', color: colors.planDot }]
  }

  if (selectedDateKey) {
    const selectedMark = ensure(selectedDateKey)
    selectedMark.selected = true
    selectedMark.selectedColor = colors.selectedBackground
    selectedMark.selectedTextColor = colors.selectedText
  }

  return marks
}

interface BuildSelectedDayModelInput {
  dateKey: string
  workoutsByDate: WorkoutsByDate
  plansByDate: Record<string, PlannedDay>
  routinesById: Record<string, Routine>
}

export function buildSelectedDayModel({
  dateKey,
  workoutsByDate,
  plansByDate,
  routinesById,
}: BuildSelectedDayModelInput): SelectedDayModel {
  const workouts = workoutsByDate[dateKey] ?? []
  const rawPlan = plansByDate[dateKey] ?? null
  const hasWorkouts = workouts.length > 0
  const scheduled = hasWorkouts
    ? null
    : getScheduledWorkoutForDate(plansByDate, routinesById, dateKey)
  const plan = hasWorkouts ? null : rawPlan
  const routine = scheduled?.routine ?? null
  const hasPlan = !hasWorkouts && !!rawPlan

  return {
    dateKey,
    workouts,
    plan,
    routine,
    routineMissing: hasPlan && !routine,
    hasPlan,
    hasWorkouts,
    isEmpty: !hasPlan && !hasWorkouts,
  }
}
