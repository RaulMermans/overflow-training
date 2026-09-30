import type { GoogleCalendarEvent } from './types'

const APP_SOURCE_TAG = 'overflow-workout-tracker'

/**
 * Advances a YYYY-MM-DD date string by one day, as required by Google Calendar
 * for all-day event end dates (exclusive end).
 */
export function nextDateString(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Builds a Google Calendar all-day event payload from a scheduled workout.
 *
 * Uses all-day events because scheduled_routines only stores a DATE with no
 * time-of-day. This is truthful to the data model and avoids timezone issues.
 */
export function buildEventFromScheduledRoutine(
  routineName: string,
  date: string,
  scheduledRoutineId: string,
): GoogleCalendarEvent {
  return {
    summary: `Workout — ${routineName}`,
    description: [
      'Scheduled workout from your workout app.',
      '',
      'Note: Changes made in Google Calendar do not update your workout schedule.',
    ].join('\n'),
    start: { date },
    end: { date: nextDateString(date) },
    extendedProperties: {
      private: {
        source: APP_SOURCE_TAG,
        scheduled_routine_id: scheduledRoutineId,
      },
    },
  }
}
