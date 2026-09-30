import type { UnitsPreference } from '../../lib/profilePreferences'

/** Bounds for set entry validation (security and sanity). */
export const REPS_MIN = 1
export const REPS_MAX = 999
export const WEIGHT_MIN = 0
export const WEIGHT_MAX = 9999

export interface SetDraft {
  reps: string
  weight: string
}

interface LastSetLike {
  reps: number
  weight: number
}

export function getDefaultSetDraft(lastSet: LastSetLike | null | undefined): SetDraft {
  if (!lastSet) {
    return { reps: '', weight: '' }
  }

  return {
    reps: String(lastSet.reps),
    weight: String(lastSet.weight),
  }
}

export function applyRepIncrement(draft: SetDraft, increment = 1): SetDraft {
  const currentReps = Number.parseInt(draft.reps, 10)
  const nextReps =
    Number.isFinite(currentReps) && currentReps > 0 ? currentReps + increment : increment

  return {
    ...draft,
    reps: String(nextReps),
  }
}

export function applyRepDecrement(draft: SetDraft, decrement = 1): SetDraft {
  const currentReps = Number.parseInt(draft.reps, 10)
  const nextReps = Number.isFinite(currentReps)
    ? Math.max(REPS_MIN, currentReps - decrement)
    : REPS_MIN

  return {
    ...draft,
    reps: String(nextReps),
  }
}

export function applyWeightIncrement(draft: SetDraft, units: UnitsPreference): SetDraft {
  const currentWeight = Number.parseFloat(draft.weight)
  const step = units === 'kg' ? 2.5 : 5
  const nextWeight =
    Number.isFinite(currentWeight) && currentWeight >= 0 ? currentWeight + step : step

  return {
    ...draft,
    weight: String(Number.parseFloat(nextWeight.toFixed(1))),
  }
}

export function applyWeightDecrement(draft: SetDraft, units: UnitsPreference): SetDraft {
  const currentWeight = Number.parseFloat(draft.weight)
  const step = units === 'kg' ? 2.5 : 5
  const nextWeight = Number.isFinite(currentWeight)
    ? Math.max(WEIGHT_MIN, currentWeight - step)
    : WEIGHT_MIN

  return {
    ...draft,
    weight: String(Number.parseFloat(nextWeight.toFixed(1))),
  }
}

export function copyLastSet(draft: SetDraft, lastSet: LastSetLike | null | undefined): SetDraft {
  if (!lastSet) return draft
  return getDefaultSetDraft(lastSet)
}

export function canSubmitSetDraft(draft: SetDraft): boolean {
  const repsValue = Number.parseInt(draft.reps, 10)
  const weightValue = Number.parseFloat(draft.weight)
  return (
    Number.isFinite(repsValue) &&
    repsValue >= REPS_MIN &&
    repsValue <= REPS_MAX &&
    Number.isFinite(weightValue) &&
    weightValue >= WEIGHT_MIN &&
    weightValue <= WEIGHT_MAX
  )
}

export function getWeightIncrementLabel(units: UnitsPreference): string {
  return units === 'kg' ? '+2.5 kg' : '+5 lb'
}

export function getWeightDecrementLabel(units: UnitsPreference): string {
  return units === 'kg' ? '-2.5 kg' : '-5 lb'
}
