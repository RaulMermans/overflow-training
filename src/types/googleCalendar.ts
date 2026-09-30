export type GoogleCalendarConnectionStatus = 'connected' | 'disconnected' | 'error'
export type CalendarSyncStatus = 'synced' | 'pending' | 'error'

export interface GoogleCalendarConnection {
  id: string
  userId: string
  selectedCalendarId: string
  selectedCalendarSummary: string | null
  syncEnabled: boolean
  status: GoogleCalendarConnectionStatus
  connectedAt: string | null
  updatedAt: string
  lastError: string | null
}

export interface CalendarEventLink {
  id: string
  userId: string
  scheduledRoutineId: string
  externalCalendarId: string
  externalEventId: string
  syncStatus: CalendarSyncStatus
  lastSyncedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}
