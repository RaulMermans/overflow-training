import { requireSupabase } from '../lib/supabaseClient'
import type {
  GoogleCalendarConnection,
  GoogleCalendarConnectionStatus,
} from '../types/googleCalendar'

function toConnection(row: Record<string, unknown>): GoogleCalendarConnection {
  return {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    selectedCalendarId: (row['selected_calendar_id'] as string) ?? 'primary',
    selectedCalendarSummary: (row['selected_calendar_summary'] as string | null) ?? null,
    syncEnabled: (row['sync_enabled'] as boolean) ?? false,
    status: (row['status'] as GoogleCalendarConnectionStatus) ?? 'disconnected',
    connectedAt: (row['connected_at'] as string | null) ?? null,
    updatedAt: row['updated_at'] as string,
    lastError: (row['last_error'] as string | null) ?? null,
  }
}

export async function fetchConnection(userId: string): Promise<GoogleCalendarConnection | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('google_calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) return null
  return toConnection(data as Record<string, unknown>)
}

interface UpsertConnectionFields {
  selectedCalendarId?: string
  selectedCalendarSummary?: string | null
  syncEnabled?: boolean
  status?: GoogleCalendarConnectionStatus
  connectedAt?: string | null
  updatedAt?: string
  lastError?: string | null
}

export async function upsertConnection(
  userId: string,
  fields: UpsertConnectionFields,
): Promise<GoogleCalendarConnection> {
  const client = requireSupabase()

  const row: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  }
  if (fields.selectedCalendarId !== undefined)
    row['selected_calendar_id'] = fields.selectedCalendarId
  if (fields.selectedCalendarSummary !== undefined)
    row['selected_calendar_summary'] = fields.selectedCalendarSummary
  if (fields.syncEnabled !== undefined) row['sync_enabled'] = fields.syncEnabled
  if (fields.status !== undefined) row['status'] = fields.status
  if (fields.connectedAt !== undefined) row['connected_at'] = fields.connectedAt
  if (fields.updatedAt !== undefined) row['updated_at'] = fields.updatedAt
  if (fields.lastError !== undefined) row['last_error'] = fields.lastError

  const { data, error } = await client
    .from('google_calendar_connections')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to save Google Calendar connection')
  return toConnection(data as Record<string, unknown>)
}

export async function deleteConnection(userId: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('google_calendar_connections').delete().eq('user_id', userId)

  if (error) throw new Error(error.message)
}
