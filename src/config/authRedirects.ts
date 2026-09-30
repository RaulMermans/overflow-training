/**
 * Canonical source of truth for auth redirect URIs and deep-link paths.
 * Derives the app scheme from app.json so redirect constants stay in sync
 * with the Expo config automatically.
 *
 * Consumers: src/auth/useAuth.tsx, release verification scripts, contract tests.
 */

import appJson from '../../app.json'

/** The custom URL scheme registered in app.json (e.g. 'workout-tracker-ios'). */
export const APP_SCHEME: string = appJson.expo.scheme

/** Path segment for the Google OAuth / PKCE login callback. */
export const LOGIN_CALLBACK_PATH = 'login-callback' as const

/** Path segment for the password-reset magic-link callback. */
export const RESET_PASSWORD_PATH = 'reset-password' as const

/** Full redirect URI for Google OAuth login callback. */
export const LOGIN_CALLBACK_URI = `${APP_SCHEME}://${LOGIN_CALLBACK_PATH}`

/** Full redirect URI for password-reset magic link. */
export const RESET_PASSWORD_URI = `${APP_SCHEME}://${RESET_PASSWORD_PATH}`

/** Path segment for the Google Calendar OAuth callback. */
export const GOOGLE_CALENDAR_CALLBACK_PATH = 'google-calendar-callback' as const

/** Full redirect URI for the Google Calendar OAuth connection flow. */
export const GOOGLE_CALENDAR_CALLBACK_URI = `${APP_SCHEME}://${GOOGLE_CALENDAR_CALLBACK_PATH}`
