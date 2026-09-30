import { fetchExerciseDefinitionsBySlugs } from '../../db/workouts'
import { PROGRAM_TEMPLATES } from '../../programs/templates'
import { validateProgramTemplates } from '../../programs/validate'
import { getProgramWeekdayKey, getProgramWorkoutForDate } from './schedule'
import { setWorkoutProgramContext } from '../../lib/workoutMetadata'
import { sanitizeErrorMessage } from '../../utils/errorMessages'
import { capture } from '../../analytics/posthogClient'
import {
  addExerciseOptimistic,
  cancelWorkoutOptimistic,
  createWorkoutOptimistic,
} from '../sync/outbox/workoutMutations'

interface StartProgramWorkoutInput {
  userId: string
  programId: string
  date?: Date
}

export interface StartProgramWorkoutResult {
  workoutId: string | null
  programWorkoutNameKey: string | null
  skippedExerciseSlugs: string[]
  errorKey:
    | 'programs.errorLogin'
    | 'programs.errorNotFound'
    | 'programs.errorRestDay'
    | 'programs.errorNoExercises'
    | 'programs.errorStartWorkout'
    | 'programs.errorTemplateOutOfDate'
    | null
  errorMessage: string | null
}

export async function startProgramWorkout({
  userId,
  programId,
  date = new Date(),
}: StartProgramWorkoutInput): Promise<StartProgramWorkoutResult> {
  const templateValidationErrors = validateProgramTemplates(PROGRAM_TEMPLATES)
  if (templateValidationErrors.length > 0) {
    return {
      workoutId: null,
      programWorkoutNameKey: null,
      skippedExerciseSlugs: [],
      errorKey: 'programs.errorStartWorkout',
      errorMessage: null,
    }
  }

  if (!userId) {
    return {
      workoutId: null,
      programWorkoutNameKey: null,
      skippedExerciseSlugs: [],
      errorKey: 'programs.errorLogin',
      errorMessage: null,
    }
  }

  const targetProgram = PROGRAM_TEMPLATES.find((program) => program.id === programId)
  if (!targetProgram) {
    return {
      workoutId: null,
      programWorkoutNameKey: null,
      skippedExerciseSlugs: [],
      errorKey: 'programs.errorNotFound',
      errorMessage: null,
    }
  }

  const targetWorkout = getProgramWorkoutForDate(targetProgram, date)
  if (!targetWorkout) {
    return {
      workoutId: null,
      programWorkoutNameKey: null,
      skippedExerciseSlugs: [],
      errorKey: 'programs.errorRestDay',
      errorMessage: null,
    }
  }

  try {
    const { data: definitions, error: definitionError } = await fetchExerciseDefinitionsBySlugs(
      targetWorkout.exercises.map((exercise) => exercise.slug),
    )

    if (definitionError) {
      return {
        workoutId: null,
        programWorkoutNameKey: targetWorkout.nameKey,
        skippedExerciseSlugs: [],
        errorKey: 'programs.errorStartWorkout',
        errorMessage: sanitizeErrorMessage(definitionError.message),
      }
    }

    const definitionIdBySlug = new Map(
      (definitions ?? []).map((definition) => [definition.slug, definition.id]),
    )

    const missingSlugs = targetWorkout.exercises
      .map((e) => e.slug)
      .filter((slug) => !definitionIdBySlug.has(slug))

    if (missingSlugs.length > 0) {
      capture('programs_start_missing_slugs', {
        schema_version: 1,
        error_code: 'VALIDATION',
        missing_count: missingSlugs.length,
        missing_slugs: missingSlugs.slice(0, 50).join(','),
      })
      return {
        workoutId: null,
        programWorkoutNameKey: targetWorkout.nameKey,
        skippedExerciseSlugs: [],
        errorKey: 'programs.errorTemplateOutOfDate',
        errorMessage: null,
      }
    }

    const { data: workout, error: createError } = await createWorkoutOptimistic(userId)
    if (createError || !workout) {
      return {
        workoutId: null,
        programWorkoutNameKey: targetWorkout.nameKey,
        skippedExerciseSlugs: [],
        errorKey: 'programs.errorStartWorkout',
        errorMessage: sanitizeErrorMessage(createError?.message ?? 'Failed to start workout.'),
      }
    }

    const addedTargets: {
      slug: string
      exerciseDefinitionId: string
      sets: number
      reps: number
      type: 'compound' | 'accessory'
      restSeconds?: number
    }[] = []

    let addedCount = 0

    for (const exercise of targetWorkout.exercises) {
      const exerciseDefinitionId = definitionIdBySlug.get(exercise.slug)!

      const { error: addError } = await addExerciseOptimistic({
        userId,
        workoutId: workout.id,
        exerciseDefinitionId,
        orderIndex: addedCount,
      })

      if (addError) {
        await cancelWorkoutOptimistic({ userId, workoutId: workout.id })
        return {
          workoutId: null,
          programWorkoutNameKey: targetWorkout.nameKey,
          skippedExerciseSlugs: [],
          errorKey: 'programs.errorStartWorkout',
          errorMessage: sanitizeErrorMessage(addError.message),
        }
      }

      addedTargets.push({
        slug: exercise.slug,
        exerciseDefinitionId,
        sets: exercise.sets,
        reps: exercise.reps,
        type: exercise.type,
        restSeconds: exercise.restSeconds,
      })
      addedCount += 1
    }

    if (addedCount <= 0) {
      await cancelWorkoutOptimistic({ userId, workoutId: workout.id })
      return {
        workoutId: null,
        programWorkoutNameKey: targetWorkout.nameKey,
        skippedExerciseSlugs: [],
        errorKey: 'programs.errorNoExercises',
        errorMessage: null,
      }
    }

    try {
      await setWorkoutProgramContext(userId, workout.id, {
        programId: targetProgram.id,
        programNameKey: targetProgram.nameKey,
        workoutTemplateId: targetWorkout.id,
        workoutNameKey: targetWorkout.nameKey,
        dayKey: getProgramWeekdayKey(date),
        targets: addedTargets,
      })
    } catch {
      // Local metadata persistence should never block workout start.
    }

    return {
      workoutId: workout.id,
      programWorkoutNameKey: targetWorkout.nameKey,
      skippedExerciseSlugs: [],
      errorKey: null,
      errorMessage: null,
    }
  } catch (error) {
    return {
      workoutId: null,
      programWorkoutNameKey: targetWorkout.nameKey,
      skippedExerciseSlugs: [],
      errorKey: 'programs.errorStartWorkout',
      errorMessage: sanitizeErrorMessage(
        error instanceof Error ? error.message : 'Failed to start workout.',
      ),
    }
  }
}
