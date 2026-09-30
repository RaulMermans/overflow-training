const mockFetchExerciseDefinitionsBySlugs = jest.fn()
const mockDeleteWorkout = jest.fn(async () => ({ error: null }))
const mockCreateWorkoutOptimistic = jest.fn(async () => ({
  data: { id: 'workout-1' },
  error: null,
}))
const mockAddExerciseOptimistic = jest.fn(async () => ({ error: null }))
const mockSetWorkoutProgramContext = jest.fn(async () => undefined)
const mockValidateProgramTemplates = jest.fn(() => [] as string[])
const mockGetProgramWorkoutForDate = jest.fn()
const mockGetProgramWeekdayKey = jest.fn(() => 'mon')
const mockCapture = jest.fn()

jest.mock('../src/analytics/posthogClient', () => ({
  capture: (...args: unknown[]) => mockCapture(...args),
}))

jest.mock('../src/programs/templates', () => ({
  PROGRAM_TEMPLATES: [
    {
      id: 'test-program',
      nameKey: 'programs.template.test.name',
      descriptionKey: 'programs.template.test.description',
      weeklySchedule: {
        mon: 'test-workout',
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      },
      workouts: [
        {
          id: 'test-workout',
          nameKey: 'programs.workout.test',
          exercises: [
            { slug: 'bench-press', sets: 4, reps: 6, type: 'compound', restSeconds: 150 },
            { slug: 'squat', sets: 3, reps: 8, type: 'compound', restSeconds: 120 },
          ],
        },
      ],
    },
  ],
}))

jest.mock('../src/programs/validate', () => ({
  validateProgramTemplates: (...args: unknown[]) => mockValidateProgramTemplates(...args),
}))

jest.mock('../src/features/programs/schedule', () => ({
  getProgramWorkoutForDate: (...args: unknown[]) => mockGetProgramWorkoutForDate(...args),
  getProgramWeekdayKey: (...args: unknown[]) => mockGetProgramWeekdayKey(...args),
}))

jest.mock('../src/db/workouts', () => ({
  fetchExerciseDefinitionsBySlugs: (...args: unknown[]) =>
    mockFetchExerciseDefinitionsBySlugs(...args),
  deleteWorkout: (...args: unknown[]) => mockDeleteWorkout(...args),
}))

jest.mock('../src/features/sync/outbox/workoutMutations', () => ({
  createWorkoutOptimistic: (...args: unknown[]) => mockCreateWorkoutOptimistic(...args),
  addExerciseOptimistic: (...args: unknown[]) => mockAddExerciseOptimistic(...args),
}))

jest.mock('../src/lib/workoutMetadata', () => ({
  setWorkoutProgramContext: (...args: unknown[]) => mockSetWorkoutProgramContext(...args),
}))

import { startProgramWorkout } from '../src/features/programs/startProgramWorkout'

const TEST_WORKOUT = {
  id: 'test-workout',
  nameKey: 'programs.workout.test',
  exercises: [
    { slug: 'bench-press', sets: 4, reps: 6, type: 'compound' as const, restSeconds: 150 },
    { slug: 'squat', sets: 3, reps: 8, type: 'compound' as const, restSeconds: 120 },
  ],
}

describe('startProgramWorkout missing slugs (fail-fast)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockValidateProgramTemplates.mockReturnValue([])
    mockGetProgramWorkoutForDate.mockReturnValue(TEST_WORKOUT)
    mockGetProgramWeekdayKey.mockReturnValue('mon')
  })

  it('returns errorTemplateOutOfDate, does not create workout, and captures analytics when slug is missing', async () => {
    mockFetchExerciseDefinitionsBySlugs.mockResolvedValue({
      data: [{ id: 'def-bench', slug: 'bench-press' }],
      error: null,
    })

    const result = await startProgramWorkout({
      userId: 'user-1',
      programId: 'test-program',
    })

    expect(result.workoutId).toBeNull()
    expect(result.errorKey).toBe('programs.errorTemplateOutOfDate')
    expect(mockCapture).toHaveBeenCalledWith('programs_start_missing_slugs', {
      schema_version: 1,
      error_code: 'VALIDATION',
      missing_count: 1,
      missing_slugs: 'squat',
    })
    expect(mockCreateWorkoutOptimistic).not.toHaveBeenCalled()
  })
})
