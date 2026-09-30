import { computeE1RM } from '../progress/compute'
import type { UnitsPreference } from '../../lib/profilePreferences'
import { fromWeightKg, toWeightKg } from '../../lib/units'

export interface WorkoutShareSetInput {
  reps: number
  weight: number
  weightKg?: number | null
  isWeightCanonical?: boolean | null
}

export interface WorkoutShareExerciseInput {
  exerciseDefinitionId: string
  exerciseName: string
  sets: WorkoutShareSetInput[]
  previousBestE1rmKg?: number | null
}

export interface BuildWorkoutShareDataInput {
  workoutId: string
  title: string
  performedAt: string
  performedDateLabel?: string
  startedAt?: string | null
  endedAt?: string | null
  durationSeconds?: number | null
  streakDays?: number | null
  units: UnitsPreference
  exercises: WorkoutShareExerciseInput[]
}

export interface WorkoutShareTopLift {
  exerciseDefinitionId: string
  exerciseName: string
  reps: number
  weight: number
  e1rm: number
  isPR: boolean
}

export interface WorkoutShareData {
  workoutId: string
  title: string
  performedAt: string
  performedDateLabel: string
  durationSeconds: number
  totalVolume: number
  units: UnitsPreference
  streakDays: number | null
  exerciseCount: number
  setCount: number
  topLifts: WorkoutShareTopLift[]
}

export interface ShareFallbackCopy {
  durationLabel: string
  volumeLabel: string
  streakLabel: string
  topLiftsLabel: string
  prBadge: string
  noTopLiftsLabel: string
}

function formatNumeric(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(1).replace(/\.0$/, '')
}

function resolveDurationSeconds(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  explicitDurationSeconds: number | null | undefined,
): number {
  const explicitDuration = Number(explicitDurationSeconds)
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return Math.max(0, Math.round(explicitDuration))
  }

  if (!startedAt) return 0

  const started = new Date(startedAt).getTime()
  const ended = new Date(endedAt ?? startedAt).getTime()

  if (!Number.isFinite(started) || !Number.isFinite(ended)) {
    return 0
  }

  return Math.max(0, Math.floor((ended - started) / 1000))
}

function resolveSetWeightKg(set: WorkoutShareSetInput, units: UnitsPreference): number {
  if (set.isWeightCanonical && Number.isFinite(set.weightKg)) {
    return Number(set.weightKg)
  }

  if (Number.isFinite(set.weightKg)) {
    return Number(set.weightKg)
  }

  if (Number.isFinite(set.weight)) {
    return toWeightKg(Number(set.weight), units)
  }

  return 0
}

function resolveSetWeightDisplay(set: WorkoutShareSetInput, units: UnitsPreference): number {
  if (set.isWeightCanonical && Number.isFinite(set.weightKg)) {
    return fromWeightKg(Number(set.weightKg), units)
  }

  if (Number.isFinite(set.weight)) {
    return Number(set.weight)
  }

  if (Number.isFinite(set.weightKg)) {
    return fromWeightKg(Number(set.weightKg), units)
  }

  return 0
}

function formatDuration(durationSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(durationSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

export function buildWorkoutShareData(input: BuildWorkoutShareDataInput): WorkoutShareData {
  const durationSeconds = resolveDurationSeconds(
    input.startedAt,
    input.endedAt,
    input.durationSeconds,
  )

  const safeExercises = input.exercises.filter(
    (exercise) => exercise.exerciseName.trim().length > 0,
  )

  const setCount = safeExercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)

  const totalVolume = Math.round(
    safeExercises.reduce((exerciseTotal, exercise) => {
      const setsVolume = exercise.sets.reduce((setTotal, set) => {
        const reps = Number.isFinite(set.reps) ? Math.max(0, set.reps) : 0
        const displayWeight = resolveSetWeightDisplay(set, input.units)
        const volume = reps * displayWeight

        if (!Number.isFinite(volume) || volume <= 0) return setTotal
        return setTotal + volume
      }, 0)

      return exerciseTotal + setsVolume
    }, 0),
  )

  const topLifts = safeExercises
    .map((exercise): WorkoutShareTopLift | null => {
      if (exercise.sets.length === 0) return null

      const sortedSets = [...exercise.sets].sort((a, b) => {
        const aDisplayWeight = resolveSetWeightDisplay(a, input.units)
        const bDisplayWeight = resolveSetWeightDisplay(b, input.units)
        const aE1rm = computeE1RM(aDisplayWeight, a.reps)
        const bE1rm = computeE1RM(bDisplayWeight, b.reps)

        if (aE1rm !== bE1rm) return bE1rm - aE1rm
        if (aDisplayWeight !== bDisplayWeight) return bDisplayWeight - aDisplayWeight
        return b.reps - a.reps
      })

      const bestSet = sortedSets[0]
      const displayWeight = resolveSetWeightDisplay(bestSet, input.units)
      const e1rm = computeE1RM(displayWeight, bestSet.reps)
      if (!Number.isFinite(e1rm) || e1rm <= 0) return null

      const bestSetWeightKg = resolveSetWeightKg(bestSet, input.units)
      const e1rmKg = computeE1RM(bestSetWeightKg, bestSet.reps)
      const previousBestE1rmKg =
        Number.isFinite(exercise.previousBestE1rmKg) && exercise.previousBestE1rmKg
          ? Number(exercise.previousBestE1rmKg)
          : null

      return {
        exerciseDefinitionId: exercise.exerciseDefinitionId,
        exerciseName: exercise.exerciseName,
        reps: bestSet.reps,
        weight: Number.parseFloat(displayWeight.toFixed(1)),
        e1rm,
        isPR: previousBestE1rmKg !== null && Number.isFinite(e1rmKg) && e1rmKg > previousBestE1rmKg,
      }
    })
    .filter((lift): lift is WorkoutShareTopLift => lift !== null)
    .sort((a, b) => {
      if (a.e1rm !== b.e1rm) return b.e1rm - a.e1rm
      if (a.weight !== b.weight) return b.weight - a.weight
      if (a.reps !== b.reps) return b.reps - a.reps
      return a.exerciseName.localeCompare(b.exerciseName)
    })
    .slice(0, 3)

  return {
    workoutId: input.workoutId,
    title: input.title,
    performedAt: input.performedAt,
    performedDateLabel:
      input.performedDateLabel ?? new Date(input.performedAt).toLocaleDateString(),
    durationSeconds,
    totalVolume,
    units: input.units,
    streakDays:
      Number.isFinite(input.streakDays) && input.streakDays && input.streakDays > 0
        ? Math.floor(input.streakDays)
        : null,
    exerciseCount: safeExercises.length,
    setCount,
    topLifts,
  }
}

export function formatShareDuration(durationSeconds: number): string {
  return formatDuration(durationSeconds)
}

export function buildWorkoutShareFallbackText(
  data: WorkoutShareData,
  copy: ShareFallbackCopy,
): string {
  const lines = [
    data.title,
    data.performedDateLabel,
    `${copy.durationLabel}: ${formatDuration(data.durationSeconds)}`,
    `${copy.volumeLabel}: ${formatNumeric(data.totalVolume)} ${data.units}`,
  ]

  if (data.streakDays) {
    lines.push(`${copy.streakLabel}: ${data.streakDays}d`)
  }

  lines.push(`${copy.topLiftsLabel}:`)

  if (data.topLifts.length === 0) {
    lines.push(`- ${copy.noTopLiftsLabel}`)
  } else {
    for (const lift of data.topLifts) {
      lines.push(
        `- ${lift.exerciseName}: ${formatNumeric(lift.weight)} x ${lift.reps}${
          lift.isPR ? ` ${copy.prBadge}` : ''
        }`,
      )
    }
  }

  return lines.join('\n')
}
