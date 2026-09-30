import { requireSupabase } from '../lib/supabaseClient'
import { ENABLE_GOOGLE_CALENDAR_SYNC } from '../config/featureFlags'
import { captureException } from '../lib/observability/crash'
import type { PlannedDay } from '../domain/schedule'
import type { WorkoutRow, WorkoutExerciseRow } from './workouts'

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/
type GoogleCalendarSyncService = typeof import('../features/googleCalendar/syncService')

function loadGoogleCalendarSyncService(): GoogleCalendarSyncService {
  // Jest in this repo runs under CommonJS and cannot execute dynamic import() here.
  // Keep the load lazy so the sync module is only loaded when the feature path runs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../features/googleCalendar/syncService') as GoogleCalendarSyncService
}

function toDateKey(value: string): string {
  return value.trim().slice(0, 10)
}

function parseDateKey(dateKey: string): string | null {
  const key = toDateKey(dateKey)
  return DATE_KEY_REGEX.test(key) ? key : null
}

export interface StartScheduledWorkoutResult {
  data: { workout: WorkoutRow; exercises: WorkoutExerciseRow[] } | null
  error: Error | null
}

function normalizeStartScheduledWorkoutErrorCode(codeOrMessage: string): string {
  const normalized = codeOrMessage.trim().toLowerCase()

  if (normalized === 'no_schedule_for_date') {
    return 'No routine scheduled for this day.'
  }

  if (normalized === 'routine_empty') {
    return 'This routine has no exercises yet.'
  }

  if (normalized === 'routine_not_found') {
    return 'This routine is no longer available.'
  }

  if (normalized === 'not_authenticated') {
    return 'Your session has expired. Please sign in again.'
  }

  if (normalized === 'forbidden') {
    return 'You do not have permission to start this routine.'
  }

  if (normalized === 'workout_not_found') {
    return 'Workout not found. Please try again.'
  }

  if (normalized === 'workout_in_progress') {
    return 'Finish or discard your current workout before changing the scheduled routine.'
  }

  return codeOrMessage
}

function normalizeScheduleErrorCode(codeOrMessage: string): string {
  const normalized = codeOrMessage.trim().toLowerCase()
  if (normalized === 'workout_in_progress') {
    return 'Finish or discard your current workout before changing the scheduled routine.'
  }
  if (normalized === 'routine_not_found') {
    return 'This routine is no longer available.'
  }
  if (normalized === 'not_authenticated') {
    return 'Your session has expired. Please sign in again.'
  }
  return codeOrMessage
}

/**
 * Returns workout + exercises or error. Checks data.error first, then error.message.
 */
export async function callStartScheduledWorkout(
  dateKey: string,
): Promise<StartScheduledWorkoutResult> {
  const parsed = parseDateKey(dateKey)
  if (!parsed) {
    return {
      data: null,
      error: new Error('Invalid date. Use YYYY-MM-DD.'),
    }
  }

  const client = requireSupabase()
  const { data, error } = await client.rpc('start_scheduled_workout', {
    p_date: parsed,
  })

  if (error) {
    return {
      data: null,
      error: new Error(normalizeStartScheduledWorkoutErrorCode(error.message)),
    }
  }

  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    typeof (data as { error?: string }).error === 'string'
  ) {
    const err = (data as { error: string }).error
    return {
      data: null,
      error: new Error(normalizeStartScheduledWorkoutErrorCode(err)),
    }
  }

  if (data && typeof data === 'object' && 'workout' in data && 'exercises' in data) {
    const payload = data as { workout: WorkoutRow; exercises: WorkoutExerciseRow[] }
    return { data: payload, error: null }
  }

  return {
    data: null,
    error: new Error('Invalid response from start_scheduled_workout'),
  }
}

/**
 * Fetches scheduled_routines for a date range and returns a plans-like Record.
 * Supabase returns date as "YYYY-MM-DD" string.
 */
export async function fetchScheduledRoutinesForDateRange(
  userId: string,
  fromDateKey: string,
  toDateKey: string,
): Promise<Record<string, PlannedDay>> {
  if (!userId) return {}

  const from = parseDateKey(fromDateKey)
  const to = parseDateKey(toDateKey)
  if (!from || !to || from > to) return {}

  const client = requireSupabase()
  const { data, error } = await client
    .from('scheduled_routines')
    .select('date, routine_id')
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)

  if (error) return {}
  const rows = (data ?? []) as { date: string; routine_id: string }[]

  const plans: Record<string, PlannedDay> = {}
  for (const row of rows) {
    const dateStr = typeof row.date === 'string' ? row.date.trim().slice(0, 10) : ''
    if (!DATE_KEY_REGEX.test(dateStr) || !row.routine_id) continue
    plans[dateStr] = {
      date: dateStr,
      routineId: row.routine_id,
    }
  }
  return plans
}

export interface ScheduleRoutineForDateResult {
  ok: boolean
  error: Error | null
}

/**
 * Calls schedule_routine_for_date(p_date, p_routine_id) RPC.
 * RPC accepts routine id or client_uuid.
 */
export async function scheduleRoutineForDate(
  dateKey: string,
  routineId: string,
): Promise<ScheduleRoutineForDateResult> {
  const parsed = parseDateKey(dateKey)
  if (!parsed) {
    return { ok: false, error: new Error('Invalid date. Use YYYY-MM-DD.') }
  }
  const trimmedRoutineId = routineId.trim()
  if (!trimmedRoutineId) {
    return { ok: false, error: new Error('Routine ID is required.') }
  }

  const client = requireSupabase()
  const { data, error } = await client.rpc('schedule_routine_for_date', {
    p_date: parsed,
    p_routine_id: trimmedRoutineId,
  })

  if (error) {
    return { ok: false, error }
  }

  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    const err = (data as { error: string }).error
    return { ok: false, error: new Error(normalizeScheduleErrorCode(err)) }
  }

  if (ENABLE_GOOGLE_CALENDAR_SYNC) {
    void (async () => {
      try {
        const { data: userData } = await client.auth.getUser()
        if (userData.user) {
          const { syncCalendarEventForDate } = loadGoogleCalendarSyncService()
          await syncCalendarEventForDate(userData.user.id, parsed)
        }
      } catch (syncErr) {
        captureException(syncErr, { context: 'googleCalendar.scheduleSync' })
      }
    })()
  }

  return { ok: true, error: null }
}

/**
 * Transitions a scheduled_routines row from 'started' → 'completed'
 * when its linked workout finishes. Best-effort: failure here should
 * not block workout completion.
 */
export async function completeScheduledRoutineByWorkoutId(
  workoutId: string,
): Promise<{ error: Error | null }> {
  if (!workoutId) return { error: null }

  const client = requireSupabase()
  const { error } = await client
    .from('scheduled_routines')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('workout_id', workoutId)
    .eq('status', 'started')

  return { error: error ?? null }
}

/**
 * Deletes the scheduled_routines row for the given user and date.
 * RLS enforces user_id = auth.uid().
 */
export async function clearScheduledRoutineForDate(
  userId: string,
  dateKey: string,
): Promise<{ error: Error | null }> {
  if (!userId) return { error: new Error('User ID is required.') }
  const parsed = parseDateKey(dateKey)
  if (!parsed) return { error: new Error('Invalid date. Use YYYY-MM-DD.') }

  // Best-effort: delete the Google Calendar event BEFORE removing the DB row so
  // the sync can still look up the scheduled_routine by user_id+date.
  if (ENABLE_GOOGLE_CALENDAR_SYNC) {
    try {
      const { deleteCalendarEventForDate } = loadGoogleCalendarSyncService()
      await deleteCalendarEventForDate(userId, parsed)
    } catch (syncErr) {
      captureException(syncErr, { context: 'googleCalendar.deleteSync' })
    }
  }

  const client = requireSupabase()
  const { error } = await client
    .from('scheduled_routines')
    .delete()
    .eq('user_id', userId)
    .eq('date', parsed)

  return { error: error ?? null }
}
