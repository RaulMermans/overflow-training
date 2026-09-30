import {
  loadTokens,
  storeTokens,
  refreshAccessToken,
  isTokenExpired,
  getConfiguredGoogleClientId,
} from './googleCalendarAuth'
import type { CalendarListEntry, GoogleCalendarEvent } from './types'
import { GoogleCalendarError } from './googleCalendarErrors'

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

// ── Token management ──────────────────────────────────────────────────────────

/**
 * Returns a valid access token for the given user, refreshing if necessary.
 * Throws if no tokens are stored (user not connected).
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const tokens = await loadTokens(userId)
  if (!tokens) {
    throw new GoogleCalendarError('notConnected', 'Google Calendar not connected.')
  }

  if (!isTokenExpired(tokens)) return tokens.accessToken

  const refreshed = await refreshAccessToken(tokens.refreshToken, getConfiguredGoogleClientId())
  await storeTokens(userId, refreshed)
  return refreshed.accessToken
}

// ── Calendar list ─────────────────────────────────────────────────────────────

export async function listCalendars(userId: string): Promise<CalendarListEntry[]> {
  const token = await getValidAccessToken(userId)
  const res = await fetch(`${CALENDAR_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status))
    throw new GoogleCalendarError('calendarListFailed', 'Failed to list Google Calendars.', text)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((json.items ?? []) as any[]).map((item: any) => ({
    id: item.id as string,
    summary: (item.summary as string) ?? item.id,
    primary: item.primary === true,
    accessRole: (item.accessRole as string) ?? 'reader',
  }))
}

// ── Event CRUD ────────────────────────────────────────────────────────────────

export async function createEvent(
  userId: string,
  calendarId: string,
  event: GoogleCalendarEvent,
): Promise<{ id: string }> {
  const token = await getValidAccessToken(userId)
  const res = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status))
    throw new GoogleCalendarError('syncFailed', 'Failed to create Google Calendar event.', text)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json()
  return { id: json.id as string }
}

export async function updateEvent(
  userId: string,
  calendarId: string,
  eventId: string,
  event: Partial<GoogleCalendarEvent>,
): Promise<void> {
  const token = await getValidAccessToken(userId)
  const res = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  )

  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status))
    throw new GoogleCalendarError('syncFailed', 'Failed to update Google Calendar event.', text)
  }
}

export async function deleteEvent(
  userId: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const token = await getValidAccessToken(userId)
  const res = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  )

  // 404 means the event is already gone — treat as success
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => String(res.status))
    throw new GoogleCalendarError('syncFailed', 'Failed to delete Google Calendar event.', text)
  }
}
