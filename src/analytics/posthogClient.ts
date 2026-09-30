import PostHog from 'posthog-react-native'

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST

let posthogClient: PostHog | null = null

if (POSTHOG_KEY && POSTHOG_HOST) {
  try {
    posthogClient = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
    })
  } catch (err) {
    if (__DEV__) {
      console.warn('[PostHog] Failed to initialize:', err)
    }
  }
}

export function capture(
  eventName: string,
  properties?: Record<string, string | number | boolean>,
): void {
  if (!posthogClient) return
  try {
    posthogClient.capture(eventName, properties)
  } catch {
    // never crash the app for analytics
  }
}

export function screen(screenName: string, properties?: Record<string, string>): void {
  if (!posthogClient) return
  try {
    posthogClient.screen(screenName, properties)
  } catch {
    // never crash the app for analytics
  }
}

export function identify(userId: string, properties?: Record<string, string>): void {
  if (!posthogClient) return
  try {
    posthogClient.identify(userId, properties)
  } catch {
    // never crash the app for analytics
  }
}

export function reset(): void {
  if (!posthogClient) return
  try {
    posthogClient.reset()
  } catch {
    // never crash the app for analytics
  }
}

export function isPostHogConfigured(): boolean {
  return posthogClient !== null
}

export { posthogClient }
