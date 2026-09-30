export type ProgramWeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type ProgramExerciseType = 'compound' | 'accessory'

export interface ProgramExerciseTarget {
  slug: string
  sets: number
  reps: number
  type: ProgramExerciseType
  restSeconds?: number
}

export interface ProgramWorkoutTemplate {
  id: string
  nameKey: string
  exercises: ProgramExerciseTarget[]
}

export interface ProgramTemplate {
  id: string
  nameKey: string
  descriptionKey: string
  weeklySchedule: Record<ProgramWeekdayKey, string | null>
  workouts: ProgramWorkoutTemplate[]
}
