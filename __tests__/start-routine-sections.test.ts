const mockLoadPlans = jest.fn()
const mockBumpRoutineUsage = jest.fn(async () => undefined)
const mockSetWorkoutRoutine = jest.fn(async () => undefined)
const mockCallStartWorkoutFromRoutine = jest.fn()
const mockApplyCreateWorkoutProjection = jest.fn(async () => undefined)
const mockApplyUpsertExercisesProjectionBatch = jest.fn(async () => undefined)

jest.mock('../src/lib/routines', () => {
  const actual = jest.requireActual('../src/lib/routines')
  return {
    ...actual,
    bumpRoutineUsage: (...args: unknown[]) => mockBumpRoutineUsage(...args),
  }
})

jest.mock('../src/lib/plans', () => ({
  loadPlans: (...args: unknown[]) => mockLoadPlans(...args),
}))

jest.mock('../src/db/workouts', () => ({
  callStartWorkoutFromRoutine: (...args: unknown[]) => mockCallStartWorkoutFromRoutine(...args),
}))

jest.mock('../src/lib/workoutMetadata', () => ({
  setWorkoutRoutine: (...args: unknown[]) => mockSetWorkoutRoutine(...args),
}))

jest.mock('../src/features/sync/outbox/workoutProjection', () => ({
  applyCreateWorkoutProjection: (...args: unknown[]) => mockApplyCreateWorkoutProjection(...args),
  applyUpsertExercisesProjectionBatch: (...args: unknown[]) =>
    mockApplyUpsertExercisesProjectionBatch(...args),
}))

jest.mock('../src/config/featureFlags', () => ({
  ...jest.requireActual('../src/config/featureFlags'),
  useStartScheduledWorkoutRPC: false,
}))

import { startRoutine } from '../src/features/routines/startRoutine'

describe('startRoutine projection hydration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLoadPlans.mockResolvedValue({
      '2026-02-01': {
        date: '2026-02-01',
        routineId: 'routine-1',
      },
    })
    mockCallStartWorkoutFromRoutine.mockResolvedValue({
      data: {
        workout: {
          id: 'workout-1',
          user_id: 'user-1',
          client_uuid: 'workout-client-1',
          started_at: '2026-02-01T10:00:00.000Z',
          ended_at: null,
          status: 'in_progress',
          notes: null,
          effort_rating: null,
          session_note: null,
          created_at: '2026-02-01T10:00:00.000Z',
          updated_at: '2026-02-01T10:00:00.000Z',
        },
        exercises: [
          {
            id: 'exercise-1',
            workout_id: 'workout-1',
            client_uuid: 'exercise-client-1',
            exercise_definition_id: 'warm-1',
            order_index: 0,
            notes: null,
            superset_group_id: null,
            superset_order: null,
            created_at: '2026-02-01T10:00:01.000Z',
            updated_at: '2026-02-01T10:00:01.000Z',
          },
          {
            id: 'exercise-2',
            workout_id: 'workout-1',
            client_uuid: 'exercise-client-2',
            exercise_definition_id: 'main-1',
            order_index: 1,
            notes: null,
            superset_group_id: null,
            superset_order: null,
            created_at: '2026-02-01T10:00:02.000Z',
            updated_at: '2026-02-01T10:00:02.000Z',
          },
          {
            id: 'exercise-3',
            workout_id: 'workout-1',
            client_uuid: 'exercise-client-3',
            exercise_definition_id: 'cool-1',
            order_index: 2,
            notes: null,
            superset_group_id: null,
            superset_order: null,
            created_at: '2026-02-01T10:00:03.000Z',
            updated_at: '2026-02-01T10:00:03.000Z',
          },
        ],
      },
      error: null,
    })
  })

  it('hydrates workout + exercises from RPC payload and updates routine metadata', async () => {
    const result = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-02-01',
    })

    expect(result).toEqual({
      workoutId: 'workout-1',
      skippedExerciseDefinitionIds: [],
      errorMessage: null,
    })

    expect(mockCallStartWorkoutFromRoutine).toHaveBeenCalledWith('routine-1')

    expect(mockApplyCreateWorkoutProjection).toHaveBeenCalledWith({
      id: 'workout-1',
      user_id: 'user-1',
      client_uuid: 'workout-client-1',
      started_at: '2026-02-01T10:00:00.000Z',
      created_at: '2026-02-01T10:00:00.000Z',
    })

    expect(mockApplyUpsertExercisesProjectionBatch).toHaveBeenCalledWith('workout-1', [
      expect.objectContaining({ exercise_definition_id: 'warm-1', order_index: 0 }),
      expect.objectContaining({ exercise_definition_id: 'main-1', order_index: 1 }),
      expect.objectContaining({ exercise_definition_id: 'cool-1', order_index: 2 }),
    ])

    expect(mockBumpRoutineUsage).toHaveBeenCalledWith('user-1', 'routine-1')
    expect(mockSetWorkoutRoutine).toHaveBeenCalledWith('user-1', 'workout-1', 'routine-1')
  })
})
