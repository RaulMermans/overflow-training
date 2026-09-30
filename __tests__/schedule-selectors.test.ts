import type { PlannedDay } from '../src/features/schedule/types'
import type { Routine } from '../src/lib/routines'
import {
  getNextScheduledWorkout,
  getScheduledWorkoutForDate,
  toLocalDateKey,
} from '../src/features/schedule/selectors'

function makeRoutine(id: string, name: string): Routine {
  return {
    id,
    clientUuid: id,
    name,
    description: null,
    color: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    items: [],
  }
}

describe('schedule selectors', () => {
  it('returns scheduled workout for date when routine exists', () => {
    const plans: Record<string, PlannedDay> = {
      '2026-02-21': { date: '2026-02-21', routineId: 'routine-a', note: null },
    }
    const routinesById = { 'routine-a': makeRoutine('routine-a', 'Lower A') }

    const result = getScheduledWorkoutForDate(plans, routinesById, '2026-02-21')

    expect(result).not.toBeNull()
    expect(result?.dateKey).toBe('2026-02-21')
    expect(result?.routine.name).toBe('Lower A')
  })

  it('returns null for date when routine reference is missing', () => {
    const plans: Record<string, PlannedDay> = {
      '2026-02-21': { date: '2026-02-21', routineId: 'missing', note: null },
    }

    const result = getScheduledWorkoutForDate(plans, {}, '2026-02-21')

    expect(result).toBeNull()
  })

  it('returns the next scheduled workout strictly after from date', () => {
    const plans: Record<string, PlannedDay> = {
      '2026-02-21': { date: '2026-02-21', routineId: 'routine-a', note: null },
      '2026-02-24': { date: '2026-02-24', routineId: 'routine-b', note: null },
      '2026-02-27': { date: '2026-02-27', routineId: 'routine-c', note: null },
    }
    const routinesById = {
      'routine-a': makeRoutine('routine-a', 'Lower A'),
      'routine-b': makeRoutine('routine-b', 'Upper B'),
      'routine-c': makeRoutine('routine-c', 'Cardio C'),
    }

    const result = getNextScheduledWorkout(plans, routinesById, '2026-02-21')

    expect(result?.dateKey).toBe('2026-02-24')
    expect(result?.routine.id).toBe('routine-b')
  })

  it('ignores dates with missing routines when finding next scheduled workout', () => {
    const plans: Record<string, PlannedDay> = {
      '2026-02-22': { date: '2026-02-22', routineId: 'missing', note: null },
      '2026-02-25': { date: '2026-02-25', routineId: 'routine-ok', note: null },
    }
    const routinesById = {
      'routine-ok': makeRoutine('routine-ok', 'Full Body'),
    }

    const result = getNextScheduledWorkout(plans, routinesById, '2026-02-21')

    expect(result?.dateKey).toBe('2026-02-25')
    expect(result?.routine.id).toBe('routine-ok')
  })

  it('formats local date keys consistently', () => {
    const date = new Date('2026-02-21T23:45:00.000Z')
    const key = toLocalDateKey(date)
    expect(key).toHaveLength(10)
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
