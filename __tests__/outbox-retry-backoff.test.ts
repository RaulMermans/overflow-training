jest.mock('../src/db/workouts', () => ({
  insertWorkoutIfMissingFromClient: jest.fn(async () => ({
    data: null,
    error: new Error('Network request failed'),
  })),
  upsertWorkoutFromClient: jest.fn(async () => ({ data: null, error: null })),
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

import { computeOutboxBackoffMs } from '../src/features/sync/outbox/backoff'
import { insertWorkoutIfMissingFromClient } from '../src/db/workouts'
import { loadOutboxQueue } from '../src/features/sync/outbox/fileStore'
import { flushOutboxQueue } from '../src/features/sync/outbox/worker'

describe('outbox retry and backoff', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('computes deterministic exponential backoff', () => {
    expect(computeOutboxBackoffMs(1)).toBe(2000)
    expect(computeOutboxBackoffMs(2)).toBe(4000)
    expect(computeOutboxBackoffMs(3)).toBe(8000)
  })

  it('increments attempt count and schedules retry for retryable failures', async () => {
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
      ],
    })

    const result = await flushOutboxQueue('user-1')

    expect(result.retried).toBe(1)
    expect(result.offline).toBe(true)
    expect(mockSaveOutboxQueue).toHaveBeenCalledTimes(1)

    const savedQueue = mockSaveOutboxQueue.mock.calls[0][1] as {
      events: Array<{ attempt_count: number; next_retry_at: string; status: string }>
    }

    expect(savedQueue.events).toHaveLength(1)
    expect(savedQueue.events[0].attempt_count).toBe(1)
    expect(savedQueue.events[0].status).toBe('pending')
    expect(savedQueue.events[0].next_retry_at > now).toBe(true)
  })

  it('does not label server retries as offline', async () => {
    const now = new Date().toISOString()

    ;(loadOutboxQueue as jest.Mock).mockResolvedValue({
      events: [
        {
          event_id: 'event-server',
          user_id: 'user-1',
          type: 'create_workout',
          entity_client_uuid: 'client-server',
          payload: {
            id: 'w-server',
            user_id: 'user-1',
            client_uuid: 'client-server',
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
    ;(insertWorkoutIfMissingFromClient as jest.Mock).mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Internal Server Error'), { status: 500 }),
    })

    const result = await flushOutboxQueue('user-1')

    expect(result.retried).toBe(1)
    expect(result.offline).toBe(false)
  })

  it('retries when event processing times out', async () => {
    const now = new Date().toISOString()
    ;(loadOutboxQueue as jest.Mock).mockResolvedValue({
      events: [
        {
          event_id: 'event-timeout',
          user_id: 'user-1',
          type: 'create_workout',
          entity_client_uuid: 'client-timeout',
          payload: {
            id: 'w-timeout',
            user_id: 'user-1',
            client_uuid: 'client-timeout',
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

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      handler: (...args: unknown[]) => void,
    ) => {
      if (typeof handler === 'function') {
        handler()
      }
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout)

    ;(insertWorkoutIfMissingFromClient as jest.Mock).mockImplementation(() => new Promise(() => {}))

    try {
      const result = await flushOutboxQueue('user-1')

      expect(result.retried).toBe(1)
      expect(result.blocked).toBe(0)
      expect(mockSaveOutboxQueue).toHaveBeenCalledTimes(1)

      const savedQueue = mockSaveOutboxQueue.mock.calls[0][1] as {
        events: Array<{ attempt_count: number; status: string }>
      }

      expect(savedQueue.events).toHaveLength(1)
      expect(savedQueue.events[0].attempt_count).toBe(1)
      expect(savedQueue.events[0].status).toBe('pending')
    } finally {
      setTimeoutSpy.mockRestore()
    }
  })
})
