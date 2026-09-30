import {
  buildEventFromScheduledRoutine,
  nextDateString,
} from '../src/features/googleCalendar/calendarEventBuilder'

describe('nextDateString', () => {
  it('advances a date by one day', () => {
    expect(nextDateString('2026-03-18')).toBe('2026-03-19')
  })

  it('rolls over month boundary', () => {
    expect(nextDateString('2026-03-31')).toBe('2026-04-01')
  })

  it('rolls over year boundary', () => {
    expect(nextDateString('2026-12-31')).toBe('2027-01-01')
  })

  it('handles leap year', () => {
    expect(nextDateString('2024-02-28')).toBe('2024-02-29')
  })
})

describe('buildEventFromScheduledRoutine', () => {
  const routineName = 'Push Day'
  const date = '2026-03-18'
  const scheduledRoutineId = 'abc-123'

  let event: ReturnType<typeof buildEventFromScheduledRoutine>

  beforeEach(() => {
    event = buildEventFromScheduledRoutine(routineName, date, scheduledRoutineId)
  })

  it('sets summary with routine name', () => {
    expect(event.summary).toBe('Workout — Push Day')
  })

  it('sets all-day start date', () => {
    expect(event.start).toEqual({ date: '2026-03-18' })
  })

  it('sets all-day end date as next day (Google exclusive end)', () => {
    expect(event.end).toEqual({ date: '2026-03-19' })
  })

  it('includes disclaimer in description', () => {
    expect(event.description).toContain(
      'Changes made in Google Calendar do not update your workout schedule',
    )
  })

  it('sets source in extendedProperties.private', () => {
    expect(event.extendedProperties.private['source']).toBe('overflow-workout-tracker')
  })

  it('sets scheduled_routine_id in extendedProperties.private', () => {
    expect(event.extendedProperties.private['scheduled_routine_id']).toBe('abc-123')
  })

  it('handles routine name with special chars', () => {
    const special = buildEventFromScheduledRoutine('Arms & Chest', date, scheduledRoutineId)
    expect(special.summary).toBe('Workout — Arms & Chest')
  })

  it('handles empty routine name gracefully', () => {
    const empty = buildEventFromScheduledRoutine('', date, scheduledRoutineId)
    expect(empty.summary).toBe('Workout — ')
  })
})
