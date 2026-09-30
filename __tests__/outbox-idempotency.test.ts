jest.mock('../src/db/workouts', () => ({
  insertWorkoutIfMissingFromClient: jest.fn(async () => ({ data: { id: 'w1' }, error: null })),
  upsertWorkoutFromClient: jest.fn(async () => ({ data: { id: 'w1' }, error: null })),
  upsertWorkoutExerciseFromClient: jest.fn(async () => ({ data: { id: 'we1' }, error: null })),
  upsertWorkoutSetFromClient: jest.fn(async () => ({ data: { id: 'ws1' }, error: null })),
  updateWorkoutSet: jest.fn(async () => ({ data: { id: 'ws1' }, error: null })),
  deleteWorkoutSet: jest.fn(async () => ({ error: null })),
  deleteWorkoutExercise: jest.fn(async () => ({ error: null })),
  finishWorkoutAt: jest.fn(async () => ({ data: { id: 'w1' }, error: null })),
  finishWorkoutWithMetaAt: jest.fn(async () => ({ data: { id: 'w1' }, error: null })),
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

describe('outbox idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('flushes duplicate create_workout events without blocking the queue', async () => {
    const now = new Date().toISOString()

    ;(loadOutboxQueue as jest.Mock).mockResolvedValue({
      events: [
        {
          event_id: 'event-1',
          user_id: 'user-1',
          type: 'create_workout',
          entity_client_uuid: 'client-1',
          payload: {
            id: 'w1',
            user_id: 'user-1',
            client_uuid: 'client-1',
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
          event_id: 'event-2',
          user_id: 'user-1',
          type: 'create_workout',
          entity_client_uuid: 'client-1',
          payload: {
            id: 'w1',
            user_id: 'user-1',
            client_uuid: 'client-1',
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

    expect(result.attempted).toBe(2)
    expect(result.synced).toBe(2)
    expect(result.blocked).toBe(0)
    expect(mockSaveOutboxQueue).toHaveBeenCalledWith('user-1', { events: [] })
  })
})
