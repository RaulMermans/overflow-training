jest.mock('../src/db/workouts', () => ({
  upsertWorkoutSetFromClient: jest.fn(),
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
import { upsertWorkoutSetFromClient, upsertWorkoutExerciseFromClient } from '../src/db/workouts'
import {
  applyUpsertSetProjection,
  applyUpsertExerciseProjection,
} from '../src/features/sync/outbox/workoutProjection'
import { enqueueOutboxEvent } from '../src/features/sync/outbox/worker'
import {
  addSetOptimistic,
  addExerciseOptimistic,
} from '../src/features/sync/outbox/workoutMutations'

describe('workout mutations FK queue behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(applyUpsertSetProjection as jest.Mock).mockResolvedValue(undefined)
    ;(applyUpsertExerciseProjection as jest.Mock).mockResolvedValue(undefined)
  })

  describe('addSetOptimistic', () => {
    it('queues and applies projection when remote returns FK 23503 (parent not synced)', async () => {
      const fkError = { code: '23503', message: 'foreign key constraint violated' }
      ;(upsertWorkoutSetFromClient as jest.Mock).mockResolvedValue({
        data: null,
        error: fkError,
      })

      const result = await addSetOptimistic({
        userId: 'user-1',
        workoutExerciseId: 'we-1',
        trackingMode: 'weight_reps',
        reps: 10,
        setIndex: 1,
        units: 'kg',
      })

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      expect(result.data?.workout_exercise_id).toBe('we-1')
      expect(capture).toHaveBeenCalledWith('offline_entered')
      expect(enqueueOutboxEvent).toHaveBeenCalledTimes(1)
      expect(applyUpsertSetProjection).toHaveBeenCalledTimes(1)
    })

    it('queues when remote returns FK via message only (no code)', async () => {
      ;(upsertWorkoutSetFromClient as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'insert violates foreign key 23503' },
      })

      const result = await addSetOptimistic({
        userId: 'user-1',
        workoutExerciseId: 'we-1',
        trackingMode: 'reps_only',
        reps: 8,
        setIndex: 1,
        units: 'kg',
      })

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      expect(enqueueOutboxEvent).toHaveBeenCalledTimes(1)
      expect(applyUpsertSetProjection).toHaveBeenCalledTimes(1)
    })
  })

  describe('addExerciseOptimistic', () => {
    it('queues and applies projection when remote returns FK on workouts (parent not synced)', async () => {
      const fkWorkoutsError = {
        code: '23503',
        message: 'insert or update on table "workout_exercises" violates foreign key constraint',
        details: 'Key (workout_id)=(w-1) is not present in table "workouts".',
      }
      ;(upsertWorkoutExerciseFromClient as jest.Mock).mockResolvedValue({
        data: null,
        error: fkWorkoutsError,
      })

      const result = await addExerciseOptimistic({
        userId: 'user-1',
        workoutId: 'w-1',
        exerciseDefinitionId: 'ex-1',
        orderIndex: 0,
      })

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      expect(result.data?.workout_id).toBe('w-1')
      expect(capture).toHaveBeenCalledWith('offline_entered')
      expect(enqueueOutboxEvent).toHaveBeenCalledTimes(1)
      expect(applyUpsertExerciseProjection).toHaveBeenCalledTimes(1)
    })

    it('returns error when remote returns FK on exercise_definitions (invalid ref)', async () => {
      const fkExerciseDefError = {
        code: '23503',
        message: 'insert or update on table "workout_exercises" violates foreign key',
        details:
          'Key (exercise_definition_id)=(bad-id) is not present in table "exercise_definitions".',
      }
      ;(upsertWorkoutExerciseFromClient as jest.Mock).mockResolvedValue({
        data: null,
        error: fkExerciseDefError,
      })

      const result = await addExerciseOptimistic({
        userId: 'user-1',
        workoutId: 'w-1',
        exerciseDefinitionId: 'bad-id',
        orderIndex: 0,
      })

      expect(result.error).not.toBeNull()
      expect(result.data).toBeNull()
      expect(enqueueOutboxEvent).not.toHaveBeenCalled()
      expect(applyUpsertExerciseProjection).not.toHaveBeenCalled()
    })
  })
})
