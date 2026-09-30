import { buildWeeklySessionCounts } from '../src/features/progress/weeklySessions'
import type { ProgressWorkout } from '../src/db/progress'

function makeWorkout(id: string, startedAt: string): ProgressWorkout {
  return {
    id,
    started_at: startedAt,
    ended_at: startedAt,
    workout_exercises: [],
  }
}

describe('buildWeeklySessionCounts', () => {
  it('returns one zero bar for empty workouts', () => {
    expect(buildWeeklySessionCounts([], 0, '2026-02-01T12:00:00.000Z')).toEqual([0])
  })

  it('counts unique sessions by week', () => {
    const workouts = [
      makeWorkout('w1', '2026-01-05T10:00:00.000Z'), // week of Jan 5
      makeWorkout('w2', '2026-01-06T10:00:00.000Z'), // week of Jan 5
      makeWorkout('w3', '2026-01-14T10:00:00.000Z'), // week of Jan 12
    ]

    const result = buildWeeklySessionCounts(workouts, 3, '2026-01-18T10:00:00.000Z')

    expect(result).toEqual([0, 2, 1])
  })

  it('deduplicates the same workout id within a week', () => {
    const workouts = [
      makeWorkout('w1', '2026-01-12T09:00:00.000Z'),
      makeWorkout('w1', '2026-01-12T11:00:00.000Z'),
      makeWorkout('w2', '2026-01-13T11:00:00.000Z'),
    ]

    const result = buildWeeklySessionCounts(workouts, 1, '2026-01-18T10:00:00.000Z')

    expect(result).toEqual([2])
  })
})
