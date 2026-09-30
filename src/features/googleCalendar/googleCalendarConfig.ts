import { ENABLE_GOOGLE_CALENDAR_SYNC } from '../../config/featureFlags'
import { GOOGLE_CALENDAR_CALLBACK_URI } from '../../config/authRedirects'
import { GoogleCalendarError } from './googleCalendarErrors'

export type GoogleCalendarConfig = {
  clientId: string
  callbackUri: string
}

export type GoogleCalendarFeatureState = {
  isFeatureEnabled: boolean
  isConfigured: boolean
  isVisible: boolean
  canConnect: boolean
}

function readGoogleOAuthClientId(): string {
  return (process.env['EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID'] as string | undefined)?.trim() ?? ''
}

export function getGoogleCalendarConfig(): GoogleCalendarConfig {
  return {
    clientId: readGoogleOAuthClientId(),
    callbackUri: GOOGLE_CALENDAR_CALLBACK_URI,
  }
}

export function getGoogleCalendarFeatureState(): GoogleCalendarFeatureState {
  const { clientId } = getGoogleCalendarConfig()
  const isFeatureEnabled = ENABLE_GOOGLE_CALENDAR_SYNC
  const isConfigured = clientId.length > 0
  const isVisible = isFeatureEnabled && isConfigured

  return {
    isFeatureEnabled,
    isConfigured,
    isVisible,
    canConnect: isVisible,
  }
}

export function validateGoogleCalendarConfig(): GoogleCalendarConfig {
  const config = getGoogleCalendarConfig()
  if (!config.clientId) {
    throw new GoogleCalendarError(
      'missingConfig',
      'Google OAuth client ID is not configured.',
      'Missing EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID.',
    )
  }
  return config
}
