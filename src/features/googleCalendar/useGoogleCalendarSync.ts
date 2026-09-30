import { useState, useCallback, useEffect, useMemo } from 'react'
import * as WebBrowser from 'expo-web-browser'
import { useAuth } from '../../auth/useAuth'
import {
  buildGoogleAuthUrl,
  clearTokens,
  exchangeCodeForTokens,
  generateOAuthState,
  generatePKCEPair,
  parseGoogleCalendarCallback,
  storeTokens,
} from './googleCalendarAuth'
import { getGoogleCalendarConfig, validateGoogleCalendarConfig } from './googleCalendarConfig'
import { listCalendars } from './googleCalendarClient'
import { GoogleCalendarError, shouldReconnect, toGoogleCalendarError } from './googleCalendarErrors'
import { backfillFutureScheduledRoutines, repairAllFutureLinks } from './syncService'
import {
  deleteConnection,
  fetchConnection,
  upsertConnection,
} from '../../db/googleCalendarConnections'
import type { CalendarListEntry, GoogleCalendarConnection } from './types'

export interface UseGoogleCalendarSyncReturn {
  connection: GoogleCalendarConnection | null
  availableCalendars: CalendarListEntry[]
  isLoading: boolean
  isConnecting: boolean
  isSyncing: boolean
  error: GoogleCalendarError | null
  isConfigured: boolean
  needsReconnect: boolean
  connectGoogleCalendar: () => Promise<void>
  disconnectGoogleCalendar: () => Promise<void>
  setSelectedCalendar: (calendarId: string, summary: string) => Promise<void>
  setSyncEnabled: (enabled: boolean) => Promise<void>
  reSync: () => Promise<void>
  reload: () => Promise<void>
}

export function useGoogleCalendarSync(): UseGoogleCalendarSyncReturn {
  const { user } = useAuth()
  const [connection, setConnection] = useState<GoogleCalendarConnection | null>(null)
  const [availableCalendars, setAvailableCalendars] = useState<CalendarListEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<GoogleCalendarError | null>(null)

  const config = getGoogleCalendarConfig()
  const isConfigured = config.clientId.length > 0

  const persistReconnectError = useCallback(
    async (nextError: GoogleCalendarError, currentConnection: GoogleCalendarConnection | null) => {
      if (!user?.id || !currentConnection || !shouldReconnect(nextError)) {
        return currentConnection
      }

      const updatedConnection = await upsertConnection(user.id, {
        status: 'error',
        lastError: nextError.detail ?? nextError.message,
      })
      setConnection(updatedConnection)
      return updatedConnection
    },
    [user?.id],
  )

  const loadCalendars = useCallback(
    async (
      currentConnection: GoogleCalendarConnection | null,
    ): Promise<GoogleCalendarConnection | null> => {
      if (!user?.id || !currentConnection) {
        setAvailableCalendars([])
        return currentConnection
      }

      try {
        const calendars = await listCalendars(user.id)
        setAvailableCalendars(calendars)

        const selectedStillExists =
          calendars.length === 0 ||
          calendars.some((calendar) => calendar.id === currentConnection.selectedCalendarId)

        if (selectedStillExists) {
          if (currentConnection.status === 'error' || currentConnection.lastError) {
            const restored = await upsertConnection(user.id, {
              status: 'connected',
              lastError: null,
            })
            setConnection(restored)
            return restored
          }
          return currentConnection
        }

        const fallback = calendars.find((calendar) => calendar.primary) ?? calendars[0]
        if (!fallback) return currentConnection

        const updatedConnection = await upsertConnection(user.id, {
          selectedCalendarId: fallback.id,
          selectedCalendarSummary: fallback.summary,
          status: 'connected',
          lastError: null,
        })
        setConnection(updatedConnection)
        return updatedConnection
      } catch (loadError) {
        const normalizedError = toGoogleCalendarError(loadError, 'calendarListFailed')
        setAvailableCalendars([])
        setError(normalizedError)
        return persistReconnectError(normalizedError, currentConnection)
      }
    },
    [persistReconnectError, user?.id],
  )

  const loadConnection = useCallback(async () => {
    if (!user?.id) {
      setConnection(null)
      setAvailableCalendars([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const currentConnection = await fetchConnection(user.id)
      setConnection(currentConnection)
      await loadCalendars(currentConnection)
    } catch (loadError) {
      setConnection(null)
      setAvailableCalendars([])
      setError(toGoogleCalendarError(loadError, 'unknown'))
    } finally {
      setIsLoading(false)
    }
  }, [loadCalendars, user?.id])

  useEffect(() => {
    void loadConnection()
  }, [loadConnection])

  const connectGoogleCalendar = useCallback(async () => {
    if (!user?.id) return

    try {
      validateGoogleCalendarConfig()
    } catch (configError) {
      setError(toGoogleCalendarError(configError, 'missingConfig'))
      return
    }

    setIsConnecting(true)
    setError(null)

    try {
      const { verifier, challenge } = await generatePKCEPair()
      const state = generateOAuthState()
      const authUrl = buildGoogleAuthUrl({
        clientId: config.clientId,
        challenge,
        state,
      })

      const result = await WebBrowser.openAuthSessionAsync(authUrl, config.callbackUri, {
        dismissButtonStyle: 'cancel',
      })

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return
      }

      if (result.type !== 'success') {
        throw new GoogleCalendarError(
          'connectFailed',
          `Unexpected Google Calendar auth result: ${result.type}`,
        )
      }

      const { code } = parseGoogleCalendarCallback(result.url, state)
      const tokens = await exchangeCodeForTokens(code, verifier, config.clientId)
      await storeTokens(user.id, tokens)

      const calendars = await listCalendars(user.id)
      setAvailableCalendars(calendars)

      const primaryCalendar = calendars.find((calendar) => calendar.primary) ?? calendars[0]
      const nextConnection = await upsertConnection(user.id, {
        selectedCalendarId: primaryCalendar?.id ?? 'primary',
        selectedCalendarSummary: primaryCalendar?.summary ?? null,
        syncEnabled: connection?.syncEnabled ?? false,
        status: 'connected',
        connectedAt: new Date().toISOString(),
        lastError: null,
      })

      setConnection(nextConnection)

      if (nextConnection.syncEnabled) {
        setIsSyncing(true)
        try {
          await backfillFutureScheduledRoutines(user.id)
        } finally {
          setIsSyncing(false)
        }
      }
    } catch (connectError) {
      const normalizedError = toGoogleCalendarError(connectError, 'connectFailed')
      setError(normalizedError)
      await persistReconnectError(normalizedError, connection)
    } finally {
      setIsConnecting(false)
    }
  }, [config.callbackUri, config.clientId, connection, persistReconnectError, user?.id])

  const disconnectGoogleCalendar = useCallback(async () => {
    if (!user?.id) return

    setError(null)
    try {
      await clearTokens(user.id)
      await deleteConnection(user.id)
      setConnection(null)
      setAvailableCalendars([])
    } catch (disconnectError) {
      setError(toGoogleCalendarError(disconnectError, 'disconnectFailed'))
    }
  }, [user?.id])

  const setSelectedCalendar = useCallback(
    async (calendarId: string, summary: string) => {
      if (!user?.id) return

      setError(null)
      try {
        const nextConnection = await upsertConnection(user.id, {
          selectedCalendarId: calendarId,
          selectedCalendarSummary: summary,
          status: 'connected',
          lastError: null,
        })
        setConnection(nextConnection)
      } catch (calendarError) {
        setError(toGoogleCalendarError(calendarError, 'calendarListFailed'))
      }
    },
    [user?.id],
  )

  const setSyncEnabled = useCallback(
    async (enabled: boolean) => {
      if (!user?.id || !connection) return

      setError(null)
      try {
        const nextConnection = await upsertConnection(user.id, {
          syncEnabled: enabled,
          status: 'connected',
          lastError: null,
        })
        setConnection(nextConnection)

        if (enabled) {
          setIsSyncing(true)
          try {
            await backfillFutureScheduledRoutines(user.id)
          } finally {
            setIsSyncing(false)
          }
        }
      } catch (syncError) {
        setError(toGoogleCalendarError(syncError, 'syncFailed'))
      }
    },
    [connection, user?.id],
  )

  const reSync = useCallback(async () => {
    if (!user?.id) return

    setError(null)
    setIsSyncing(true)

    try {
      await repairAllFutureLinks(user.id)
    } catch (syncError) {
      setError(toGoogleCalendarError(syncError, 'syncFailed'))
    } finally {
      setIsSyncing(false)
    }
  }, [user?.id])

  const needsReconnect = useMemo(
    () => connection?.status === 'error' || error?.code === 'notConnected',
    [connection?.status, error?.code],
  )

  return {
    connection,
    availableCalendars,
    isLoading,
    isConnecting,
    isSyncing,
    error,
    isConfigured,
    needsReconnect,
    connectGoogleCalendar,
    disconnectGoogleCalendar,
    setSelectedCalendar,
    setSyncEnabled,
    reSync,
    reload: loadConnection,
  }
}
