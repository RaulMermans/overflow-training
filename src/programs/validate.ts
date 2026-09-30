import type { ProgramTemplate } from './types'

export function validateProgramTemplates(templates: ProgramTemplate[]): string[] {
  const errors: string[] = []
  const seenProgramIds = new Set<string>()

  for (const program of templates) {
    if (!program.id.trim()) {
      errors.push('Program id is required.')
      continue
    }

    if (seenProgramIds.has(program.id)) {
      errors.push(`Duplicate program id: ${program.id}`)
      continue
    }
    seenProgramIds.add(program.id)

    if (program.workouts.length === 0) {
      errors.push(`Program ${program.id} has no workouts.`)
      continue
    }

    const workoutIds = new Set(program.workouts.map((workout) => workout.id))

    for (const [dayKey, workoutId] of Object.entries(program.weeklySchedule)) {
      if (workoutId === null) continue
      if (!workoutIds.has(workoutId)) {
        errors.push(`Program ${program.id} day ${dayKey} references missing workout ${workoutId}.`)
      }
    }

    for (const workout of program.workouts) {
      if (!workout.id.trim()) {
        errors.push(`Program ${program.id} has a workout with empty id.`)
        continue
      }

      if (workout.exercises.length === 0) {
        errors.push(`Program ${program.id} workout ${workout.id} has no exercises.`)
      }

      for (const exercise of workout.exercises) {
        if (!exercise.slug.trim()) {
          errors.push(`Program ${program.id} workout ${workout.id} has an empty exercise slug.`)
        }

        if (!Number.isFinite(exercise.sets) || exercise.sets < 1) {
          errors.push(
            `Program ${program.id} workout ${workout.id} has invalid sets for ${exercise.slug}.`,
          )
        }

        if (!Number.isFinite(exercise.reps) || exercise.reps < 1) {
          errors.push(
            `Program ${program.id} workout ${workout.id} has invalid reps for ${exercise.slug}.`,
          )
        }
      }
    }
  }

  return errors
}
