import {
  buildCalendarConsistencySummary,
  shouldLoadCalendarConsistency,
  shouldShowCalendarConsistencyStrip,
} from '../src/features/calendar/consistencySummary'

describe('calendar consistency summary', () => {
  const now = new Date(2031, 4, 20, 12, 0, 0, 0)

  function isoDaysAgo(daysAgo: number): string {
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)
    return date.toISOString()
  }

  it('returns zero sessions and zero streak when no workouts exist', () => {
    const summary = buildCalendarConsistencySummary({
      workouts: [],
      weeklyGoal: 4,
      now,
    })

    expect(summary).toEqual({
      sessionsThisWeek: 0,
      currentStreak: 0,
      weeklyGoal: 4,
    })
  })

  it('computes streak from consecutive recent days and deduplicates same-day workouts', () => {
    const summary = buildCalendarConsistencySummary({
      workouts: [
        { id: 'w1', started_at: isoDaysAgo(0), ended_at: null, created_at: null },
        { id: 'w2', started_at: isoDaysAgo(1), ended_at: null, created_at: null },
        { id: 'w3', started_at: isoDaysAgo(1), ended_at: null, created_at: null },
        { id: 'w4', started_at: isoDaysAgo(2), ended_at: null, created_at: null },
      ],
      weeklyGoal: 5,
      now,
    })

    expect(summary.currentStreak).toBe(3)
    expect(summary.weeklyGoal).toBe(5)
  })

  it('counts sessions this week using Monday week start boundaries', () => {
    const monday = new Date(now)
    const diffToMonday = (monday.getDay() + 6) % 7
    monday.setDate(monday.getDate() - diffToMonday)
    monday.setHours(12, 0, 0, 0)
    const beforeWeek = new Date(monday)
    beforeWeek.setDate(monday.getDate() - 1)

    const summary = buildCalendarConsistencySummary({
      workouts: [
        { id: 'w1', started_at: isoDaysAgo(0), ended_at: null, created_at: null },
        { id: 'w2', started_at: isoDaysAgo(1), ended_at: null, created_at: null },
        { id: 'w3', started_at: monday.toISOString(), ended_at: null, created_at: null },
        { id: 'w4', started_at: beforeWeek.toISOString(), ended_at: null, created_at: null },
      ],
      weeklyGoal: 3,
      now,
    })

    expect(summary.sessionsThisWeek).toBe(3)
  })

  it('respects provided now for deterministic streak calculations', () => {
    const deterministicNow = new Date(2040, 6, 15, 12, 0, 0, 0)
    const date = new Date(deterministicNow)
    const workouts = [
      {
        id: 'w1',
        started_at: date.toISOString(),
        ended_at: null,
        created_at: null,
      },
    ]

    const summary = buildCalendarConsistencySummary({
      workouts,
      weeklyGoal: 4,
      now: deterministicNow,
    })

    expect(summary.currentStreak).toBe(1)
  })

  it('anchors weekly sessions and streak to the same provided now', () => {
    const deterministicNow = new Date(2031, 4, 20, 12, 0, 0, 0)
    const monday = new Date(deterministicNow)
    const diffToMonday = (monday.getDay() + 6) % 7
    monday.setDate(monday.getDate() - diffToMonday)
    monday.setHours(12, 0, 0, 0)
    const sundayBeforeWeek = new Date(monday)
    sundayBeforeWeek.setDate(monday.getDate() - 1)

    const summary = buildCalendarConsistencySummary({
      workouts: [
        { id: 'w1', started_at: deterministicNow.toISOString(), ended_at: null, created_at: null }, // today
        {
          id: 'w2',
          started_at: new Date(monday.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          ended_at: null,
          created_at: null,
        }, // this week
        { id: 'w3', started_at: sundayBeforeWeek.toISOString(), ended_at: null, created_at: null }, // before week window
      ],
      weeklyGoal: 4,
      now: deterministicNow,
    })

    expect(summary.sessionsThisWeek).toBe(2)
    expect(summary.currentStreak).toBe(1)
  })
})

describe('calendar consistency flag helpers', () => {
  it('loads consistency data only when both feature flags are enabled', () => {
    expect(
      shouldLoadCalendarConsistency({
        isAgendaFeatureEnabled: false,
        isConsistencyStripFeatureEnabled: false,
      }),
    ).toBe(false)
    expect(
      shouldLoadCalendarConsistency({
        isAgendaFeatureEnabled: true,
        isConsistencyStripFeatureEnabled: false,
      }),
    ).toBe(false)
    expect(
      shouldLoadCalendarConsistency({
        isAgendaFeatureEnabled: false,
        isConsistencyStripFeatureEnabled: true,
      }),
    ).toBe(false)
    expect(
      shouldLoadCalendarConsistency({
        isAgendaFeatureEnabled: true,
        isConsistencyStripFeatureEnabled: true,
      }),
    ).toBe(true)
  })

  it('shows strip only in agenda view when both feature flags are enabled', () => {
    expect(
      shouldShowCalendarConsistencyStrip({
        isAgendaView: false,
        isAgendaFeatureEnabled: true,
        isConsistencyStripFeatureEnabled: true,
      }),
    ).toBe(false)
    expect(
      shouldShowCalendarConsistencyStrip({
        isAgendaView: true,
        isAgendaFeatureEnabled: true,
        isConsistencyStripFeatureEnabled: true,
      }),
    ).toBe(true)
    expect(
      shouldShowCalendarConsistencyStrip({
        isAgendaView: true,
        isAgendaFeatureEnabled: false,
        isConsistencyStripFeatureEnabled: true,
      }),
    ).toBe(false)
    expect(
      shouldShowCalendarConsistencyStrip({
        isAgendaView: true,
        isAgendaFeatureEnabled: true,
        isConsistencyStripFeatureEnabled: false,
      }),
    ).toBe(false)
  })
})
