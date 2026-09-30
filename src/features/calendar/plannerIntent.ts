export interface CalendarPlannerIntentParams {
  dateKey?: string | string[]
  openPicker?: string | string[]
}

export interface CalendarPlannerIntent {
  targetDateKey: string
  openPicker: boolean
}

function firstParamValue(value?: string | string[]): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null
  }
  return typeof value === 'string' ? value : null
}

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false

  const [yearRaw, monthRaw, dayRaw] = value.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false
  }

  const candidate = new Date(Date.UTC(year, month - 1, day))
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() + 1 === month &&
    candidate.getUTCDate() === day
  )
}

export function resolveCalendarPlannerIntent(
  params: CalendarPlannerIntentParams,
  fallbackDateKey: string,
): CalendarPlannerIntent {
  const dateCandidate = firstParamValue(params.dateKey)
  const targetDateKey =
    dateCandidate && isValidDateKey(dateCandidate) ? dateCandidate : fallbackDateKey
  const openPicker = firstParamValue(params.openPicker) === '1'

  return {
    targetDateKey,
    openPicker,
  }
}

export function shouldAutoOpenPlanner(openPicker: boolean, hasHandledIntent: boolean): boolean {
  return openPicker && !hasHandledIntent
}
