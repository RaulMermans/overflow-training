/**
 * Unit tests for outbox worker — PHASE C invariants.
 * Run with: npm test -- worker
 *
 * Mocked boundaries:
 *   - fileStore    (expo-file-system — native, cannot run in Jest)
 *   - db/workouts  (Supabase client — network)
 *   - posthogClient (analytics — side-effect)
 *   - withTimeout  (pass-through in tests)
 */

import { flushOutboxQueue } from '../worker'
import type { OutboxEvent, OutboxQueueState } from '../types'

// ─── Module mocks ─────────────────────────────────────────────────────────

jest.mock('../fileStore', () => ({
  loadOutboxQueue: jest.fn(),
  saveOutboxQueue: jest.fn(),
}))

jest.mock('../../../../db/workouts', () => ({
  insertWorkoutIfMissingFromClient: jest.fn(),
  upsertWorkoutFromClient: jest.fn(),
  upsertWorkoutExerciseFromClient: jest.fn(),
  upsertWorkoutSetFromClient: jest.fn(),
  updateWorkoutSet: jest.fn(),
  deleteWorkoutSet: jest.fn(),
  deleteWorkoutExercise: jest.fn(),
  finishWorkoutAt: jest.fn(),
  finishWorkoutWithMetaAt: jest.fn(),
  deleteWorkout: jest.fn(),
}))

jest.mock('../../../../analytics/posthogClient', () => ({
  capture: jest.fn(),
}))

// Pass-through: resolves immediately with the promise result.
jest.mock('../../../../lib/withTimeout', () => ({
  withTimeout: jest.fn((promise: Promise<unknown>) => promise),
}))

// ─── Imports (after jest.mock) ────────────────────────────────────────────

import { loadOutboxQueue, saveOutboxQueue } from '../fileStore'
import {
  insertWorkoutIfMissingFromClient,
  upsertWorkoutExerciseFromClient,
  upsertWorkoutSetFromClient,
} from '../../../../db/workouts'

const mockLoadOutboxQueue = loadOutboxQueue as jest.MockedFunction<typeof loadOutboxQueue>
const mockSaveOutboxQueue = saveOutboxQueue as jest.MockedFunction<typeof saveOutboxQueue>
const mockInsertWorkout = insertWorkoutIfMissingFromClient as jest.MockedFunction<
  typeof insertWorkoutIfMissingFromClient
>
const mockUpsertExercise = upsertWorkoutExerciseFromClient as jest.MockedFunction<
  typeof upsertWorkoutExerciseFromClient
>
const mockUpsertSet = upsertWorkoutSetFromClient as jest.MockedFunction<
  typeof upsertWorkoutSetFromClient
>

// ─── Helpers ──────────────────────────────────────────────────────────────

const PAST = '2024-01-14T10:00:00.000Z'
const FUTURE = '2099-01-01T00:00:00.000Z'
/** Within worker MAX_OUTBOX_AGE_MS (20 min) so events are attempted, not age-blocked. */
const RECENT = new Date(Date.now() - 60_000).toISOString()
const USER_ID = 'user-abc'

function makeEvent(overrides: Partial<OutboxEvent> & { type: OutboxEvent['type'] }): OutboxEvent {
  return {
    event_id: `evt-${Math.random().toString(36).slice(2)}`,
    user_id: USER_ID,
    entity_client_uuid: 'client-uuid-1',
    payload: {},
    attempt_count: 0,
    next_retry_at: PAST,
    status: 'pending',
    created_at: PAST,
    updated_at: PAST,
    ...overrides,
  }
}

function makeWorkoutEvent(workoutId: string, overrides?: Partial<OutboxEvent>): OutboxEvent {
  return makeEvent({
    type: 'create_workout',
    payload: {
      id: workoutId,
      user_id: USER_ID,
      client_uuid: workoutId,
      started_at: PAST,
      created_at: PAST,
    },
    ...overrides,
  })
}

function makeExerciseEvent(
  exerciseId: string,
  workoutId: string,
  overrides?: Partial<OutboxEvent>,
): OutboxEvent {
  return makeEvent({
    type: 'upsert_exercise',
    payload: {
      id: exerciseId,
      workout_id: workoutId,
      client_uuid: exerciseId,
      exercise_definition_id: 'def-1',
      order_index: 0,
      notes: null,
      created_at: PAST,
    },
    ...overrides,
  })
}

function makeSetEvent(
  setId: string,
  workoutExerciseId: string,
  overrides?: Partial<OutboxEvent>,
): OutboxEvent {
  return makeEvent({
    type: 'upsert_set',
    payload: {
      id: setId,
      workout_exercise_id: workoutExerciseId,
      client_uuid: setId,
      set_index: 0,
      reps: 10,
      weight: 135,
      weight_kg: 61.2,
      duration_seconds: null,
      distance_m: null,
      set_type: 'normal',
      rir: null,
      units: 'lb',
      is_completed: true,
      created_at: PAST,
    },
    ...overrides,
  })
}

function loadState(events: OutboxEvent[]): void {
  mockLoadOutboxQueue.mockResolvedValue({ events } as OutboxQueueState)
  mockSaveOutboxQueue.mockResolvedValue(undefined)
}

function savedEvents(): OutboxEvent[] {
  const calls = mockSaveOutboxQueue.mock.calls
  if (calls.length === 0) return []
  return (calls[calls.length - 1][1] as OutboxQueueState).events
}

// ─── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  // Reset the module-level isFlushing flag between tests by re-importing is
  // unnecessary here — the flag resets after each flush completes normally.
})

// ──────────────────────────────────────────────────────────────────────────
// 1. AUTH pause: event stays pending, flush stops, pausedByAuth = true
// ──────────────────────────────────────────────────────────────────────────

describe('AUTH error pauses flush without bricking the event', () => {
  it('returns pausedByAuth=true and keeps event status=pending', async () => {
    const workoutId = 'wk-auth-1'
    const workoutEvent = makeWorkoutEvent(workoutId, {
      created_at: RECENT,
      updated_at: RECENT,
    })

    // HTTP 401 from Supabase
    const authError = Object.assign(new Error('Not authenticated'), { status: 401 })
    mockInsertWorkout.mockResolvedValueOnce({ data: null, error: authError })

    loadState([workoutEvent])

    const result = await flushOutboxQueue(USER_ID)

    expect(result.pausedByAuth).toBe(true)
    expect(result.attempted).toBe(1)
    expect(result.synced).toBe(0)
    expect(result.blocked).toBe(0)

    const saved = savedEvents()
    expect(saved).toHaveLength(1)
    expect(saved[0].event_id).toBe(workoutEvent.event_id)
    expect(saved[0].status).toBe('pending') // NOT 'blocked'
    expect(saved[0].last_error_code).toBe('AUTH')
  })

  it('drains remaining events unchanged after auth stop', async () => {
    const workoutId = 'wk-auth-2'
    const exerciseId = 'ex-auth-2'
    const workoutEvent = makeWorkoutEvent(workoutId, {
      created_at: RECENT,
      updated_at: RECENT,
    })
    const exerciseEvent = makeExerciseEvent(exerciseId, workoutId)

    const authError = Object.assign(new Error('JWT expired'), { status: 401 })
    mockInsertWorkout.mockResolvedValueOnce({ data: null, error: authError })

    loadState([workoutEvent, exerciseEvent])

    const result = await flushOutboxQueue(USER_ID)

    expect(result.pausedByAuth).toBe(true)
    // Exercise should not have been attempted (flush stopped after workout AUTH).
    expect(mockUpsertExercise).not.toHaveBeenCalled()

    const saved = savedEvents()
    expect(saved).toHaveLength(2)
    const exerciseSaved = saved.find((e) => e.event_id === exerciseEvent.event_id)!
    expect(exerciseSaved.status).toBe('pending')
    expect(exerciseSaved.last_error_code).toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 2. Dep-defer: exercise is due but workout is not yet due → exercise deferred
// ──────────────────────────────────────────────────────────────────────────

describe('dependency deferral: child waits for pending parent', () => {
  it('defers upsert_exercise when create_workout has a future next_retry_at', async () => {
    const workoutId = 'wk-dep-1'
    const exerciseId = 'ex-dep-1'

    // Workout not yet due (exponential backoff — retry is in the future).
    const workoutEvent = makeWorkoutEvent(workoutId, { next_retry_at: FUTURE })
    // Exercise IS due.
    const exerciseEvent = makeExerciseEvent(exerciseId, workoutId, { next_retry_at: PAST })

    loadState([workoutEvent, exerciseEvent])

    const result = await flushOutboxQueue(USER_ID)

    // Nothing was attempted (workout skipped by shouldAttempt, exercise deferred by dep).
    expect(result.attempted).toBe(0)
    expect(result.synced).toBe(0)
    expect(mockUpsertExercise).not.toHaveBeenCalled()

    const saved = savedEvents()
    expect(saved).toHaveLength(2)
    const exerciseSaved = saved.find((e) => e.event_id === exerciseEvent.event_id)!
    expect(exerciseSaved.status).toBe('pending')
    expect(exerciseSaved.last_error_code).toBe('DEPENDENCY')
    expect(new Date(exerciseSaved.next_retry_at).getTime()).toBeLessThanOrEqual(Date.now() + 2500)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 3. NETWORK failure keeps workout pending → exercise deferred in same cycle
// ──────────────────────────────────────────────────────────────────────────

describe('NETWORK error on parent keeps child deferred in same flush', () => {
  it('retries workout and defers exercise without attempting it', async () => {
    const workoutId = 'wk-net-1'
    const exerciseId = 'ex-net-1'

    const workoutEvent = makeWorkoutEvent(workoutId, {
      created_at: RECENT,
      updated_at: RECENT,
    })
    const exerciseEvent = makeExerciseEvent(exerciseId, workoutId)

    const networkError = new Error('Network request failed')
    mockInsertWorkout.mockResolvedValueOnce({ data: null, error: networkError })

    loadState([workoutEvent, exerciseEvent])

    const result = await flushOutboxQueue(USER_ID)

    // Workout was attempted (and failed retryable) — exercise was NOT attempted.
    expect(result.attempted).toBe(1)
    expect(result.retried).toBe(1)
    expect(result.synced).toBe(0)
    expect(mockUpsertExercise).not.toHaveBeenCalled()

    const saved = savedEvents()
    expect(saved).toHaveLength(2)

    const workoutSaved = saved.find((e) => e.event_id === workoutEvent.event_id)!
    expect(workoutSaved.status).toBe('pending')
    expect(workoutSaved.attempt_count).toBe(1)

    const exerciseSaved = saved.find((e) => e.event_id === exerciseEvent.event_id)!
    expect(exerciseSaved.status).toBe('pending')
    expect(exerciseSaved.attempt_count).toBe(0) // untouched
    expect(exerciseSaved.last_error_code).toBe('DEPENDENCY')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 3. RLS on child upsert + still-pending parent => dependency defer (pending)
// ──────────────────────────────────────────────────────────────────────────

describe('RLS on child with pending parent is treated as dependency', () => {
  it('keeps child pending with DEPENDENCY instead of blocking', async () => {
    const workoutId = 'wk-rls-1'
    const exerciseId = 'ex-rls-1'

    const workoutEvent = makeWorkoutEvent(workoutId, { next_retry_at: FUTURE })
    // Intentionally padded/mixed key to exercise the post-attempt parent fallback path.
    const exerciseEvent = makeExerciseEvent(exerciseId, ' WK-RLS-1 ', {
      next_retry_at: PAST,
      created_at: RECENT,
      updated_at: RECENT,
    })

    const rlsError = Object.assign(new Error('new row violates row-level security policy'), {
      status: 403,
      code: '42501',
    })
    mockUpsertExercise.mockResolvedValueOnce({ data: null, error: rlsError })

    loadState([workoutEvent, exerciseEvent])

    const result = await flushOutboxQueue(USER_ID)

    expect(result.attempted).toBe(1)
    expect(result.blocked).toBe(0)
    expect(result.pausedByAuth).toBe(false)
    expect(mockUpsertExercise).toHaveBeenCalledTimes(1)

    const saved = savedEvents()
    const exerciseSaved = saved.find((e) => e.event_id === exerciseEvent.event_id)!
    expect(exerciseSaved.status).toBe('pending')
    expect(exerciseSaved.last_error_code).toBe('DEPENDENCY')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 4. Fatal constraint/validation on set upsert blocks permanently
// ──────────────────────────────────────────────────────────────────────────

describe('CONSTRAINT error blocks event permanently', () => {
  it('status=blocked and blocked counter incremented for set constraint failures', async () => {
    const setEvent = makeSetEvent('set-constraint-1', 'ex-constraint-1', {
      created_at: RECENT,
      updated_at: RECENT,
    })

    const uniqueViolation = Object.assign(new Error('duplicate key value'), {
      code: '23514',
      details: 'check constraint violation',
    })
    mockUpsertSet.mockResolvedValueOnce({ data: null, error: uniqueViolation })

    loadState([setEvent])

    const result = await flushOutboxQueue(USER_ID)

    expect(result.attempted).toBe(1)
    expect(result.blocked).toBe(1)
    expect(result.synced).toBe(0)
    expect(result.pausedByAuth).toBe(false)

    const saved = savedEvents()
    expect(saved).toHaveLength(1)
    expect(saved[0].status).toBe('blocked')
    expect(saved[0].last_error_code).toBe('CONSTRAINT')
  })
})
