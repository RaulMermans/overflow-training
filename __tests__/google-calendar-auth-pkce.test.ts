import {
  buildGoogleAuthUrl,
  generateOAuthState,
  generatePKCEPair,
  isTokenExpired,
  parseGoogleCalendarCallback,
} from '../src/features/googleCalendar/googleCalendarAuth'
import { GOOGLE_CALENDAR_CALLBACK_URI } from '../src/config/authRedirects'
import { GoogleCalendarError } from '../src/features/googleCalendar/googleCalendarErrors'
import type { GoogleTokens } from '../src/features/googleCalendar/types'

// Polyfill crypto.getRandomValues and crypto.subtle for Jest (Node environment)
import * as nodeCrypto from 'crypto'
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: (buffer: Uint8Array) => nodeCrypto.randomFillSync(buffer),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subtle: (nodeCrypto as any).webcrypto?.subtle,
    },
  })
}

describe('generatePKCEPair', () => {
  it('returns verifier and challenge strings', async () => {
    const { verifier, challenge } = await generatePKCEPair()
    expect(typeof verifier).toBe('string')
    expect(typeof challenge).toBe('string')
  })

  it('verifier has at least 43 characters (RFC 7636 minimum)', async () => {
    const { verifier } = await generatePKCEPair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
  })

  it('challenge uses base64url encoding (no +, /, =)', async () => {
    const { challenge } = await generatePKCEPair()
    expect(challenge).not.toMatch(/[+/=]/)
  })

  it('each call produces unique values', async () => {
    const first = await generatePKCEPair()
    const second = await generatePKCEPair()
    expect(first.verifier).not.toBe(second.verifier)
    expect(first.challenge).not.toBe(second.challenge)
  })

  it('challenge is derived from verifier (SHA-256 base64url)', async () => {
    // Verify the challenge matches expected SHA-256 derivation
    const { verifier, challenge } = await generatePKCEPair()
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    const bytes = new Uint8Array(digest)
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    const expected = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    expect(challenge).toBe(expected)
  })
})

describe('buildGoogleAuthUrl', () => {
  const params = { clientId: 'test-client-id', challenge: 'test-challenge' }

  it('starts with Google OAuth URL', () => {
    const url = buildGoogleAuthUrl(params)
    expect(url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/)
  })

  it('includes client_id', () => {
    const url = buildGoogleAuthUrl(params)
    expect(url).toContain('client_id=test-client-id')
  })

  it('uses the canonical Google Calendar callback URI', () => {
    const url = new URL(buildGoogleAuthUrl(params))
    expect(url.searchParams.get('redirect_uri')).toBe(GOOGLE_CALENDAR_CALLBACK_URI)
  })

  it('includes calendar.events scope', () => {
    const url = buildGoogleAuthUrl(params)
    expect(decodeURIComponent(url)).toContain('https://www.googleapis.com/auth/calendar.events')
  })

  it('includes calendar.readonly scope', () => {
    const url = buildGoogleAuthUrl(params)
    expect(decodeURIComponent(url)).toContain('https://www.googleapis.com/auth/calendar.readonly')
  })

  it('requests offline access', () => {
    const url = buildGoogleAuthUrl(params)
    expect(url).toContain('access_type=offline')
  })

  it('includes S256 code_challenge_method', () => {
    const url = buildGoogleAuthUrl(params)
    expect(url).toContain('code_challenge_method=S256')
  })

  it('includes code_challenge', () => {
    const url = buildGoogleAuthUrl(params)
    expect(url).toContain('code_challenge=test-challenge')
  })

  it('requests consent prompt to ensure refresh_token is returned', () => {
    const url = buildGoogleAuthUrl(params)
    expect(url).toContain('prompt=consent')
  })

  it('includes state when provided', () => {
    const url = buildGoogleAuthUrl({ ...params, state: 'state-123' })
    expect(url).toContain('state=state-123')
  })
})

describe('generateOAuthState', () => {
  it('returns a random state token', () => {
    const first = generateOAuthState()
    const second = generateOAuthState()

    expect(first).toEqual(expect.any(String))
    expect(first.length).toBeGreaterThanOrEqual(32)
    expect(first).not.toBe(second)
  })
})

describe('parseGoogleCalendarCallback', () => {
  it('returns the authorization code when state matches', () => {
    const result = parseGoogleCalendarCallback(
      'workout-tracker-ios://google-calendar-callback?code=abc123&state=expected-state',
      'expected-state',
    )

    expect(result).toEqual({ code: 'abc123' })
  })

  it('throws a typed error when state does not match', () => {
    expect(() =>
      parseGoogleCalendarCallback(
        'workout-tracker-ios://google-calendar-callback?code=abc123&state=wrong-state',
        'expected-state',
      ),
    ).toThrow(GoogleCalendarError)

    try {
      parseGoogleCalendarCallback(
        'workout-tracker-ios://google-calendar-callback?code=abc123&state=wrong-state',
        'expected-state',
      )
    } catch (error) {
      expect((error as GoogleCalendarError).code).toBe('stateMismatch')
    }
  })

  it('throws a typed error when the user denies access', () => {
    try {
      parseGoogleCalendarCallback(
        'workout-tracker-ios://google-calendar-callback?error=access_denied&state=expected-state',
        'expected-state',
      )
    } catch (error) {
      expect((error as GoogleCalendarError).code).toBe('oauthDenied')
    }
  })

  it('throws a typed error when the callback is missing a code', () => {
    try {
      parseGoogleCalendarCallback(
        'workout-tracker-ios://google-calendar-callback?state=expected-state',
        'expected-state',
      )
    } catch (error) {
      expect((error as GoogleCalendarError).code).toBe('invalidCallback')
    }
  })
})

describe('isTokenExpired', () => {
  it('returns false for tokens not yet expired', () => {
    const tokens: GoogleTokens = {
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
    }
    expect(isTokenExpired(tokens)).toBe(false)
  })

  it('returns true for tokens past expiry', () => {
    const tokens: GoogleTokens = {
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresAt: Date.now() - 1000, // 1 second ago
    }
    expect(isTokenExpired(tokens)).toBe(true)
  })

  it('returns true when token is within the 5-minute buffer window', () => {
    const tokens: GoogleTokens = {
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresAt: Date.now() + 4 * 60 * 1000, // 4 minutes (within 5-min buffer)
    }
    expect(isTokenExpired(tokens)).toBe(true)
  })
})
