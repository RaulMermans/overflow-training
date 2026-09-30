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

describe('startRoutine RPC-only contract behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLoadPlans.mockResolvedValue({
      '2026-03-01': {
        date: '2026-03-01',
        routineId: 'routine-1',
      },
    })
    mockCallStartWorkoutFromRoutine.mockResolvedValue({
      data: {
        workout: {
          id: 'workout-1',
          user_id: 'user-1',
          client_uuid: 'workout-client-1',
          started_at: '2026-03-01T10:00:00.000Z',
          ended_at: null,
          status: 'in_progress',
          notes: null,
          effort_rating: null,
          session_note: null,
          created_at: '2026-03-01T10:00:00.000Z',
          updated_at: '2026-03-01T10:00:00.000Z',
        },
        exercises: [
          {
            id: 'exercise-1',
            workout_id: 'workout-1',
            client_uuid: 'exercise-client-1',
            exercise_definition_id: 'exercise-def-1',
            order_index: 0,
            notes: null,
            superset_group_id: null,
            superset_order: null,
            created_at: '2026-03-01T10:00:01.000Z',
            updated_at: '2026-03-01T10:00:01.000Z',
          },
        ],
      },
      error: null,
    })
  })

  it('trims routine id before invoking RPC', async () => {
    await startRoutine({
      userId: 'user-1',
      routineId: '   routine-1   ',
      plannedDateKey: '2026-03-01',
    })

    expect(mockCallStartWorkoutFromRoutine).toHaveBeenCalledWith('routine-1')
  })

  it('still succeeds when local metadata updates fail', async () => {
    mockBumpRoutineUsage.mockImplementation(async () => {
      throw new Error('usage write failed')
    })

    const result = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-03-01',
    })

    expect(result).toEqual({
      workoutId: 'workout-1',
      skippedExerciseDefinitionIds: [],
      errorMessage: null,
    })
    expect(mockSetWorkoutRoutine).toHaveBeenCalledWith('user-1', 'workout-1', 'routine-1')
  })

  it('maps already-normalized DB-layer message for routine_empty', async () => {
    mockCallStartWorkoutFromRoutine.mockResolvedValue({
      data: null,
      error: new Error('This routine has no exercises yet.'),
    })

    const result = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-03-01',
    })

    expect(result.workoutId).toBeNull()
    expect(result.errorMessage).toBe(
      'This routine has no exercises yet. Add at least one exercise before starting.',
    )
  })
})
