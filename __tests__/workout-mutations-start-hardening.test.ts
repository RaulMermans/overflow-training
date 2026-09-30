jest.mock('../src/db/workouts', () => ({
  createWorkout: jest.fn(),
  upsertWorkoutExerciseFromClient: jest.fn(),
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
import { createWorkout, upsertWorkoutExerciseFromClient } from '../src/db/workouts'
import {
  applyCreateWorkoutProjection,
  applyUpsertExerciseProjection,
} from '../src/features/sync/outbox/workoutProjection'
import { enqueueOutboxEvent } from '../src/features/sync/outbox/worker'
import {
  addExerciseOptimistic,
  createWorkoutOptimistic,
} from '../src/features/sync/outbox/workoutMutations'

describe('workout mutations start hardening', () => {
  let warnSpy: jest.SpyInstance
  const applyCreateProjectionMock = applyCreateWorkoutProjection as unknown as {
    mockImplementation: (fn: () => Promise<void>) => void
  }
  const applyUpsertProjectionMock = applyUpsertExerciseProjection as unknown as {
    mockImplementation: (fn: () => Promise<void>) => void
  }

  beforeEach(() => {
    jest.clearAllMocks()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation()
    applyCreateProjectionMock.mockImplementation(async () => undefined)
    applyUpsertProjectionMock.mockImplementation(async () => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('queues create_workout when createWorkout throws a retryable error', async () => {
    ;(createWorkout as jest.Mock).mockImplementation(() => {
      throw new Error('Network request failed')
    })

    const result = await createWorkoutOptimistic('user-1')

    expect(result.error).toBeNull()
    expect(result.data?.user_id).toBe('user-1')
    expect(capture).toHaveBeenCalledWith('offline_entered')
    expect(enqueueOutboxEvent).toHaveBeenCalledTimes(1)
    expect(applyCreateWorkoutProjection).toHaveBeenCalledTimes(1)
  })

  it('queues upsert_exercise when exercise upsert throws a retryable error', async () => {
    ;(upsertWorkoutExerciseFromClient as jest.Mock).mockImplementation(() => {
      throw new Error('The Internet connection appears to be offline.')
    })

    const result = await addExerciseOptimistic({
      userId: 'user-1',
      workoutId: 'workout-1',
      exerciseDefinitionId: 'exercise-1',
      orderIndex: 0,
    })

    expect(result.error).toBeNull()
    expect(result.data?.workout_id).toBe('workout-1')
    expect(capture).toHaveBeenCalledWith('offline_entered')
    expect(enqueueOutboxEvent).toHaveBeenCalledTimes(1)
    expect(applyUpsertExerciseProjection).toHaveBeenCalledTimes(1)
  })

  it('does not fail create_workout when local projection write fails after remote success', async () => {
    ;(createWorkout as jest.Mock).mockResolvedValue({
      data: {
        id: 'workout-1',
        user_id: 'user-1',
        client_uuid: 'client-1',
        started_at: '2026-01-01T00:00:00.000Z',
        ended_at: null,
        status: 'in_progress',
        notes: null,
        effort_rating: null,
        session_note: null,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    })
    applyCreateProjectionMock.mockImplementation(async () => {
      throw new Error('projection failed')
    })

    const result = await createWorkoutOptimistic('user-1')

    expect(result.error).toBeNull()
    expect(result.data?.id).toBe('workout-1')
    expect(enqueueOutboxEvent).not.toHaveBeenCalled()
  })

  it('does not fail upsert_exercise when local projection write fails after remote success', async () => {
    ;(upsertWorkoutExerciseFromClient as jest.Mock).mockResolvedValue({
      data: {
        id: 'exercise-row-1',
        workout_id: 'workout-1',
        client_uuid: 'client-exercise-1',
        exercise_definition_id: 'exercise-1',
        order_index: 0,
        notes: null,
        superset_group_id: null,
        superset_order: null,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    })
    applyUpsertProjectionMock.mockImplementation(async () => {
      throw new Error('projection failed')
    })

    const result = await addExerciseOptimistic({
      userId: 'user-1',
      workoutId: 'workout-1',
      exerciseDefinitionId: 'exercise-1',
      orderIndex: 0,
    })

    expect(result.error).toBeNull()
    expect(result.data?.id).toBe('exercise-row-1')
    expect(enqueueOutboxEvent).not.toHaveBeenCalled()
  })
})
