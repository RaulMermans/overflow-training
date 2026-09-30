/**
 * Crash reporting abstraction.
 * Uses Sentry when EXPO_PUBLIC_SENTRY_DSN is set; otherwise no-op.
 * Swap provider by changing the implementation behind this interface.
 */

import type * as SentryModule from '@sentry/react-native'

export interface CrashReportingConfig {
  release: string
  env: string
}

export interface CrashContext {
  [key: string]: string | number | boolean | string[] | undefined
}

type SentryLike = Pick<
  typeof SentryModule,
  'init' | 'setTag' | 'withScope' | 'captureException' | 'captureMessage' | 'setUser' | 'setContext'
>

let cachedSentry: SentryLike | null = null
let initialized = false

/**
 * Attempt to load Sentry via dynamic require so the dependency stays optional.
 * Returns null if the module is unavailable (e.g. DSN not configured).
 */
function loadSentry(): SentryLike | null {
  try {
    // `module.require` is available at runtime in React Native / Metro bundles.
    const m =
      typeof module !== 'undefined'
        ? (module as unknown as { require?: (id: string) => unknown })
        : undefined
    const req = m && typeof m.require === 'function' ? m.require.bind(m) : null
    if (!req) return null
    return req('@sentry/react-native') as SentryLike
  } catch {
    return null
  }
}

export function initCrashReporting(config: CrashReportingConfig): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN
  if (!dsn || typeof dsn !== 'string' || dsn.trim().length === 0) {
    if (__DEV__) {
      console.info('[Crash] Sentry DSN not set; crash reporting disabled.')
    }
    return
  }

  const Sentry = loadSentry()
  if (!Sentry) return

  try {
    Sentry.init({
      dsn,
      release: config.release,
      environment: config.env,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      enableAutoSessionTracking: true,
      attachStacktrace: true,
    })
    Sentry.setTag('release', config.release)
    Sentry.setTag('environment', config.env)
    cachedSentry = Sentry
    initialized = true
  } catch (err) {
    if (__DEV__) {
      console.warn('[Crash] Sentry init failed:', err)
    }
  }
}

export function captureException(error: Error | unknown, context?: CrashContext): void {
  if (!initialized || !cachedSentry) return
  try {
    if (context && Object.keys(context).length > 0) {
      cachedSentry.withScope((scope) => {
        Object.entries(context).forEach(([k, v]) => {
          if (v !== undefined) scope.setExtra(k, v)
        })
        cachedSentry!.captureException(error)
      })
    } else {
      cachedSentry.captureException(error)
    }
  } catch {
    // never crash the app for crash reporting
  }
}

export function captureMessage(message: string, context?: CrashContext): void {
  if (!initialized || !cachedSentry) return
  try {
    if (context && Object.keys(context).length > 0) {
      cachedSentry.withScope((scope) => {
        Object.entries(context).forEach(([k, v]) => {
          if (v !== undefined) scope.setExtra(k, v)
        })
        cachedSentry!.captureMessage(message)
      })
    } else {
      cachedSentry.captureMessage(message)
    }
  } catch {
    // never crash the app for crash reporting
  }
}

export function setUser(userId: string | null, traits?: Record<string, string>): void {
  if (!initialized || !cachedSentry) return
  try {
    if (userId) {
      cachedSentry.setUser({ id: userId, ...traits })
    } else {
      cachedSentry.setUser(null)
    }
  } catch {
    // never crash the app for crash reporting
  }
}

export function setTag(key: string, value: string): void {
  if (!initialized || !cachedSentry) return
  try {
    cachedSentry.setTag(key, value)
  } catch {
    // never crash the app for crash reporting
  }
}

export function setContext(name: string, data: Record<string, unknown>): void {
  if (!initialized || !cachedSentry) return
  try {
    cachedSentry.setContext(name, data)
  } catch {
    // never crash the app for crash reporting
  }
}

export function isCrashReportingConfigured(): boolean {
  return initialized
}
