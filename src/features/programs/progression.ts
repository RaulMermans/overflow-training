import type { UnitsPreference } from '../../lib/profilePreferences'
import { fromWeightKg, toWeightKg } from '../../lib/units'
import type { ProgramExerciseType } from '../../programs/types'

export const COMPOUND_INCREMENT_KG = 2.5
export const ACCESSORY_INCREMENT_KG = 1.25
export const KG_PLATE_INCREMENT = 1.25
export const LB_PLATE_INCREMENT = 2.5

interface LastPerformanceSetLike {
  reps: number
  weight: number
  weight_kg: number
  is_weight_canonical: boolean
  setIndex: number
}

interface LastPerformanceLike {
  sets: LastPerformanceSetLike[]
}

export interface ProgressionSuggestion {
  decision: 'increase' | 'hold' | 'reduce'
  completionRatio: number
  baseWeight: number
  suggestedWeight: number
  increment: number
}

interface ComputeProgressionSuggestionInput {
  lastPerformance: LastPerformanceLike | null
  targetSets: number
  targetReps: number
  exerciseType: ProgramExerciseType
  units: UnitsPreference
}

function roundToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0) {
    return 0
  }

  const rounded = Math.round(value / increment) * increment
  return Math.max(0, Number.parseFloat(rounded.toFixed(2)))
}

function resolveSetWeightKg(set: LastPerformanceSetLike, units: UnitsPreference): number {
  if (set.is_weight_canonical && Number.isFinite(set.weight_kg)) {
    return Number(set.weight_kg)
  }

  if (Number.isFinite(set.weight_kg)) {
    return Number(set.weight_kg)
  }

  if (Number.isFinite(set.weight)) {
    return toWeightKg(Number(set.weight), units)
  }

  return 0
}

function getIncrementKg(exerciseType: ProgramExerciseType): number {
  return exerciseType === 'compound' ? COMPOUND_INCREMENT_KG : ACCESSORY_INCREMENT_KG
}

function getDisplayPlateIncrement(units: UnitsPreference): number {
  return units === 'kg' ? KG_PLATE_INCREMENT : LB_PLATE_INCREMENT
}

export function computeProgressionSuggestion({
  lastPerformance,
  targetSets,
  targetReps,
  exerciseType,
  units,
}: ComputeProgressionSuggestionInput): ProgressionSuggestion | null {
  if (!lastPerformance || lastPerformance.sets.length === 0) return null
  if (!Number.isFinite(targetSets) || targetSets < 1) return null
  if (!Number.isFinite(targetReps) || targetReps < 1) return null

  const orderedSets = [...lastPerformance.sets].sort((a, b) => a.setIndex - b.setIndex)
  const consideredSets = orderedSets.slice(0, targetSets)
  const targetTotalReps = targetSets * targetReps

  const achievedReps = consideredSets.reduce((sum, set) => {
    const reps = Number.isFinite(set.reps) ? Math.max(0, set.reps) : 0
    return sum + Math.min(reps, targetReps)
  }, 0)

  const completionRatio = targetTotalReps > 0 ? achievedReps / targetTotalReps : 0

  const baseSet = consideredSets[consideredSets.length - 1] ?? orderedSets[orderedSets.length - 1]
  if (!baseSet) return null

  const baseWeightKg = resolveSetWeightKg(baseSet, units)
  if (!Number.isFinite(baseWeightKg) || baseWeightKg <= 0) return null

  const incrementKg = getIncrementKg(exerciseType)
  const decision: ProgressionSuggestion['decision'] =
    completionRatio >= 1 ? 'increase' : completionRatio >= 0.9 ? 'hold' : 'reduce'

  const adjustedWeightKg =
    decision === 'increase'
      ? baseWeightKg + incrementKg
      : decision === 'reduce'
        ? Math.max(0, baseWeightKg - incrementKg)
        : baseWeightKg

  const plateIncrement = getDisplayPlateIncrement(units)

  const baseWeight = roundToIncrement(fromWeightKg(baseWeightKg, units), plateIncrement)
  const suggestedWeight = roundToIncrement(fromWeightKg(adjustedWeightKg, units), plateIncrement)
  const increment = roundToIncrement(fromWeightKg(incrementKg, units), plateIncrement)

  return {
    decision,
    completionRatio: Number.parseFloat(completionRatio.toFixed(3)),
    baseWeight,
    suggestedWeight,
    increment,
  }
}
