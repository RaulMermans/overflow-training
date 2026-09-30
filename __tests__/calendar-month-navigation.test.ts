import { addMonthsToDateKey, toMonthStartDateKey } from '../src/features/calendar/monthNavigation'

describe('month navigation helpers', () => {
  it('normalizes arbitrary dates to month start keys', () => {
    expect(toMonthStartDateKey('2026-02-17')).toBe('2026-02-01')
    expect(toMonthStartDateKey('2026-11-30')).toBe('2026-11-01')
  })

  it('shifts month keys forward and backward', () => {
    expect(addMonthsToDateKey('2026-02-01', 1)).toBe('2026-03-01')
    expect(addMonthsToDateKey('2026-02-01', -1)).toBe('2026-01-01')
  })

  it('handles year rollovers in both directions', () => {
    expect(addMonthsToDateKey('2026-12-01', 1)).toBe('2027-01-01')
    expect(addMonthsToDateKey('2027-01-01', -1)).toBe('2026-12-01')
  })

  it('preserves zero-padded month format', () => {
    expect(addMonthsToDateKey('2026-01-01', 0)).toMatch(/^\d{4}-\d{2}-01$/u)
    expect(addMonthsToDateKey('2026-09-01', 1)).toBe('2026-10-01')
  })
})
