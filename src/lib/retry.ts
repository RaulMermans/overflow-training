/**
 * Retry utility with exponential backoff
 * For resilient API calls and sync operations
 */

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number
  /** Initial delay in ms (default: 1000) */
  baseDelayMs?: number
  /** Maximum delay in ms (default: 30000) */
  maxDelayMs?: number
  /** Jitter factor 0-1 to randomize delays (default: 0.2) */
  jitter?: number
  /** Custom function to determine if error is retryable */
  shouldRetry?: (error: unknown, attempt: number) => boolean
  /** Callback for each retry attempt */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: 0.2,
  shouldRetry: () => true,
  onRetry: () => {},
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: number,
): number {
  // Exponential backoff: base * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1)

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs)

  // Add random jitter to prevent thundering herd
  const jitterAmount = cappedDelay * jitter * Math.random()

  return Math.floor(cappedDelay + jitterAmount)
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute function with automatic retry on failure
 *
 * @example
 * ```typescript
 * const data = await withRetry(
 *   () => fetchFromAPI('/users'),
 *   {
 *     maxAttempts: 5,
 *     onRetry: (err, attempt) => console.log(`Retry ${attempt}:`, err)
 *   }
 * )
 * ```
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: unknown

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Check if we should retry
      const isLastAttempt = attempt === opts.maxAttempts
      const shouldRetry = !isLastAttempt && opts.shouldRetry(error, attempt)

      if (!shouldRetry) {
        throw error
      }

      // Calculate delay and wait
      const delayMs = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs, opts.jitter)
      opts.onRetry(error, attempt, delayMs)

      await sleep(delayMs)
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError
}

/**
 * Check if error is a network error (retryable)
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('offline') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('load failed') ||
      message.includes('could not connect') ||
      message.includes('internet connection appears to be offline') ||
      message.includes('connection was lost') ||
      message.includes('connection reset') ||
      message.includes('connection aborted') ||
      message.includes('software caused connection abort') ||
      message.includes('unable to resolve host') ||
      message.includes('name resolution') ||
      message.includes('socket hang up') ||
      message.includes('econnreset') ||
      message.includes('econnaborted') ||
      message.includes('enetunreach') ||
      message.includes('ehostunreach') ||
      message.includes('enetdown')
    )
  }
  return false
}

/**
 * Check if error is a rate limit error (retryable with backoff)
 */
export function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return false
}

/**
 * Default retry predicate for API calls
 * Retries network errors and rate limits, not auth/validation errors
 */
export function defaultShouldRetry(error: unknown): boolean {
  // Don't retry auth errors
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status
    if (status === 401 || status === 403 || status === 400) {
      return false
    }
  }

  return isNetworkError(error) || isRateLimitError(error)
}
