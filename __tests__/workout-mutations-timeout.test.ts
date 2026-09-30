jest.mock('../src/db/workouts', () => ({
  finishWorkout: jest.fn(),
}))

jest.mock('../src/db/scheduledRoutines', () => ({
  completeScheduledRoutineByWorkoutId: jest.fn(async () => ({ error: null })),
}))

jest.mock('../src/features/sync/outbox/workoutProjection', () => ({
  applyCancelWorkoutProjection: jest.fn(async () => undefined),
  applyCreateWorkoutProjection: jest.fn(async () => undefined),
  applyDeleteExerciseProjection: jest.fn(async () => undefined),
  applyDeleteSetProjection: jest.fn(async () => undefined),
  applyFinishWorkoutProjection: jest.fn(async () => undefined),
  applyFinishWorkoutWithMetaProjection: jest.fn(async () => undefined),
  applyUpdateSetProjection: jest.fn(async () => undefined),
  applyUpsertExerciseProjection: jest.fn(async () => undefined),
  applyUpsertSetProjection: jest.fn(async () => undefined),
  getProjectionInProgressWorkout: jest.fn(async () => null),
  getProjectionSetById: jest.fn(async () => null),
  getProjectionWorkoutDetail: jest.fn(async () => null),
}))

jest.mock('../src/features/sync/outbox/worker', () => ({
  enqueueOutboxEvent: jest.fn(async () => undefined),
  loadOutboxState: jest.fn(async () => ({ events: [] })),
}))

jest.mock('../src/analytics/posthogClient', () => ({
  capture: jest.fn(),
}))

import { capture } from '../src/analytics/posthogClient'
import { finishWorkout } from '../src/db/workouts'
import { completeScheduledRoutineByWorkoutId } from '../src/db/scheduledRoutines'
import { enqueueOutboxEvent } from '../src/features/sync/outbox/worker'
import { applyFinishWorkoutProjection } from '../src/features/sync/outbox/workoutProjection'
import { finishWorkoutOptimistic } from '../src/features/sync/outbox/workoutMutations'

describe('workout mutation timeout handling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('queues finish_workout and applies projection when remote finish times out', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      handler: (...args: unknown[]) => void,
    ) => {
      if (typeof handler === 'function') {
        handler()
      }
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout)

    try {
      ;(finishWorkout as jest.Mock).mockImplementation(() => new Promise(() => {}))

      const pending = finishWorkoutOptimistic({
        userId: 'user-1',
        workoutId: 'workout-1',
      })

      const result = await pending

      expect(result).toEqual({ data: null, error: null, persistence: 'queued' })
      expect(capture).toHaveBeenCalledWith('offline_entered')
      expect(enqueueOutboxEvent).toHaveBeenCalledTimes(1)
      expect(applyFinishWorkoutProjection).toHaveBeenCalledWith({
        workout_id: 'workout-1',
        ended_at: expect.any(String),
      })
    } finally {
      setTimeoutSpy.mockRestore()
    }
  })

  it('marks remote completion as durable and updates linked schedules when finish succeeds', async () => {
    ;(finishWorkout as jest.Mock).mockResolvedValue({
      data: {
        id: 'workout-1',
        user_id: 'user-1',
        client_uuid: 'client-1',
        started_at: '2026-03-12T08:00:00.000Z',
        ended_at: '2026-03-12T09:00:00.000Z',
        status: 'completed',
        notes: null,
        effort_rating: null,
        session_note: null,
        created_at: '2026-03-12T08:00:00.000Z',
      },
      error: null,
    })

    const result = await finishWorkoutOptimistic({
      userId: 'user-1',
      workoutId: 'workout-1',
    })

    expect(result.persistence).toBe('remote')
    expect(result.error).toBeNull()
    expect(completeScheduledRoutineByWorkoutId).toHaveBeenCalledWith('workout-1')
    expect(enqueueOutboxEvent).not.toHaveBeenCalled()
  })

  it('queues a retry when the workout row completes remotely but schedule completion fails', async () => {
    ;(finishWorkout as jest.Mock).mockResolvedValue({
      data: {
        id: 'workout-1',
        user_id: 'user-1',
        client_uuid: 'client-1',
        started_at: '2026-03-12T08:00:00.000Z',
        ended_at: '2026-03-12T09:00:00.000Z',
        status: 'completed',
        notes: null,
        effort_rating: null,
        session_note: null,
        created_at: '2026-03-12T08:00:00.000Z',
      },
      error: null,
    })
    ;(completeScheduledRoutineByWorkoutId as jest.Mock).mockResolvedValue({
      error: new Error('schedule update failed'),
    })

    const result = await finishWorkoutOptimistic({
      userId: 'user-1',
      workoutId: 'workout-1',
    })

    expect(result).toEqual({
      data: expect.objectContaining({ id: 'workout-1', status: 'completed' }),
      error: null,
      persistence: 'queued',
    })
    expect(enqueueOutboxEvent).toHaveBeenCalledTimes(1)
    expect(applyFinishWorkoutProjection).toHaveBeenCalledWith({
      workout_id: 'workout-1',
      ended_at: expect.any(String),
    })
  })
})
