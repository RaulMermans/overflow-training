import type { UnitsPreference } from './profilePreferences'

const LB_TO_KG = 0.45359237
const KG_TO_LB = 1 / LB_TO_KG
const WEIGHT_DISPLAY_PRECISION = 1
const WEIGHT_STORAGE_PRECISION = 6

type WeightValue = {
  weight?: number | null
  weight_kg?: number | null
  is_weight_canonical?: boolean | null
}

function formatNumericValue(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(1).replace(/\.0$/, '')
}

function roundTo(value: number, precision: number): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

export function normalizeUnitsLabel(units: UnitsPreference | string): UnitsPreference {
  return units === 'kg' ? 'kg' : 'lb'
}

export function toWeightKg(value: number, units: UnitsPreference | string): number {
  const normalizedUnits = normalizeUnitsLabel(units)
  if (!Number.isFinite(value)) return 0
  if (normalizedUnits === 'kg') {
    return roundTo(value, WEIGHT_STORAGE_PRECISION)
  }
  return roundTo(value * LB_TO_KG, WEIGHT_STORAGE_PRECISION)
}

export function fromWeightKg(valueKg: number, units: UnitsPreference | string): number {
  const normalizedUnits = normalizeUnitsLabel(units)
  if (!Number.isFinite(valueKg)) return 0
  if (normalizedUnits === 'kg') {
    return roundTo(valueKg, WEIGHT_DISPLAY_PRECISION)
  }
  return roundTo(valueKg * KG_TO_LB, WEIGHT_DISPLAY_PRECISION)
}

export function convertWeightBetweenUnits(
  value: number,
  fromUnits: UnitsPreference | string,
  toUnits: UnitsPreference | string,
): number {
  if (!Number.isFinite(value)) return 0
  const normalizedFromUnits = normalizeUnitsLabel(fromUnits)
  const normalizedToUnits = normalizeUnitsLabel(toUnits)
  if (normalizedFromUnits === normalizedToUnits) {
    return roundTo(value, WEIGHT_DISPLAY_PRECISION)
  }

  return fromWeightKg(toWeightKg(value, normalizedFromUnits), normalizedToUnits)
}

export function resolveDisplayWeight(value: WeightValue, units: UnitsPreference | string): number {
  if (value.is_weight_canonical === true && Number.isFinite(value.weight_kg)) {
    return fromWeightKg(Number(value.weight_kg), units)
  }

  if (Number.isFinite(value.weight)) {
    return roundTo(Number(value.weight), WEIGHT_DISPLAY_PRECISION)
  }

  if (Number.isFinite(value.weight_kg)) {
    return fromWeightKg(Number(value.weight_kg), units)
  }

  return 0
}

export function formatWeight(value: number, units: UnitsPreference | string): string {
  const normalizedUnits = normalizeUnitsLabel(units)
  return `${formatNumericValue(value)} ${normalizedUnits}`
}

export function formatSetSummary(
  reps: number,
  weight: number,
  units: UnitsPreference | string,
): string {
  return `${formatNumericValue(reps)} x ${formatWeight(weight, units)}`
}
