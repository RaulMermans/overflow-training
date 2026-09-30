import {
  resolveCalendarPlannerIntent,
  shouldAutoOpenPlanner,
} from '../src/features/calendar/plannerIntent'

describe('calendar planner intent', () => {
  it('uses dateKey when valid and openPicker=1', () => {
    const intent = resolveCalendarPlannerIntent(
      {
        dateKey: '2026-03-06',
        openPicker: '1',
      },
      '2026-03-01',
    )

    expect(intent).toEqual({
      targetDateKey: '2026-03-06',
      openPicker: true,
    })
  })

  it('falls back to provided date when dateKey is missing or invalid', () => {
    expect(
      resolveCalendarPlannerIntent(
        {
          openPicker: '0',
        },
        '2026-03-01',
      ),
    ).toEqual({
      targetDateKey: '2026-03-01',
      openPicker: false,
    })

    expect(
      resolveCalendarPlannerIntent(
        {
          dateKey: '2026-02-30',
          openPicker: '1',
        },
        '2026-03-01',
      ),
    ).toEqual({
      targetDateKey: '2026-03-01',
      openPicker: true,
    })
  })

  it('opens planner only once per handled intent', () => {
    expect(shouldAutoOpenPlanner(true, false)).toBe(true)
    expect(shouldAutoOpenPlanner(true, true)).toBe(false)
    expect(shouldAutoOpenPlanner(false, false)).toBe(false)
  })
})
