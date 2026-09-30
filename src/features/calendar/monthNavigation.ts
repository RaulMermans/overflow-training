export function toMonthStartDateKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`
}

export function addMonthsToDateKey(dateKey: string, monthDelta: number): string {
  const date = new Date(`${toMonthStartDateKey(dateKey)}T12:00:00`)
  date.setMonth(date.getMonth() + monthDelta)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}
