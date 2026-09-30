/**
 * Phase 4: start_scheduled_workout path, retry auto-schedule fallback,
 * and no_schedule_for_date error mapping.
 * useStartScheduledWorkoutRPC is mocked true; callStartScheduledWorkout is used.
 */
const mockCallStartScheduledWorkout = jest.fn()
const mockScheduleRoutineForDate = jest.fn()
const mockCallStartWorkoutFromRoutine = jest.fn()
const mockLoadPlans = jest.fn()
const mockBumpRoutineUsage = jest.fn(async () => undefined)
const mockSetWorkoutRoutine = jest.fn(async () => undefined)
const mockApplyCreateWorkoutProjection = jest.fn(async () => undefined)
const mockApplyUpsertExercisesProjectionBatch = jest.fn(async () => undefined)

jest.mock('../src/config/featureFlags', () => ({
  ...jest.requireActual('../src/config/featureFlags'),
  useStartScheduledWorkoutRPC: true,
}))

jest.mock('../src/db/scheduledRoutines', () => ({
  callStartScheduledWorkout: (...args: unknown[]) => mockCallStartScheduledWorkout(...args),
  scheduleRoutineForDate: (...args: unknown[]) => mockScheduleRoutineForDate(...args),
}))

jest.mock('../src/db/workouts', () => ({
  callStartWorkoutFromRoutine: (...args: unknown[]) => mockCallStartWorkoutFromRoutine(...args),
}))

jest.mock('../src/lib/plans', () => ({
  loadPlans: (...args: unknown[]) => mockLoadPlans(...args),
}))

jest.mock('../src/lib/routines', () => {
  const actual = jest.requireActual('../src/lib/routines')
  return {
    ...actual,
    bumpRoutineUsage: (...args: unknown[]) => mockBumpRoutineUsage(...args),
  }
})

jest.mock('../src/lib/workoutMetadata', () => ({
  setWorkoutRoutine: (...args: unknown[]) => mockSetWorkoutRoutine(...args),
}))

jest.mock('../src/features/sync/outbox/workoutProjection', () => ({
  applyCreateWorkoutProjection: (...args: unknown[]) => mockApplyCreateWorkoutProjection(...args),
  applyUpsertExercisesProjectionBatch: (...args: unknown[]) =>
    mockApplyUpsertExercisesProjectionBatch(...args),
}))

import { startRoutine } from '../src/features/routines/startRoutine'

describe('startRoutine (useStartScheduledWorkoutRPC)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockScheduleRoutineForDate.mockResolvedValue({
      ok: false,
      error: new Error('No routine scheduled for this day.'),
    })
    mockCallStartScheduledWorkout.mockResolvedValue({
      data: {
        workout: {
          id: 'workout-1',
          user_id: 'user-1',
          client_uuid: 'workout-client-1',
          started_at: '2026-02-01T10:00:00.000Z',
          created_at: '2026-02-01T10:00:00.000Z',
        },
        exercises: [],
      },
      error: null,
    })
  })

  it('calls callStartScheduledWorkout with date and does not call loadPlans', async () => {
    const result = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-02-01',
    })

    expect(result.workoutId).toBe('workout-1')
    expect(result.errorMessage).toBeNull()
    expect(mockLoadPlans).not.toHaveBeenCalled()
    expect(mockCallStartWorkoutFromRoutine).not.toHaveBeenCalled()
    expect(mockCallStartScheduledWorkout).toHaveBeenCalledTimes(1)
    expect(mockCallStartScheduledWorkout).toHaveBeenCalledWith('2026-02-01')
    expect(mockScheduleRoutineForDate).not.toHaveBeenCalled()
  })

  it('auto-schedules and retries when no schedule exists for the date', async () => {
    mockCallStartScheduledWorkout
      .mockResolvedValueOnce({
        data: null,
        error: new Error('no_schedule_for_date'),
      })
      .mockResolvedValueOnce({
        data: {
          workout: {
            id: 'workout-2',
            user_id: 'user-1',
            client_uuid: 'workout-client-2',
            started_at: '2026-02-01T11:00:00.000Z',
            created_at: '2026-02-01T11:00:00.000Z',
          },
          exercises: [],
        },
        error: null,
      })
    mockScheduleRoutineForDate.mockResolvedValueOnce({
      ok: true,
      error: null,
    })

    const result = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-02-01',
    })

    expect(result.workoutId).toBe('workout-2')
    expect(result.errorMessage).toBeNull()
    expect(mockScheduleRoutineForDate).toHaveBeenCalledWith('2026-02-01', 'routine-1')
    expect(mockCallStartScheduledWorkout).toHaveBeenCalledTimes(2)
  })

  it('maps no_schedule_for_date to user message', async () => {
    mockCallStartScheduledWorkout.mockResolvedValue({
      data: null,
      error: new Error('no_schedule_for_date'),
    })

    const result = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-02-01',
    })

    expect(result.workoutId).toBeNull()
    expect(result.errorMessage).toBe('No routine scheduled for this day.')
    expect(mockScheduleRoutineForDate).toHaveBeenCalledWith('2026-02-01', 'routine-1')
  })

  it('maps No routine scheduled for this day. (message) to same message', async () => {
    mockCallStartScheduledWorkout.mockResolvedValue({
      data: null,
      error: new Error('No routine scheduled for this day.'),
    })

    const result = await startRoutine({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-02-01',
    })

    expect(result.workoutId).toBeNull()
    expect(result.errorMessage).toBe('No routine scheduled for this day.')
    expect(mockScheduleRoutineForDate).toHaveBeenCalledWith('2026-02-01', 'routine-1')
  })
})
