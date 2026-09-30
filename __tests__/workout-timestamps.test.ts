import { getWorkoutDisplayTimestamp, getWorkoutStartedFallback } from '../src/db/workoutTimestamps'

describe('workout timestamp fallbacks', () => {
  it('uses started_at first for display timestamp', () => {
    const result = getWorkoutDisplayTimestamp({
      ended_at: '2026-01-02T10:00:00.000Z',
      started_at: '2026-01-02T09:00:00.000Z',
      created_at: '2026-01-02T08:00:00.000Z',
    })

    expect(result).toBe('2026-01-02T09:00:00.000Z')
  })

  it('falls back to ended_at then created_at for display timestamp', () => {
    expect(
      getWorkoutDisplayTimestamp({
        ended_at: null,
        started_at: '2026-01-02T09:00:00.000Z',
        created_at: '2026-01-02T08:00:00.000Z',
      }),
    ).toBe('2026-01-02T09:00:00.000Z')

    expect(
      getWorkoutDisplayTimestamp({
        started_at: null,
        ended_at: '2026-01-02T10:00:00.000Z',
        created_at: '2026-01-02T08:00:00.000Z',
      }),
    ).toBe('2026-01-02T10:00:00.000Z')

    expect(
      getWorkoutDisplayTimestamp({
        ended_at: null,
        started_at: null,
        created_at: '2026-01-02T08:00:00.000Z',
      }),
    ).toBe('2026-01-02T08:00:00.000Z')
  })

  it('falls back to ended_at then created_at for synthetic started_at', () => {
    expect(
      getWorkoutStartedFallback({
        started_at: null,
        ended_at: '2026-01-02T10:00:00.000Z',
        created_at: '2026-01-02T08:00:00.000Z',
      }),
    ).toBe('2026-01-02T10:00:00.000Z')

    expect(
      getWorkoutStartedFallback({
        started_at: null,
        ended_at: '2026-01-02T10:00:00.000Z',
        created_at: null,
      }),
    ).toBe('2026-01-02T10:00:00.000Z')

    expect(
      getWorkoutStartedFallback({
        started_at: null,
        ended_at: null,
        created_at: '2026-01-02T08:00:00.000Z',
      }),
    ).toBe('2026-01-02T08:00:00.000Z')
  })

  it('returns null when all timestamps are missing', () => {
    expect(
      getWorkoutDisplayTimestamp({
        ended_at: null,
        started_at: null,
        created_at: null,
      }),
    ).toBeNull()

    expect(
      getWorkoutStartedFallback({
        started_at: null,
        created_at: null,
        ended_at: null,
      }),
    ).toBeNull()
  })
})
