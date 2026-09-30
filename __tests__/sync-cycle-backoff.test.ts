import {
  computeNextSyncDelayMs,
  SYNC_BASE_DELAY_MS,
  SYNC_MAX_DELAY_MS,
} from '../src/features/sync/syncBackoff'

describe('sync cycle backoff', () => {
  it('backs off exponentially on repeated failures and caps at max delay', () => {
    expect(computeNextSyncDelayMs(SYNC_BASE_DELAY_MS, 'offline')).toBe(30 * 1000)
    expect(computeNextSyncDelayMs(30 * 1000, 'error')).toBe(60 * 1000)
    expect(computeNextSyncDelayMs(60 * 1000, 'offline')).toBe(SYNC_MAX_DELAY_MS)
    expect(computeNextSyncDelayMs(SYNC_MAX_DELAY_MS, 'error')).toBe(SYNC_MAX_DELAY_MS)
  })

  it('resets backoff to base delay after a successful cycle', () => {
    expect(computeNextSyncDelayMs(120 * 1000, 'synced')).toBe(SYNC_BASE_DELAY_MS)
  })
})
