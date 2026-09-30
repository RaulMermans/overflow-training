import { capture } from '../../analytics/posthogClient'

interface CalendarPlanStartEvent {
  dateKey: string
  routineId: string
}

export function captureCalendarPlanStart({ dateKey, routineId }: CalendarPlanStartEvent): void {
  try {
    capture('calendar_plan_start', {
      source: 'calendar',
      date_key: dateKey,
      routine_id: routineId,
    })
  } catch {
    // never crash the app for analytics
  }
}
