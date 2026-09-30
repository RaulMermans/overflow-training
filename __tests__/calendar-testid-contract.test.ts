import { SELECTORS } from '../e2e/selectors'

describe('calendar E2E selector contract', () => {
  it('builds explicit day IDs as calendar:day:<YYYY-MM-DD>', () => {
    expect(SELECTORS.calendar.day('2026-02-27')).toBe('calendar:day:2026-02-27')
  })

  it('builds routine row IDs as calendar:routineRow:<id>', () => {
    expect(SELECTORS.calendar.routineRow('routine-123')).toBe('calendar:routineRow:routine-123')
  })

  it('keeps static month/sheet/picker selectors stable', () => {
    expect(SELECTORS.calendar.monthLabel).toBe('calendar:monthLabel')
    expect(SELECTORS.calendar.daySheet).toBe('calendar:daySheet')
    expect(SELECTORS.calendar.routinePicker).toBe('calendar:routinePicker')
    expect(SELECTORS.calendar.routineRowAny).toBe('calendar:routineRow')
  })
})
