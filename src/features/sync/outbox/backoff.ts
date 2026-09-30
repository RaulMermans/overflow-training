const BASE_DELAY_MS = 2000
const MAX_DELAY_MS = 5 * 60 * 1000

export function computeOutboxBackoffMs(attempt: number): number {
  const safeAttempt = Math.max(1, attempt)
  const exponential = BASE_DELAY_MS * Math.pow(2, safeAttempt - 1)
  return Math.min(exponential, MAX_DELAY_MS)
}

export function computeOutboxRetryAt(attempt: number, now: Date = new Date()): string {
  const ms = computeOutboxBackoffMs(attempt)
  return new Date(now.getTime() + ms).toISOString()
}
