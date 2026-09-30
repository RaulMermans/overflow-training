import { computeCheckinMilestonePeriodForSave } from '../src/features/checkins/milestones'
import type { CheckinEntry } from '../src/features/checkins/storage'

function daysAfter(startISO: string, days: number): string {
  const date = new Date(startISO)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function makeEntry(id: string, takenAtISO: string, userId: string = 'user-1'): CheckinEntry {
  return {
    id,
    userId,
    takenAtISO,
    pose: 'front',
    photoUri: `file:///tmp/${id}.jpg`,
  }
}

describe('check-in milestones', () => {
  const day1 = '2026-01-01T12:00:00.000Z'

  it('returns day1 for the first check-in', () => {
    const period = computeCheckinMilestonePeriodForSave([], day1)
    expect(period).toBe('day1')
  })

  it('returns month1 when crossing 30 days', () => {
    const existing = [makeEntry('c1', day1), makeEntry('c2', daysAfter(day1, 10))]

    const period = computeCheckinMilestonePeriodForSave(existing, daysAfter(day1, 31))

    expect(period).toBe('month1')
  })

  it('returns highest newly achieved milestone only', () => {
    const existing = [makeEntry('c1', day1), makeEntry('c2', daysAfter(day1, 35))]

    const period = computeCheckinMilestonePeriodForSave(existing, daysAfter(day1, 95))

    expect(period).toBe('month3')
  })

  it('returns null if no new milestone is reached', () => {
    const existing = [makeEntry('c1', day1), makeEntry('c2', daysAfter(day1, 100))]

    const period = computeCheckinMilestonePeriodForSave(existing, daysAfter(day1, 110))

    expect(period).toBeNull()
  })

  it('returns month12 when jumping directly to one year', () => {
    const existing = [makeEntry('c1', day1), makeEntry('c2', daysAfter(day1, 20))]

    const period = computeCheckinMilestonePeriodForSave(existing, daysAfter(day1, 366))

    expect(period).toBe('month12')
  })
})
