export const SYNC_BASE_DELAY_MS = 15 * 1000
export const SYNC_MAX_DELAY_MS = 2 * 60 * 1000

export function computeNextSyncDelayMs(
  currentDelayMs: number,
  nextStatus: 'synced' | 'offline' | 'error',
): number {
  if (nextStatus === 'synced') {
    return SYNC_BASE_DELAY_MS
  }

  const safeCurrent = Math.max(SYNC_BASE_DELAY_MS, currentDelayMs)
  const next = safeCurrent * 2
  return Math.min(next, SYNC_MAX_DELAY_MS)
}
