import type { CheckinDueInfo } from '../src/features/checkins/storage'
import {
  buildSuggestedRoutine,
  getNextDayRefreshDelayMs,
  hasAnyRoutines,
  resumeWorkoutFlow,
  shouldShowCheckinDueCard,
  sortRoutinesForQuickStart,
  startQuickRoutineFlow,
} from '../src/features/today/useTodayScreenData'

describe('today screen logic', () => {
  const sampleRoutine = (id: string, name: string, updatedAt: string, pinned?: boolean) => ({
    id,
    name,
    createdAt: updatedAt,
    updatedAt,
    pinned,
    items: [],
  })

  it('sorts quick-start routines by pin, usage, and freshness', () => {
    const routines = [
      sampleRoutine('a', 'A', '2026-02-01T00:00:00.000Z'),
      sampleRoutine('b', 'B', '2026-02-02T00:00:00.000Z', true),
      sampleRoutine('c', 'C', '2026-02-03T00:00:00.000Z'),
    ]

    const sorted = sortRoutinesForQuickStart(routines, {
      c: { usedCount: 4, lastUsedAt: '2026-02-04T00:00:00.000Z' },
      a: { usedCount: 1, lastUsedAt: '2026-02-03T00:00:00.000Z' },
    })

    expect(sorted.map((routine) => routine.id)).toEqual(['b', 'c', 'a'])
  })

  it('returns no suggestion when disabled or when today already has a plan', () => {
    const routines = [sampleRoutine('a', 'A', '2026-02-01T00:00:00.000Z', true)]
    const usage = { a: { usedCount: 3, lastUsedAt: '2026-02-10T00:00:00.000Z' } }

    expect(
      buildSuggestedRoutine({
        enabled: false,
        hasPlanToday: false,
        routines,
        usage,
      }),
    ).toBeUndefined()

    expect(
      buildSuggestedRoutine({
        enabled: true,
        hasPlanToday: true,
        routines,
        usage,
      }),
    ).toBeUndefined()
  })

  it('derives no-routines gate state from routines list', () => {
    expect(hasAnyRoutines([])).toBe(false)
    expect(hasAnyRoutines([sampleRoutine('a', 'A', '2026-02-01T00:00:00.000Z')])).toBe(true)
  })

  it('prefers pinned routines and explains with Pinned reason', () => {
    const routines = [
      sampleRoutine('a', 'A', '2026-02-01T00:00:00.000Z', true),
      sampleRoutine('b', 'B', '2026-02-02T00:00:00.000Z', true),
      sampleRoutine('c', 'C', '2026-02-03T00:00:00.000Z'),
    ]
    const usage = {
      a: { usedCount: 2, lastUsedAt: '2026-02-02T00:00:00.000Z' },
      b: { usedCount: 1, lastUsedAt: '2026-02-05T00:00:00.000Z' },
      c: { usedCount: 10, lastUsedAt: '2026-02-06T00:00:00.000Z' },
    }

    expect(
      buildSuggestedRoutine({
        enabled: true,
        hasPlanToday: false,
        routines,
        usage,
      }),
    ).toEqual({
      routineId: 'b',
      routineName: 'B',
      reason: 'Pinned',
    })
  })

  it('falls back to most used when no pinned routines exist', () => {
    const routines = [
      sampleRoutine('a', 'A', '2026-02-01T00:00:00.000Z'),
      sampleRoutine('b', 'B', '2026-02-02T00:00:00.000Z'),
      sampleRoutine('c', 'C', '2026-02-03T00:00:00.000Z'),
    ]
    const usage = {
      a: { usedCount: 4, lastUsedAt: '2026-02-02T00:00:00.000Z' },
      b: { usedCount: 6, lastUsedAt: '2026-02-03T00:00:00.000Z' },
      c: { usedCount: 6, lastUsedAt: '2026-02-01T00:00:00.000Z' },
    }

    expect(
      buildSuggestedRoutine({
        enabled: true,
        hasPlanToday: false,
        routines,
        usage,
      }),
    ).toEqual({
      routineId: 'b',
      routineName: 'B',
      reason: 'Most used',
    })
  })

  it('can avoid repeating yesterday when an alternate candidate exists', () => {
    const routines = [
      sampleRoutine('a', 'A', '2026-02-01T00:00:00.000Z', true),
      sampleRoutine('b', 'B', '2026-02-02T00:00:00.000Z', true),
    ]
    const usage = {
      a: { usedCount: 10, lastUsedAt: '2026-02-05T00:00:00.000Z' },
      b: { usedCount: 8, lastUsedAt: '2026-02-04T00:00:00.000Z' },
    }

    expect(
      buildSuggestedRoutine({
        enabled: true,
        hasPlanToday: false,
        routines,
        usage,
        yesterdayRoutineId: 'a',
      }),
    ).toEqual({
      routineId: 'b',
      routineName: 'B',
      reason: 'To avoid repeating yesterday',
    })
  })

  it('shows check-in due card only when due and not prompted today', () => {
    const now = new Date('2026-02-22T12:00:00.000Z')

    const dueNotPrompted: CheckinDueInfo = {
      nextDueAtISO: '2026-02-20T00:00:00.000Z',
      isDue: true,
      lastPromptedAtISO: '2026-02-21T00:00:00.000Z',
    }
    const duePromptedToday: CheckinDueInfo = {
      nextDueAtISO: '2026-02-20T00:00:00.000Z',
      isDue: true,
      lastPromptedAtISO: '2026-02-22T01:00:00.000Z',
    }
    const notDue: CheckinDueInfo = {
      nextDueAtISO: '2026-03-20T00:00:00.000Z',
      isDue: false,
      lastPromptedAtISO: null,
    }

    expect(shouldShowCheckinDueCard(dueNotPrompted, now)).toBe(true)
    expect(shouldShowCheckinDueCard(duePromptedToday, now)).toBe(false)
    expect(shouldShowCheckinDueCard(notDue, now)).toBe(false)
  })

  it('returns a positive delay until the next local day refresh', () => {
    const delay = getNextDayRefreshDelayMs(new Date(2026, 1, 22, 23, 59, 58))
    expect(delay).toBeGreaterThanOrEqual(1000)
    expect(delay).toBeLessThanOrEqual(3000)
  })

  it('resolves resume workout flow across login/error/in-progress paths', async () => {
    const missingUser = await resumeWorkoutFlow({
      userId: null,
      fetchInProgressWorkout: async () => ({ data: null, error: null }),
      errorLogin: 'login required',
      errorCheckExisting: 'check failed',
    })
    expect(missingUser).toEqual({
      workoutId: null,
      errorMessage: 'login required',
    })

    const inProgress = await resumeWorkoutFlow({
      userId: 'user-1',
      fetchInProgressWorkout: async () => ({ data: { id: 'workout-1' }, error: null }),
      errorLogin: 'login required',
      errorCheckExisting: 'check failed',
    })
    expect(inProgress).toEqual({
      workoutId: 'workout-1',
      errorMessage: null,
    })
  })

  it('resolves start-routine flow and returns skipped exercise ids', async () => {
    const result = await startQuickRoutineFlow({
      userId: 'user-1',
      routineId: 'routine-1',
      plannedDateKey: '2026-02-22',
      errorStartRoutine: 'unable to start',
      startRoutine: async () => ({
        workoutId: 'workout-1',
        skippedExerciseDefinitionIds: ['exercise-1'],
        errorMessage: null,
      }),
    })

    expect(result).toEqual({
      workoutId: 'workout-1',
      skippedExerciseDefinitionIds: ['exercise-1'],
      errorMessage: null,
    })
  })
})
