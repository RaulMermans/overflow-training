import type { PlannedDay } from '../src/features/schedule/types'
import type { Routine } from '../src/lib/routines'
import {
  buildMarkedDates,
  buildSelectedDayModel,
  groupWorkoutsByDate,
  toDateKeyFromIso,
} from '../src/features/calendar/monthCalendar'
import { buildAgendaWindowKeys } from '../src/features/calendar/consistencySummary'

describe('month calendar helpers', () => {
  it('returns a YYYY-MM-DD date key', () => {
    const key = toDateKeyFromIso('2026-02-16T12:34:56.000Z')
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
  })

  it('groups workouts by date and sorts each date descending by performedAt', () => {
    const grouped = groupWorkoutsByDate([
      {
        id: 'w1',
        ended_at: '2026-02-16T06:00:00.000Z',
        started_at: null,
        created_at: null,
      },
      {
        id: 'w2',
        ended_at: '2026-02-16T09:00:00.000Z',
        started_at: null,
        created_at: null,
      },
      {
        id: 'w3',
        ended_at: null,
        started_at: '2026-02-17T08:00:00.000Z',
        created_at: null,
      },
      {
        id: 'w4',
        ended_at: null,
        started_at: null,
        created_at: '2026-02-17T07:00:00.000Z',
      },
    ])

    const dayOne = toDateKeyFromIso('2026-02-16T12:00:00.000Z')
    const dayTwo = toDateKeyFromIso('2026-02-17T12:00:00.000Z')

    expect(grouped[dayOne].map((entry) => entry.id)).toEqual(['w2', 'w1'])
    expect(grouped[dayTwo].map((entry) => entry.id)).toEqual(['w3', 'w4'])
  })

  it('builds immutable marked dates for workout, plan, and selected states', () => {
    const marks = buildMarkedDates({
      workoutDateKeys: ['2026-02-16', '2026-02-17'],
      planDateKeys: ['2026-02-17', '2026-02-18'],
      selectedDateKey: '2026-02-18',
      colors: {
        workoutDot: '#111111',
        planDot: '#222222',
        selectedBackground: '#333333',
        selectedText: '#ffffff',
      },
    })

    expect(marks['2026-02-16'].dots).toEqual([{ key: 'workout', color: '#111111' }])
    expect(marks['2026-02-16'].marked).toBe(true)
    expect(marks['2026-02-17'].dots).toEqual([{ key: 'workout', color: '#111111' }])
    expect(marks['2026-02-17'].marked).toBe(true)
    expect(marks['2026-02-18'].dots).toEqual([{ key: 'plan', color: '#222222' }])
    expect(marks['2026-02-18'].marked).toBe(true)
    expect(marks['2026-02-18'].selected).toBe(true)
    expect(marks['2026-02-18'].selectedColor).toBe('#333333')
    expect(marks['2026-02-18'].selectedTextColor).toBe('#ffffff')
  })

  it('builds selected day model with completed workouts overriding the plan', () => {
    const dateKey = '2026-02-16'
    const plansByDate: Record<string, PlannedDay> = {
      [dateKey]: {
        date: dateKey,
        routineId: 'routine-1',
        note: null,
      },
    }
    const routinesById: Record<string, Routine> = {
      'routine-1': {
        id: 'routine-1',
        name: 'Upper Day',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-02T00:00:00.000Z',
        items: [],
      },
    }

    const model = buildSelectedDayModel({
      dateKey,
      workoutsByDate: {
        [dateKey]: [{ id: 'workout-1', performedAt: '2026-02-16T09:00:00.000Z' }],
      },
      plansByDate,
      routinesById,
    })

    expect(model.hasPlan).toBe(false)
    expect(model.hasWorkouts).toBe(true)
    expect(model.plan).toBeNull()
    expect(model.routine).toBeNull()
    expect(model.routineMissing).toBe(false)
    expect(model.isEmpty).toBe(false)
  })

  it('flags missing routines and empty days correctly', () => {
    const plannedModel = buildSelectedDayModel({
      dateKey: '2026-02-20',
      workoutsByDate: {},
      plansByDate: {
        '2026-02-20': { date: '2026-02-20', routineId: 'missing-routine' },
      },
      routinesById: {},
    })

    const emptyModel = buildSelectedDayModel({
      dateKey: '2026-02-21',
      workoutsByDate: {},
      plansByDate: {},
      routinesById: {},
    })

    expect(plannedModel.hasPlan).toBe(true)
    expect(plannedModel.routineMissing).toBe(true)
    expect(plannedModel.isEmpty).toBe(false)

    expect(emptyModel.hasPlan).toBe(false)
    expect(emptyModel.hasWorkouts).toBe(false)
    expect(emptyModel.isEmpty).toBe(true)
  })

  it('builds inclusive agenda windows for next 14 and last 14 days', () => {
    const windows = buildAgendaWindowKeys('2026-02-27', 14)
    const toDate = (dateKey: string) => new Date(`${dateKey}T12:00:00`)
    const inclusiveDayCount = (startDateKey: string, endDateKey: string) => {
      const msPerDay = 24 * 60 * 60 * 1000
      return (
        Math.round((toDate(endDateKey).getTime() - toDate(startDateKey).getTime()) / msPerDay) + 1
      )
    }

    expect(windows.upcomingStartDateKey).toBe('2026-02-27')
    expect(windows.upcomingEndDateKey).toBe('2026-03-12')
    expect(windows.recentStartDateKey).toBe('2026-02-13')
    expect(windows.recentEndDateKey).toBe('2026-02-26')
    expect(windows.recentEndDateKey < windows.upcomingStartDateKey).toBe(true)
    expect(inclusiveDayCount(windows.upcomingStartDateKey, windows.upcomingEndDateKey)).toBe(14)
    expect(inclusiveDayCount(windows.recentStartDateKey, windows.recentEndDateKey)).toBe(14)
  })
})
