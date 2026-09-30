import * as SecureStore from 'expo-secure-store'
import { GOOGLE_CALENDAR_CALLBACK_URI } from '../../config/authRedirects'
import type { GoogleTokens } from './types'
import { validateGoogleCalendarConfig } from './googleCalendarConfig'
import { GoogleCalendarError } from './googleCalendarErrors'

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

// Minimum buffer (ms) before expiry at which we treat the token as expired
const EXPIRY_BUFFER_MS = 5 * 60 * 1000 // 5 minutes

function secureStoreKey(userId: string): string {
  return `google_cal_tokens:${userId}`
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => chars[b % chars.length])
    .join('')
}

export async function generatePKCEPair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = generateRandomString(64)
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const challenge = base64UrlEncode(digest)
  return { verifier, challenge }
}

export function generateOAuthState(): string {
  return generateRandomString(32)
}

// ── OAuth URL builder ─────────────────────────────────────────────────────────

interface BuildGoogleAuthUrlParams {
  clientId: string
  challenge: string
  state?: string
}

export function buildGoogleAuthUrl({
  clientId,
  challenge,
  state,
}: BuildGoogleAuthUrlParams): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: GOOGLE_CALENDAR_CALLBACK_URI,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    ...(state ? { state } : {}),
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function parseGoogleCalendarCallback(
  callbackUrl: string,
  expectedState?: string,
): { code: string } {
  let url: URL
  try {
    url = new URL(callbackUrl)
  } catch {
    throw new GoogleCalendarError('invalidCallback', 'Malformed Google Calendar callback URL.')
  }

  const error = url.searchParams.get('error')
  if (error === 'access_denied') {
    throw new GoogleCalendarError('oauthDenied', 'Google Calendar permission was denied.', error)
  }
  if (error) {
    throw new GoogleCalendarError(
      'invalidCallback',
      'Google Calendar callback contained an error.',
      error,
    )
  }

  const returnedState = url.searchParams.get('state')
  if (expectedState && returnedState !== expectedState) {
    throw new GoogleCalendarError('stateMismatch', 'Google Calendar callback state did not match.')
  }

  const code = url.searchParams.get('code')
  if (!code) {
    throw new GoogleCalendarError(
      'invalidCallback',
      'No authorization code was returned by Google.',
    )
  }

  return { code }
}

// ── Token exchange ────────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  clientId: string,
): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: GOOGLE_CALENDAR_CALLBACK_URI,
    code_verifier: verifier,
    grant_type: 'authorization_code',
  })

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status))
    throw new GoogleCalendarError('connectFailed', 'Google token exchange failed.', text)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json()
  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token as string,
    expiresAt: Date.now() + (json.expires_in as number) * 1000,
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status))
    throw new GoogleCalendarError('notConnected', 'Google token refresh failed.', text)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json()
  return {
    accessToken: json.access_token as string,
    // refresh_token may not be returned on refresh — keep existing one
    refreshToken: (json.refresh_token as string | undefined) ?? refreshToken,
    expiresAt: Date.now() + (json.expires_in as number) * 1000,
  }
}

// ── SecureStore helpers ───────────────────────────────────────────────────────

export async function storeTokens(userId: string, tokens: GoogleTokens): Promise<void> {
  await SecureStore.setItemAsync(secureStoreKey(userId), JSON.stringify(tokens))
}

export async function loadTokens(userId: string): Promise<GoogleTokens | null> {
  const raw = await SecureStore.getItemAsync(secureStoreKey(userId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as GoogleTokens
  } catch {
    return null
  }
}

export async function clearTokens(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(secureStoreKey(userId))
}

export function isTokenExpired(tokens: GoogleTokens): boolean {
  return Date.now() >= tokens.expiresAt - EXPIRY_BUFFER_MS
}

export function getConfiguredGoogleClientId(): string {
  return validateGoogleCalendarConfig().clientId
}
