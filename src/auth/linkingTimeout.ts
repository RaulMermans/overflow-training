import * as Linking from 'expo-linking'

const INITIAL_URL_TIMEOUT_MS = 5_000

/**
 * Wraps Linking.getInitialURL() with a timeout so auth callback screens
 * don't hang indefinitely if the native bridge stalls.
 * Returns null on timeout — callers already handle null as "no URL."
 */
export function getInitialURLWithTimeout(): Promise<string | null> {
  return Promise.race([
    Linking.getInitialURL(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), INITIAL_URL_TIMEOUT_MS)),
  ])
}
