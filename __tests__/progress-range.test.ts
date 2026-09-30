import { DEFAULT_PROGRESS_RANGE_DAYS, getDefaultProgressRange } from '../src/db/progress'

describe('progress range helpers', () => {
  it('uses 84 days by default', () => {
    const now = new Date('2026-02-17T12:00:00.000Z')
    const range = getDefaultProgressRange(undefined, now)

    expect(range.days).toBe(DEFAULT_PROGRESS_RANGE_DAYS)
    expect(range.toISO).toBe('2026-02-17T12:00:00.000Z')
    expect(range.fromISO).toBe('2025-11-25T12:00:00.000Z')
  })

  it('falls back to default days when input is invalid', () => {
    const now = new Date('2026-02-17T12:00:00.000Z')

    expect(getDefaultProgressRange(0, now).days).toBe(DEFAULT_PROGRESS_RANGE_DAYS)
    expect(getDefaultProgressRange(-5, now).days).toBe(DEFAULT_PROGRESS_RANGE_DAYS)
  })

  it('builds an inclusive from/to window for custom days', () => {
    const now = new Date('2026-02-17T00:00:00.000Z')
    const range = getDefaultProgressRange(7, now)

    expect(range.days).toBe(7)
    expect(range.toISO).toBe('2026-02-17T00:00:00.000Z')
    expect(range.fromISO).toBe('2026-02-10T00:00:00.000Z')
  })
})
