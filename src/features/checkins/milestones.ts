import type { CheckinEntry } from './storage'

export type CheckinMilestonePeriod = 'day1' | 'month1' | 'month3' | 'month6' | 'month12'

const DAY_MS = 24 * 60 * 60 * 1000

type TimedMilestone = Exclude<CheckinMilestonePeriod, 'day1'>

const TIMED_MILESTONES: Array<{ period: TimedMilestone; days: number }> = [
  { period: 'month1', days: 30 },
  { period: 'month3', days: 90 },
  { period: 'month6', days: 180 },
  { period: 'month12', days: 365 },
]

function toEpoch(value: string): number {
  const epoch = new Date(value).getTime()
  return Number.isFinite(epoch) ? epoch : NaN
}

function getHighestTimedMilestone(daysSinceFirst: number): TimedMilestone | null {
  let period: TimedMilestone | null = null

  for (const milestone of TIMED_MILESTONES) {
    if (daysSinceFirst >= milestone.days) {
      period = milestone.period
    }
  }

  return period
}

function getTimedRank(period: TimedMilestone | null): number {
  if (period === 'month1') return 1
  if (period === 'month3') return 2
  if (period === 'month6') return 3
  if (period === 'month12') return 4
  return 0
}

function getEarliestEpoch(entries: CheckinEntry[]): number {
  let earliest = NaN

  for (const entry of entries) {
    const epoch = toEpoch(entry.takenAtISO)
    if (!Number.isFinite(epoch)) continue

    if (!Number.isFinite(earliest) || epoch < earliest) {
      earliest = epoch
    }
  }

  return earliest
}

function getMaxDaysSinceFirst(entries: CheckinEntry[], firstEpoch: number): number {
  let maxDays = 0

  for (const entry of entries) {
    const epoch = toEpoch(entry.takenAtISO)
    if (!Number.isFinite(epoch)) continue

    const deltaDays = Math.floor((epoch - firstEpoch) / DAY_MS)
    if (deltaDays > maxDays) {
      maxDays = deltaDays
    }
  }

  return maxDays
}

export function computeCheckinMilestonePeriodForSave(
  existingEntries: CheckinEntry[],
  newEntryTakenAtISO: string,
): CheckinMilestonePeriod | null {
  if (!Array.isArray(existingEntries) || existingEntries.length === 0) {
    return 'day1'
  }

  const newEpoch = toEpoch(newEntryTakenAtISO)
  if (!Number.isFinite(newEpoch)) return null

  const firstEpoch = getEarliestEpoch(existingEntries)
  if (!Number.isFinite(firstEpoch)) return null

  const beforeMaxDays = getMaxDaysSinceFirst(existingEntries, firstEpoch)
  const afterMaxDays = Math.max(beforeMaxDays, Math.floor((newEpoch - firstEpoch) / DAY_MS))

  const beforePeriod = getHighestTimedMilestone(beforeMaxDays)
  const afterPeriod = getHighestTimedMilestone(afterMaxDays)

  if (!afterPeriod) return null

  return getTimedRank(afterPeriod) > getTimedRank(beforePeriod) ? afterPeriod : null
}
