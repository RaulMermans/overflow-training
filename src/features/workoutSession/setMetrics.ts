import type { UnitsPreference } from '../../lib/profilePreferences'

const M_PER_KM = 1000
const M_PER_MI = 1609.344

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function toFiniteNumber(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) return null
  return Number(value)
}

export function distanceUnitForPreference(units: UnitsPreference): 'km' | 'mi' {
  return units === 'kg' ? 'km' : 'mi'
}

export function parseDurationInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10)
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
  }

  const segments = trimmed.split(':').map((segment) => segment.trim())
  if (segments.some((segment) => segment.length === 0)) return null
  if (segments.length !== 2 && segments.length !== 3) return null
  if (!segments.every((segment) => /^\d+$/.test(segment))) return null

  if (segments.length === 2) {
    const [minutesRaw, secondsRaw] = segments
    const minutes = Number.parseInt(minutesRaw, 10)
    const seconds = Number.parseInt(secondsRaw, 10)
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
    if (minutes < 0 || seconds < 0 || seconds >= 60) return null
    return minutes * 60 + seconds
  }

  const [hoursRaw, minutesRaw, secondsRaw] = segments
  const hours = Number.parseInt(hoursRaw, 10)
  const minutes = Number.parseInt(minutesRaw, 10)
  const seconds = Number.parseInt(secondsRaw, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null
  }
  if (hours < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    return null
  }
  return hours * 3600 + minutes * 60 + seconds
}

export function formatDurationInput(secondsValue: number | null | undefined): string {
  const seconds = toFiniteNumber(secondsValue)
  if (seconds === null || seconds < 0) return ''

  const safeSeconds = Math.floor(seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainder = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(remainder)}`
  }

  return `${minutes}:${pad2(remainder)}`
}

export function formatDurationLabel(secondsValue: number | null | undefined): string {
  const formatted = formatDurationInput(secondsValue)
  return formatted || '0:00'
}

export function parseDistanceInput(value: string, units: UnitsPreference): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!trimmed) return null

  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return null

  const meters = units === 'kg' ? parsed * M_PER_KM : parsed * M_PER_MI
  return Number.isFinite(meters) ? Number(meters.toFixed(2)) : null
}

export function formatDistanceLabel(
  distanceM: number | null | undefined,
  units: UnitsPreference,
): string {
  const meters = toFiniteNumber(distanceM)
  if (meters === null || meters < 0) return '0'

  const distance = units === 'kg' ? meters / M_PER_KM : meters / M_PER_MI
  const rounded = Number(distance.toFixed(2))
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.?0+$/, '')
}

export function formatPaceLabel(
  distanceM: number | null | undefined,
  durationSeconds: number | null | undefined,
  units: UnitsPreference,
): string | null {
  const meters = toFiniteNumber(distanceM)
  const seconds = toFiniteNumber(durationSeconds)
  if (meters === null || meters <= 0 || seconds === null || seconds < 0) {
    return null
  }

  const distance = units === 'kg' ? meters / M_PER_KM : meters / M_PER_MI
  if (!Number.isFinite(distance) || distance <= 0) return null

  const secondsPerUnit = Math.floor(seconds / distance)
  const paceMinutes = Math.floor(secondsPerUnit / 60)
  const paceSeconds = secondsPerUnit % 60
  const unitLabel = distanceUnitForPreference(units)
  return `${paceMinutes}:${pad2(paceSeconds)}/${unitLabel}`
}
