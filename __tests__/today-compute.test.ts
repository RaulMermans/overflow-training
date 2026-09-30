import {
  buildWeekRhythm,
  buildWeekSummary,
  computeCadenceSummary,
  countSessionsThisWeek,
  formatGreetingWithName,
  formatRelativeLastWorkout,
  getTimeBasedGreeting,
  getTodayPrimaryAction,
  pickDailyMotivationLine,
} from '../src/features/today/compute'

describe('today/compute', () => {
  const now = new Date('2026-02-11T12:00:00.000Z')

  it('formats missing last workout timestamp', () => {
    expect(formatRelativeLastWorkout(null, now, 'en')).toBe('No sessions yet')
  })

  it('formats today/yesterday/hour ranges', () => {
    expect(formatRelativeLastWorkout('2026-02-11T09:00:00.000Z', now, 'en')).toBe('Today')
    expect(formatRelativeLastWorkout('2026-02-10T08:00:00.000Z', now, 'en')).toBe('Yesterday')
    expect(formatRelativeLastWorkout('2026-02-09T12:00:00.000Z', now, 'en')).toBe('48h ago')
  })

  it('counts sessions in the current local week (Monday start)', () => {
    const sessions = [
      { ended_at: '2026-02-09T08:00:00.000Z' }, // Monday
      { ended_at: '2026-02-10T18:30:00.000Z' }, // Tuesday
      { ended_at: '2026-02-08T18:30:00.000Z' }, // Previous Sunday
      { ended_at: '2026-01-31T09:00:00.000Z' }, // Older
    ]

    expect(countSessionsThisWeek(sessions, now)).toBe(2)
  })

  it('computes cadence tone and label', () => {
    expect(computeCadenceSummary(3, 3, 'en')).toEqual({
      label: 'On pace - 3/3 this week',
      tone: 'up',
    })
    expect(computeCadenceSummary(1, 3, 'en')).toEqual({
      label: 'Building rhythm - 1/3 this week',
      tone: 'neutral',
    })
    expect(computeCadenceSummary(0, 3, 'en')).toEqual({
      label: 'Ready to begin - 0/3 this week',
      tone: 'down',
    })
  })

  it('chooses the correct primary action', () => {
    expect(getTodayPrimaryAction(true, 'en')).toBe('Resume Workout')
    expect(getTodayPrimaryAction(false, 'en')).toBe('Start Workout')
  })

  it('returns time-based greeting copy', () => {
    expect(getTimeBasedGreeting(new Date('2026-02-11T08:00:00.000Z'), 'en')).toBe('Good morning')
    expect(getTimeBasedGreeting(new Date('2026-02-11T15:00:00.000Z'), 'en')).toBe('Good afternoon')
    expect(getTimeBasedGreeting(new Date('2026-02-11T20:00:00.000Z'), 'en')).toBe('Good evening')
  })

  it('handles morning/afternoon/evening boundary hours', () => {
    expect(getTimeBasedGreeting(new Date(2026, 1, 11, 11, 59), 'en')).toBe('Good morning')
    expect(getTimeBasedGreeting(new Date(2026, 1, 11, 12, 0), 'en')).toBe('Good afternoon')
    expect(getTimeBasedGreeting(new Date(2026, 1, 11, 17, 59), 'en')).toBe('Good afternoon')
    expect(getTimeBasedGreeting(new Date(2026, 1, 11, 18, 0), 'en')).toBe('Good evening')
  })

  it('formats greeting with display name when provided', () => {
    expect(formatGreetingWithName('Good morning', 'Raul', 'raul@example.com')).toBe(
      'Good morning, Raul',
    )
  })

  it('returns greeting without name when display name is empty', () => {
    expect(formatGreetingWithName('Good morning', '', null)).toBe('Good morning')
    expect(formatGreetingWithName('Good morning,', '   ', null)).toBe('Good morning')
  })

  it('trims and normalizes greeting punctuation before appending name', () => {
    expect(formatGreetingWithName('  Good evening,  ', '  Raul  ', null)).toBe('Good evening, Raul')
  })

  it('falls back to email prefix when display name is missing', () => {
    expect(formatGreetingWithName('Good afternoon', null, 'ra.ul@example.com')).toBe(
      'Good afternoon, ra.ul',
    )
    expect(formatGreetingWithName('Good afternoon', '   ', '  alex@example.com  ')).toBe(
      'Good afternoon, alex',
    )
  })

  it('picks a deterministic motivation line per user and day', () => {
    const lines = [
      'Ready for today?',
      'Show up for yourself.',
      'Small steps, strong days.',
      'Consistency builds confidence.',
      'Strength follows rhythm.',
      'Calm effort, strong finish.',
      'Keep your promise.',
      'One set at a time.',
      'Build from where you are.',
      'Train with intention.',
      'Progress loves patience.',
      'Steady work wins.',
    ]
    const date = new Date(2026, 1, 11, 9, 0, 0)

    const first = pickDailyMotivationLine({ userId: 'user-1', date, lines })
    const second = pickDailyMotivationLine({ userId: 'user-1', date, lines })
    expect(first).toBe(second)

    const otherDay = pickDailyMotivationLine({
      userId: 'user-1',
      date: new Date(2026, 1, 12, 9, 0, 0),
      lines,
    })
    const otherUser = pickDailyMotivationLine({
      userId: 'user-2',
      date,
      lines,
    })
    expect(new Set([first, otherDay, otherUser]).size).toBeGreaterThan(1)
  })

  it('returns empty string when no motivation lines are provided', () => {
    expect(
      pickDailyMotivationLine({
        userId: 'user-1',
        date: new Date(2026, 1, 11, 9, 0, 0),
        lines: [],
      }),
    ).toBe('')
  })

  it('builds monday-first week rhythm and marks today', () => {
    const week = buildWeekRhythm(
      [
        { ended_at: '2026-02-09T08:00:00.000Z' }, // Monday
        { ended_at: '2026-02-11T08:00:00.000Z' }, // Wednesday
        { ended_at: '2026-02-11T09:00:00.000Z' }, // Wednesday
      ],
      now,
      'en',
    )

    expect(week).toHaveLength(7)
    expect(week[0].label).toBe('Mon')
    expect(week[0].count).toBe(1)
    expect(week[2].count).toBe(2)
    expect(week[2].isToday).toBe(true)
  })

  it('builds a readable week summary', () => {
    expect(buildWeekSummary([], now, 'en')).toBe('No sessions logged this week yet.')
    expect(buildWeekSummary([{ ended_at: '2026-02-10T08:00:00.000Z' }], now, 'en')).toBe(
      '1 session logged this week.',
    )
    expect(
      buildWeekSummary(
        [{ ended_at: '2026-02-10T08:00:00.000Z' }, { ended_at: '2026-02-11T08:00:00.000Z' }],
        now,
        'en',
      ),
    ).toBe('2 sessions across 2 days this week.')
  })
})
