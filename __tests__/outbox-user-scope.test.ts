jest.mock('../src/db/workouts', () => ({
  insertWorkoutIfMissingFromClient: jest.fn(async () => ({ data: { id: 'w1' }, error: null })),
  upsertWorkoutFromClient: jest.fn(async () => ({ data: { id: 'w1' }, error: null })),
  upsertWorkoutExerciseFromClient: jest.fn(async () => ({ data: null, error: null })),
  upsertWorkoutSetFromClient: jest.fn(async () => ({ data: null, error: null })),
  updateWorkoutSet: jest.fn(async () => ({ data: null, error: null })),
  deleteWorkoutSet: jest.fn(async () => ({ error: null })),
  deleteWorkoutExercise: jest.fn(async () => ({ error: null })),
  finishWorkoutAt: jest.fn(async () => ({ data: null, error: null })),
  finishWorkoutWithMetaAt: jest.fn(async () => ({ data: null, error: null })),
  deleteWorkout: jest.fn(async () => ({ error: null })),
}))

const mockSaveOutboxQueue = jest.fn(async () => undefined)

jest.mock('../src/features/sync/outbox/fileStore', () => ({
  loadOutboxQueue: jest.fn(),
  saveOutboxQueue: (...args: unknown[]) => mockSaveOutboxQueue(...args),
}))

jest.mock('../src/analytics/posthogClient', () => ({
  capture: jest.fn(),
}))

import { loadOutboxQueue } from '../src/features/sync/outbox/fileStore'
import { flushOutboxQueue } from '../src/features/sync/outbox/worker'

describe('outbox user scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('flushes only the requested user queue and does not replay events from another user', async () => {
    const now = new Date().toISOString()

    ;(loadOutboxQueue as jest.Mock).mockResolvedValue({
      events: [
        {
          event_id: 'event-u1',
          user_id: 'user-1',
          type: 'create_workout',
          entity_client_uuid: 'client-u1',
          payload: {
            id: 'w-user-1',
            user_id: 'user-1',
            client_uuid: 'client-u1',
            started_at: now,
            created_at: now,
          },
          attempt_count: 0,
          next_retry_at: now,
          status: 'pending',
          created_at: now,
          updated_at: now,
        },
        {
          event_id: 'event-u2',
          user_id: 'user-2',
          type: 'create_workout',
          entity_client_uuid: 'client-u2',
          payload: {
            id: 'w-user-2',
            user_id: 'user-2',
            client_uuid: 'client-u2',
            started_at: now,
            created_at: now,
          },
          attempt_count: 0,
          next_retry_at: now,
          status: 'pending',
          created_at: now,
          updated_at: now,
        },
      ],
    })

    const result = await flushOutboxQueue('user-1')

    expect(result.attempted).toBe(1)
    expect(result.synced).toBe(1)
    expect(result.blocked).toBe(0)
    expect(mockSaveOutboxQueue).toHaveBeenCalledWith('user-1', {
      events: [],
    })
  })
})
