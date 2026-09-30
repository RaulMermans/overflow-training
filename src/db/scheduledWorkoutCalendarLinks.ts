import { requireSupabase } from '../lib/supabaseClient'
import type { CalendarEventLink, CalendarSyncStatus } from '../types/googleCalendar'

function toLink(row: Record<string, unknown>): CalendarEventLink {
  return {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    scheduledRoutineId: row['scheduled_routine_id'] as string,
    externalCalendarId: row['external_calendar_id'] as string,
    externalEventId: row['external_event_id'] as string,
    syncStatus: (row['sync_status'] as CalendarSyncStatus) ?? 'pending',
    lastSyncedAt: (row['last_synced_at'] as string | null) ?? null,
    lastError: (row['last_error'] as string | null) ?? null,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  }
}

export async function fetchLink(
  userId: string,
  scheduledRoutineId: string,
): Promise<CalendarEventLink | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('scheduled_workout_calendar_links')
    .select('*')
    .eq('user_id', userId)
    .eq('scheduled_routine_id', scheduledRoutineId)
    .single()

  if (error || !data) return null
  return toLink(data as Record<string, unknown>)
}

interface UpsertLinkFields {
  scheduledRoutineId: string
  externalCalendarId: string
  externalEventId: string
  syncStatus: CalendarSyncStatus
  lastSyncedAt: string | null
  lastError: string | null
}

export async function upsertLink(
  userId: string,
  fields: UpsertLinkFields,
): Promise<CalendarEventLink> {
  const client = requireSupabase()

  const row: Record<string, unknown> = {
    user_id: userId,
    scheduled_routine_id: fields.scheduledRoutineId,
    external_calendar_id: fields.externalCalendarId,
    external_event_id: fields.externalEventId,
    sync_status: fields.syncStatus,
    last_synced_at: fields.lastSyncedAt,
    last_error: fields.lastError,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from('scheduled_workout_calendar_links')
    .upsert(row, { onConflict: 'user_id,scheduled_routine_id' })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to save calendar link')
  return toLink(data as Record<string, unknown>)
}

export async function deleteLink(userId: string, scheduledRoutineId: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('scheduled_workout_calendar_links')
    .delete()
    .eq('user_id', userId)
    .eq('scheduled_routine_id', scheduledRoutineId)

  if (error) throw new Error(error.message)
}

export async function fetchFutureLinks(
  userId: string,
  fromDate: string,
): Promise<CalendarEventLink[]> {
  const client = requireSupabase()
  const { data: routineRows, error: routineError } = await client
    .from('scheduled_routines')
    .select('id')
    .eq('user_id', userId)
    .gte('date', fromDate)

  if (routineError || !routineRows || routineRows.length === 0) return []

  const scheduledRoutineIds = (routineRows as Array<{ id: string }>).map((row) => row.id)
  const { data, error } = await client
    .from('scheduled_workout_calendar_links')
    .select('*')
    .eq('user_id', userId)
    .in('scheduled_routine_id', scheduledRoutineIds)

  if (error || !data) return []

  return (data as Record<string, unknown>[]).map(toLink)
}
