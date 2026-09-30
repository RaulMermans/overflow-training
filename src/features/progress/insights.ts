import { computeE1RM, type ModeAwareSetPoint } from './compute'

export type MostImprovedExercise = {
  exerciseDefinitionId: string
  exerciseName: string
  trackingMode: 'weight_reps' | 'reps_only'
  baseline: number
  current: number
  deltaPercent: number
}

function toEpoch(value: string): number {
  const epoch = new Date(value).getTime()
  return Number.isFinite(epoch) ? epoch : 0
}

function isWithinRange(value: string, fromISO: string, toISO: string): boolean {
  const epoch = toEpoch(value)
  const from = toEpoch(fromISO)
  const to = toEpoch(toISO)
  return epoch >= from && epoch <= to
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function toStrengthMetric(set: ModeAwareSetPoint): number | null {
  if (set.trackingMode === 'weight_reps') {
    const reps = Number.isFinite(set.reps) && set.reps ? Number(set.reps) : 0
    const weightKg = Number.isFinite(set.weightKg) && set.weightKg ? Number(set.weightKg) : 0
    const e1rm = computeE1RM(weightKg, reps)
    return e1rm > 0 ? e1rm : null
  }

  if (set.trackingMode === 'reps_only') {
    const reps = Number.isFinite(set.reps) && set.reps ? Number(set.reps) : 0
    return reps > 0 ? reps : null
  }

  return null
}

export function computeMostImprovedExercises(
  sets: ModeAwareSetPoint[],
  fromISO: string,
  toISO: string,
  limit: number = 3,
): MostImprovedExercise[] {
  if (sets.length === 0) return []

  const midpoint = toEpoch(fromISO) + Math.floor((toEpoch(toISO) - toEpoch(fromISO)) / 2)

  const grouped = new Map<
    string,
    {
      exerciseDefinitionId: string
      exerciseName: string
      trackingMode: 'weight_reps' | 'reps_only'
      firstHalf: number[]
      secondHalf: number[]
    }
  >()

  for (const set of sets) {
    if (!isWithinRange(set.performedAt, fromISO, toISO)) continue
    if (set.trackingMode !== 'weight_reps' && set.trackingMode !== 'reps_only') continue

    const metric = toStrengthMetric(set)
    if (metric === null) continue

    const key = set.exerciseDefinitionId
    const current = grouped.get(key) ?? {
      exerciseDefinitionId: key,
      exerciseName: set.exerciseName,
      trackingMode: set.trackingMode,
      firstHalf: [],
      secondHalf: [],
    }

    if (toEpoch(set.performedAt) < midpoint) {
      current.firstHalf.push(metric)
    } else {
      current.secondHalf.push(metric)
    }

    grouped.set(key, current)
  }

  return Array.from(grouped.values())
    .map((entry) => {
      const baseline = entry.firstHalf.length > 0 ? Math.max(...entry.firstHalf) : 0
      const current = entry.secondHalf.length > 0 ? Math.max(...entry.secondHalf) : 0

      if (baseline <= 0 || current <= baseline) return null

      return {
        exerciseDefinitionId: entry.exerciseDefinitionId,
        exerciseName: entry.exerciseName,
        trackingMode: entry.trackingMode,
        baseline: round(baseline),
        current: round(current),
        deltaPercent: round(((current - baseline) / baseline) * 100),
      } as MostImprovedExercise
    })
    .filter((entry): entry is MostImprovedExercise => Boolean(entry))
    .sort((a, b) => {
      if (a.deltaPercent !== b.deltaPercent) return b.deltaPercent - a.deltaPercent
      const nameDiff = a.exerciseName.localeCompare(b.exerciseName)
      if (nameDiff !== 0) return nameDiff
      return a.exerciseDefinitionId.localeCompare(b.exerciseDefinitionId)
    })
    .slice(0, Math.max(1, limit))
}
