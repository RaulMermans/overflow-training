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

const mockCallStartScheduledWorkout = jest.fn()
jest.mock('../src/db/scheduledRoutines', () => ({
  callStartScheduledWorkout: (...args: unknown[]) => mockCallStartScheduledWorkout(...args),
}))

jest.mock('../src/config/featureFlags', () => ({
  ...jest.requireActual('../src/config/featureFlags'),
  useStartScheduledWorkoutRPC: false,
}))

import { sanitizeErrorMessage } from '../src/utils/errorMessages'
import { startRoutine } from '../src/features/routines/startRoutine'

describe('startRoutine error handling (RPC-only)', () => {
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
        exercises: [],
      },
      error: null,
    })
  })

  it('fails when plannedDateKey is missing or invalid', async () => {
    const missingDate = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '',
    })

    expect(missingDate.workoutId).toBeNull()
    expect(missingDate.errorMessage).toBe(
      'This routine can only be started from a scheduled workout.',
    )
    expect(mockLoadPlans).not.toHaveBeenCalled()
    expect(mockCallStartWorkoutFromRoutine).not.toHaveBeenCalled()
  })

  it('maps routine_not_found to deterministic user message', async () => {
    mockCallStartWorkoutFromRoutine.mockResolvedValue({
      data: null,
      error: new Error('routine_not_found'),
    })

    const result = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-02-01',
    })

    expect(result.workoutId).toBeNull()
    expect(result.errorMessage).toBe(
      'This routine is no longer available. Please sync your routines and try again.',
    )
    expect(mockApplyCreateWorkoutProjection).not.toHaveBeenCalled()
  })

  it('maps routine_empty to deterministic user message', async () => {
    mockCallStartWorkoutFromRoutine.mockResolvedValue({
      data: null,
      error: new Error('routine_empty'),
    })

    const result = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-02-01',
    })

    expect(result.workoutId).toBeNull()
    expect(result.errorMessage).toBe(
      'This routine has no exercises yet. Add at least one exercise before starting.',
    )
  })

  it('maps not_authenticated and forbidden errors deterministically', async () => {
    mockCallStartWorkoutFromRoutine.mockResolvedValueOnce({
      data: null,
      error: new Error('not_authenticated'),
    })

    const authResult = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-02-01',
    })

    expect(authResult.errorMessage).toBe('Your session has expired. Please sign in again.')

    mockCallStartWorkoutFromRoutine.mockResolvedValueOnce({
      data: null,
      error: new Error('forbidden'),
    })

    const forbiddenResult = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-02-01',
    })

    expect(forbiddenResult.errorMessage).toBe('You do not have permission to start this routine.')
  })

  it('sanitizes unknown RPC errors', async () => {
    mockCallStartWorkoutFromRoutine.mockResolvedValue({
      data: null,
      error: new Error('network timeout'),
    })

    const result = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-02-01',
    })

    expect(result.workoutId).toBeNull()
    expect(result.errorMessage).toBe(sanitizeErrorMessage('network timeout'))
  })
})
