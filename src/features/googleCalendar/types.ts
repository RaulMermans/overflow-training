// Re-export shared types from canonical location accessible by all layers
export type {
  GoogleCalendarConnectionStatus,
  CalendarSyncStatus,
  GoogleCalendarConnection,
  CalendarEventLink,
} from '../../types/googleCalendar'

/** Stored in SecureStore under key `google_cal_tokens:{userId}` */
export interface GoogleTokens {
  accessToken: string
  refreshToken: string
  /** Unix timestamp (ms) when access token expires */
  expiresAt: number
}

/** Entry from Google Calendar list API */
export interface CalendarListEntry {
  id: string
  summary: string
  primary?: boolean
  accessRole: string
}

/** Subset of Google Calendar event fields used by this app */
export interface GoogleCalendarEvent {
  summary: string
  description: string
  start: { date: string }
  end: { date: string }
  extendedProperties: {
    private: Record<string, string>
  }
}
