/**
 * Google Calendar sync service (v1 — one-way, app is source of truth).
 *
 * All public functions are best-effort: they throw on hard failures so the
 * caller can log/capture, but they must never block workout scheduling.
 *
 * Trigger points:
 *   scheduleRoutineForDate     → syncCalendarEventForDate(userId, date)
 *   clearScheduledRoutineForDate → deleteCalendarEventForDate(userId, date)  [call BEFORE DB delete]
 *   sync-enable (backfill)     → backfillFutureScheduledRoutines(userId)
 *   manual repair              → repairAllFutureLinks(userId)
 */

import { requireSupabase } from '../../lib/supabaseClient'
import { createEvent, updateEvent, deleteEvent } from './googleCalendarClient'
import { buildEventFromScheduledRoutine } from './calendarEventBuilder'
import { fetchConnection, upsertConnection } from '../../db/googleCalendarConnections'
import {
  fetchLink,
  upsertLink,
  deleteLink,
  fetchFutureLinks,
} from '../../db/scheduledWorkoutCalendarLinks'

// ── Internal helpers ──────────────────────────────────────────────────────────

interface ScheduledRoutineWithName {
  id: string
  date: string
  routineName: string
  status: 'scheduled' | 'started' | 'completed' | 'skipped'
}

async function fetchScheduledRoutineByDate(
  userId: string,
  date: string,
): Promise<ScheduledRoutineWithName | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('scheduled_routines')
    .select('id, date, status, routines(name)')
    .eq('user_id', userId)
    .eq('date', date)
    .single()

  if (error || !data) return null

  // Cast through unknown: Supabase TS types don't infer the joined relation shape
  const row = data as unknown as {
    id: string
    date: string
    status: ScheduledRoutineWithName['status']
    routines: { name: string } | null
  }
  return {
    id: row.id,
    date: typeof row.date === 'string' ? row.date.slice(0, 10) : date,
    routineName: row.routines?.name ?? 'Workout',
    status: row.status,
  }
}

async function fetchFutureScheduledRoutines(
  userId: string,
  fromDate: string,
): Promise<ScheduledRoutineWithName[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('scheduled_routines')
    .select('id, date, status, routines(name)')
    .eq('user_id', userId)
    .gte('date', fromDate)
    .order('date', { ascending: true })

  if (error || !data) return []

  return (
    data as unknown as Array<{
      id: string
      date: string
      status: ScheduledRoutineWithName['status']
      routines: { name: string } | null
    }>
  )
    .filter((row) => row.status === 'scheduled' || row.status === 'started')
    .map((row) => ({
      id: row.id,
      date: typeof row.date === 'string' ? row.date.slice(0, 10) : '',
      routineName: row.routines?.name ?? 'Workout',
      status: row.status,
    }))
}

// ── Public sync functions ─────────────────────────────────────────────────────

/**
 * Syncs (create or update) the Google Calendar event for the scheduled workout
 * on the given date. No-ops if sync is not enabled.
 */
export async function syncCalendarEventForDate(userId: string, date: string): Promise<void> {
  const connection = await fetchConnection(userId)
  if (!connection || !connection.syncEnabled || connection.status !== 'connected') return

  const scheduled = await fetchScheduledRoutineByDate(userId, date)
  if (!scheduled) return
  if (scheduled.status === 'completed' || scheduled.status === 'skipped') return

  const event = buildEventFromScheduledRoutine(scheduled.routineName, scheduled.date, scheduled.id)

  const existingLink = await fetchLink(userId, scheduled.id)

  if (existingLink) {
    // Update existing Google event
    await updateEvent(userId, existingLink.externalCalendarId, existingLink.externalEventId, event)
    await upsertLink(userId, {
      scheduledRoutineId: scheduled.id,
      externalCalendarId: existingLink.externalCalendarId,
      externalEventId: existingLink.externalEventId,
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    })
  } else {
    // Create new Google event
    const { id: externalEventId } = await createEvent(userId, connection.selectedCalendarId, event)
    await upsertLink(userId, {
      scheduledRoutineId: scheduled.id,
      externalCalendarId: connection.selectedCalendarId,
      externalEventId,
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    })
  }
}

/**
 * Deletes the Google Calendar event for the workout scheduled on the given date.
 * Must be called BEFORE the scheduled_routine row is deleted (so we can look it up).
 * No-ops if no link record exists.
 */
export async function deleteCalendarEventForDate(userId: string, date: string): Promise<void> {
  const connection = await fetchConnection(userId)
  if (!connection || connection.status !== 'connected') return

  const client = requireSupabase()
  const { data } = await client
    .from('scheduled_routines')
    .select('id')
    .eq('user_id', userId)
    .eq('date', date)
    .single()

  if (!data) return

  const scheduledRoutineId = (data as { id: string }).id
  const existingLink = await fetchLink(userId, scheduledRoutineId)
  if (!existingLink) return

  await deleteEvent(userId, existingLink.externalCalendarId, existingLink.externalEventId)
  await deleteLink(userId, scheduledRoutineId)
}

/**
 * Syncs all future scheduled workouts that don't yet have a Google Calendar link.
 * Called when the user first enables sync or after reconnect.
 */
export async function backfillFutureScheduledRoutines(userId: string): Promise<void> {
  const connection = await fetchConnection(userId)
  if (!connection || !connection.syncEnabled || connection.status !== 'connected') return

  const today = new Date().toISOString().slice(0, 10)
  const futureRoutines = await fetchFutureScheduledRoutines(userId, today)

  for (const scheduled of futureRoutines) {
    const existing = await fetchLink(userId, scheduled.id)
    if (existing) continue // already synced

    const event = buildEventFromScheduledRoutine(
      scheduled.routineName,
      scheduled.date,
      scheduled.id,
    )
    try {
      const { id: externalEventId } = await createEvent(
        userId,
        connection.selectedCalendarId,
        event,
      )
      await upsertLink(userId, {
        scheduledRoutineId: scheduled.id,
        externalCalendarId: connection.selectedCalendarId,
        externalEventId,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      })
    } catch (err) {
      // Record error on individual link but continue processing others
      await upsertLink(userId, {
        scheduledRoutineId: scheduled.id,
        externalCalendarId: connection.selectedCalendarId,
        externalEventId: '',
        syncStatus: 'error',
        lastSyncedAt: null,
        lastError: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/**
 * Repair: deletes all existing Google events and recreates them from scratch.
 * Use when events have drifted or become stale.
 */
export async function repairAllFutureLinks(userId: string): Promise<void> {
  const connection = await fetchConnection(userId)
  if (!connection || !connection.syncEnabled || connection.status !== 'connected') return

  const today = new Date().toISOString().slice(0, 10)
  const existingLinks = await fetchFutureLinks(userId, today)

  // Delete existing Google events
  for (const link of existingLinks) {
    try {
      await deleteEvent(userId, link.externalCalendarId, link.externalEventId)
    } catch {
      // Best-effort: continue even if individual deletes fail
    }
    await deleteLink(userId, link.scheduledRoutineId)
  }

  // Recreate all
  await backfillFutureScheduledRoutines(userId)
}

/**
 * Records a sync error on the connection row (e.g. revoked access).
 */
export async function markConnectionError(userId: string, errorMessage: string): Promise<void> {
  await upsertConnection(userId, {
    status: 'error',
    lastError: errorMessage,
    updatedAt: new Date().toISOString(),
  })
}
