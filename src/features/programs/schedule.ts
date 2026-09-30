import type {
  ProgramTemplate,
  ProgramWeekdayKey,
  ProgramWorkoutTemplate,
} from '../../programs/types'

const DAY_KEYS: ProgramWeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function getProgramWeekdayKey(date: Date = new Date()): ProgramWeekdayKey {
  return DAY_KEYS[date.getDay()] ?? 'sun'
}

export function getProgramWorkoutForDate(
  program: ProgramTemplate,
  date: Date = new Date(),
): ProgramWorkoutTemplate | null {
  const dayKey = getProgramWeekdayKey(date)
  const workoutId = program.weeklySchedule[dayKey]
  if (!workoutId) return null

  return program.workouts.find((workout) => workout.id === workoutId) ?? null
}
