const mockCapture = jest.fn()

jest.mock('../src/analytics/posthogClient', () => ({
  capture: (...args: unknown[]) => mockCapture(...args),
}))

import { captureCalendarPlanStart } from '../src/features/calendar/planStartAnalytics'

describe('calendar planned start analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('captures calendar_plan_start with required properties', () => {
    captureCalendarPlanStart({
      dateKey: '2026-02-27',
      routineId: 'routine-123',
    })

    expect(mockCapture).toHaveBeenCalledWith('calendar_plan_start', {
      source: 'calendar',
      date_key: '2026-02-27',
      routine_id: 'routine-123',
    })
  })

  it('does not throw when analytics capture throws', () => {
    mockCapture.mockImplementation(() => {
      throw new Error('capture failed')
    })

    expect(() =>
      captureCalendarPlanStart({
        dateKey: '2026-02-27',
        routineId: 'routine-123',
      }),
    ).not.toThrow()
  })
})
