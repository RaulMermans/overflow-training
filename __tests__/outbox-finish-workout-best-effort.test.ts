/**
 * Verifies that a transient failure in completeScheduledRoutineByWorkoutId
 * does not block finish_workout or finish_workout_with_meta outbox events.
 *
 * Root cause this guards against:
 *   finishWorkoutAt/finishWorkoutWithMetaAt succeeds (workout is completed in DB),
 *   but completeScheduledRoutineByWorkoutId fails transiently. Before the fix,
 *   the outbox returned { ok: false } and triggered an unnecessary retry cycle.
 *   On retry exhaustion the event would be blocked, leaving scheduled_routines
 *   stuck in 'started' status even though the workout was durably completed.
 */

jest.mock('../src/db/workouts', () => ({
  insertWorkoutIfMissingFromClient: jest.fn(async () => ({ data: { id: 'w1' }, error: null })),
  upsertWorkoutExerciseFromClient: jest.fn(async () => ({ data: { id: 'we1' }, error: null })),
  upsertWorkoutSetFromClient: jest.fn(async () => ({ data: { id: 'ws1' }, error: null })),
  updateWorkoutSet: jest.fn(async () => ({ data: { id: 'ws1' }, error: null })),
  deleteWorkoutSet: jest.fn(async () => ({ error: null })),
  deleteWorkoutExercise: jest.fn(async () => ({ error: null })),
  finishWorkoutAt: jest.fn(async () => ({ data: { id: 'w1' }, error: null })),
  finishWorkoutWithMetaAt: jest.fn(async () => ({ data: { id: 'w1' }, error: null })),
  deleteWorkout: jest.fn(async () => ({ error: null })),
}))

jest.mock('../src/db/scheduledRoutines', () => ({
  completeScheduledRoutineByWorkoutId: jest.fn(async () => ({
    error: new Error('Network request failed'),
  })),
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
import { finishWorkoutAt, finishWorkoutWithMetaAt } from '../src/db/workouts'
import { completeScheduledRoutineByWorkoutId } from '../src/db/scheduledRoutines'

function makeEvent(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  return {
    event_id: 'event-finish-1',
    user_id: 'user-1',
    entity_client_uuid: 'client-1',
    attempt_count: 0,
    next_retry_at: now,
    status: 'pending',
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

describe('outbox finish_workout best-effort schedule completion', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('finish_workout succeeds even when completeScheduledRoutineByWorkoutId fails', async () => {
    const now = new Date().toISOString()

    ;(loadOutboxQueue as jest.Mock).mockResolvedValue({
      events: [
        makeEvent({
          type: 'finish_workout',
          payload: {
            workout_id: 'w1',
            ended_at: now,
          },
        }),
      ],
    })

    const result = await flushOutboxQueue('user-1')

    expect(finishWorkoutAt).toHaveBeenCalledWith('w1', now)
    expect(completeScheduledRoutineByWorkoutId).toHaveBeenCalledWith('w1')
    expect(result.synced).toBe(1)
    expect(result.retried).toBe(0)
    expect(result.blocked).toBe(0)
    // Queue should be empty — event removed as successfully synced
    expect(mockSaveOutboxQueue).toHaveBeenCalledWith('user-1', { events: [] })
  })

  it('finish_workout_with_meta succeeds even when completeScheduledRoutineByWorkoutId fails', async () => {
    const now = new Date().toISOString()

    ;(loadOutboxQueue as jest.Mock).mockResolvedValue({
      events: [
        makeEvent({
          type: 'finish_workout_with_meta',
          payload: {
            workout_id: 'w1',
            ended_at: now,
            effort_rating: 3,
            session_note: 'Felt great',
            notes: null,
          },
        }),
      ],
    })

    const result = await flushOutboxQueue('user-1')

    expect(finishWorkoutWithMetaAt).toHaveBeenCalledWith('w1', {
      endedAt: now,
      notes: null,
      effort_rating: 3,
      session_note: 'Felt great',
    })
    expect(completeScheduledRoutineByWorkoutId).toHaveBeenCalledWith('w1')
    expect(result.synced).toBe(1)
    expect(result.retried).toBe(0)
    expect(result.blocked).toBe(0)
    expect(mockSaveOutboxQueue).toHaveBeenCalledWith('user-1', { events: [] })
  })

  it('finish_workout still fails when finishWorkoutAt itself fails', async () => {
    const now = new Date().toISOString()
    ;(finishWorkoutAt as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: new Error('Network request failed'),
    })
    ;(loadOutboxQueue as jest.Mock).mockResolvedValue({
      events: [
        makeEvent({
          type: 'finish_workout',
          payload: {
            workout_id: 'w1',
            ended_at: now,
          },
        }),
      ],
    })

    const result = await flushOutboxQueue('user-1')

    expect(result.synced).toBe(0)
    expect(result.retried).toBe(1)
    expect(result.blocked).toBe(0)
    // completeScheduledRoutineByWorkoutId must NOT be called if the workout finish failed
    expect(completeScheduledRoutineByWorkoutId).not.toHaveBeenCalled()
  })
})
