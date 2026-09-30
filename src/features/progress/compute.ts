import type { ProgressWorkout } from '../../db/progress'

export type ProgressWorkoutPoint = {
  id: string
  performedAt: string
  routineId?: string
}

export type ProgressSetPoint = {
  workoutId: string
  exerciseDefinitionId: string
  exerciseName: string
  reps: number
  weight: number
  performedAt: string
}

export type CurrentPR = {
  exerciseDefinitionId: string
  exerciseName: string
  reps: number
  weight: number
  e1rm: number
  performedAt: string
  workoutId: string
}

export type TrendingPoint = {
  exerciseDefinitionId: string
  exerciseName: string
  deltaPercent: number
  baselineE1RM: number
  currentE1RM: number
}

export type RoutineLiftSignal = {
  exerciseDefinitionId: string
  exerciseName: string
  last: { reps: number; weight: number; e1rm: number }
  best: { reps: number; weight: number; e1rm: number }
}

export type RoutineStats = {
  routineId: string
  sessions: number
  volume: number
  prsHit: number
  volumeTrendPercent: number
  keyLifts: RoutineLiftSignal[]
}

export type ProgressTrackingMode = 'weight_reps' | 'reps_only' | 'time' | 'distance_time'

export type ProgressCategory =
  | 'strength'
  | 'warmup'
  | 'stretch'
  | 'cardio'
  | 'mobility'
  | 'yoga'
  | 'pilates'
  | 'other'

export type ModeAwareSetPoint = {
  workoutId: string
  exerciseDefinitionId: string
  exerciseName: string
  category: ProgressCategory
  trackingMode: ProgressTrackingMode
  reps: number | null
  weightKg: number | null
  durationSeconds: number | null
  distanceM: number | null
  performedAt: string
}

export type StrengthModeStats = {
  sessions: number
  weeklySessions: number
  weeklyGoal: number
  totalVolumeKg: number
  volumeTrendPercent: number
}

export type CardioSessionSummary = {
  workoutId: string
  performedAt: string
  distanceM: number
  durationSeconds: number
  paceSecondsPerKm: number | null
}

export type CardioModeStats = {
  sessions: number
  totalDistanceM: number
  avgPaceSecondsPerKm: number | null
  distanceTrendPercent: number
  bestRecent: CardioSessionSummary[]
}

export type MobilitySessionSummary = {
  workoutId: string
  performedAt: string
  durationSeconds: number
}

export type MobilityModeStats = {
  sessions: number
  totalMinutes: number
  minutesPerWeek: number
  daysPracticed: number
  recentSessions: MobilitySessionSummary[]
}

// --- Helpers ---

/** Epley formula: estimated 1-rep max */
export function computeE1RM(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) {
    return 0
  }
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

function toLocalDate(iso: string): string {
  const d = new Date(iso)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toEpoch(iso: string): number {
  const epoch = new Date(iso).getTime()
  return Number.isFinite(epoch) ? epoch : 0
}

function isWithinRange(iso: string, startDate: string, endDate: string): boolean {
  const value = toEpoch(iso)
  const start = toEpoch(startDate)
  const end = toEpoch(endDate)
  return value >= start && value <= end
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function weekKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const day = date.getDay()
  const diffToMonday = (day + 6) % 7
  const monday = new Date(date)
  monday.setDate(date.getDate() - diffToMonday)
  monday.setHours(0, 0, 0, 0)

  return toLocalDate(monday.toISOString())
}

function compareProgressSets(a: ProgressSetPoint, b: ProgressSetPoint): number {
  const epochDiff = toEpoch(a.performedAt) - toEpoch(b.performedAt)
  if (epochDiff !== 0) return epochDiff

  const workoutDiff = a.workoutId.localeCompare(b.workoutId)
  if (workoutDiff !== 0) return workoutDiff

  const exerciseDiff = a.exerciseDefinitionId.localeCompare(b.exerciseDefinitionId)
  if (exerciseDiff !== 0) return exerciseDiff

  const weightDiff = a.weight - b.weight
  if (weightDiff !== 0) return weightDiff

  const repsDiff = a.reps - b.reps
  if (repsDiff !== 0) return repsDiff

  return a.exerciseName.localeCompare(b.exerciseName)
}

function computePREvents(sets: ProgressSetPoint[]): CurrentPR[] {
  const byTime = [...sets].sort(compareProgressSets)
  const bestByExercise = new Map<string, number>()
  const events: CurrentPR[] = []

  for (const set of byTime) {
    const e1rm = computeE1RM(set.weight, set.reps)
    if (e1rm <= 0) continue

    const currentBest = bestByExercise.get(set.exerciseDefinitionId) ?? 0
    if (e1rm > currentBest) {
      bestByExercise.set(set.exerciseDefinitionId, e1rm)
      events.push({
        exerciseDefinitionId: set.exerciseDefinitionId,
        exerciseName: set.exerciseName,
        reps: set.reps,
        weight: set.weight,
        e1rm,
        performedAt: set.performedAt,
        workoutId: set.workoutId,
      })
    }
  }

  return events
}

function volumeFromSets(sets: ProgressSetPoint[]): number {
  return Math.round(
    sets.reduce((total, set) => {
      const volume = Number(set.weight) * Number(set.reps)
      if (!Number.isFinite(volume) || volume <= 0) return total
      return total + volume
    }, 0),
  )
}

function normalizeTrackingMode(raw: string | null | undefined): ProgressTrackingMode {
  if (raw === 'weight_reps' || raw === 'reps_only' || raw === 'time' || raw === 'distance_time') {
    return raw
  }
  return 'weight_reps'
}

function normalizeCategory(raw: string | null | undefined): ProgressCategory {
  if (
    raw === 'strength' ||
    raw === 'warmup' ||
    raw === 'stretch' ||
    raw === 'cardio' ||
    raw === 'mobility' ||
    raw === 'yoga' ||
    raw === 'pilates' ||
    raw === 'other'
  ) {
    return raw
  }
  return 'strength'
}

function toPositiveNumber(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) return null
  const next = Number(value)
  return next > 0 ? next : null
}

function computeTrendPercent(values: number[]): number {
  if (values.length === 0) return 0

  const splitIndex = Math.floor(values.length / 2)
  const firstHalf = values.slice(0, splitIndex)
  const secondHalf = values.slice(splitIndex)

  const firstSum = firstHalf.reduce((sum, value) => sum + value, 0)
  const secondSum = secondHalf.reduce((sum, value) => sum + value, 0)

  if (firstSum <= 0) return secondSum > 0 ? 100 : 0
  return round(((secondSum - firstSum) / firstSum) * 100)
}

function sortWorkoutsByDate<T extends { performedAt: string }>(values: T[]): T[] {
  return [...values].sort((a, b) => toEpoch(a.performedAt) - toEpoch(b.performedAt))
}

export function buildModeAwareSetPoints(workouts: ProgressWorkout[]): ModeAwareSetPoint[] {
  const points: ModeAwareSetPoint[] = []

  for (const workout of workouts) {
    const workoutPerformedAt = workout.started_at ?? workout.ended_at ?? new Date(0).toISOString()

    for (const exercise of workout.workout_exercises) {
      const exerciseName = exercise.exercise_definitions?.name ?? 'Exercise'
      const category = normalizeCategory(exercise.exercise_definitions?.category)
      const trackingMode = normalizeTrackingMode(exercise.exercise_definitions?.tracking_mode)

      for (const set of exercise.workout_sets) {
        const weightKgRaw = Number.isFinite(set.weight_kg)
          ? Number(set.weight_kg)
          : Number.isFinite(set.weight)
            ? Number(set.weight)
            : null

        points.push({
          workoutId: workout.id,
          exerciseDefinitionId: exercise.exercise_definition_id,
          exerciseName,
          category,
          trackingMode,
          reps: Number.isFinite(set.reps) ? Number(set.reps) : null,
          weightKg: weightKgRaw,
          durationSeconds: Number.isFinite(set.duration_seconds)
            ? Number(set.duration_seconds)
            : null,
          distanceM: Number.isFinite(set.distance_m) ? Number(set.distance_m) : null,
          performedAt: set.created_at ?? workoutPerformedAt,
        })
      }
    }
  }

  return sortWorkoutsByDate(points)
}

export function computeStrengthModeStats(
  sets: ModeAwareSetPoint[],
  startDate: string,
  endDate: string,
  weeklyGoal: number = 3,
): StrengthModeStats {
  const strengthSets = sets.filter(
    (set) =>
      isWithinRange(set.performedAt, startDate, endDate) &&
      (set.trackingMode === 'weight_reps' || set.trackingMode === 'reps_only'),
  )

  const sessionIds = new Set(strengthSets.map((set) => set.workoutId))
  const weekStart = new Date(toEpoch(endDate) - 6 * 24 * 60 * 60 * 1000).toISOString()
  const weeklySessionIds = new Set(
    strengthSets
      .filter((set) => isWithinRange(set.performedAt, weekStart, endDate))
      .map((set) => set.workoutId),
  )

  const workoutVolumeMap = new Map<string, { performedAt: string; volume: number }>()
  for (const set of strengthSets) {
    if (set.trackingMode !== 'weight_reps') continue
    const reps = toPositiveNumber(set.reps)
    const weightKg = toPositiveNumber(set.weightKg)
    if (reps === null || weightKg === null) continue

    const current = workoutVolumeMap.get(set.workoutId) ?? {
      performedAt: set.performedAt,
      volume: 0,
    }
    if (toEpoch(set.performedAt) > toEpoch(current.performedAt)) {
      current.performedAt = set.performedAt
    }
    current.volume += weightKg * reps
    workoutVolumeMap.set(set.workoutId, current)
  }

  const sortedVolumes = sortWorkoutsByDate(Array.from(workoutVolumeMap.values()))
  const totalVolumeKg = Math.round(sortedVolumes.reduce((sum, workout) => sum + workout.volume, 0))

  return {
    sessions: sessionIds.size,
    weeklySessions: weeklySessionIds.size,
    weeklyGoal: Math.max(1, Math.round(weeklyGoal)),
    totalVolumeKg,
    volumeTrendPercent: computeTrendPercent(sortedVolumes.map((entry) => entry.volume)),
  }
}

export function computeCardioModeStats(
  sets: ModeAwareSetPoint[],
  startDate: string,
  endDate: string,
): CardioModeStats {
  const cardioSets = sets.filter(
    (set) =>
      isWithinRange(set.performedAt, startDate, endDate) && set.trackingMode === 'distance_time',
  )

  const sessionIds = new Set(cardioSets.map((set) => set.workoutId))
  const byWorkout = new Map<string, CardioSessionSummary>()

  for (const set of cardioSets) {
    const distanceM = toPositiveNumber(set.distanceM)
    const durationSeconds = toPositiveNumber(set.durationSeconds)
    if (distanceM === null || durationSeconds === null) continue

    const current = byWorkout.get(set.workoutId) ?? {
      workoutId: set.workoutId,
      performedAt: set.performedAt,
      distanceM: 0,
      durationSeconds: 0,
      paceSecondsPerKm: null,
    }

    if (toEpoch(set.performedAt) > toEpoch(current.performedAt)) {
      current.performedAt = set.performedAt
    }

    current.distanceM += distanceM
    current.durationSeconds += durationSeconds
    byWorkout.set(set.workoutId, current)
  }

  const summaries = sortWorkoutsByDate(Array.from(byWorkout.values())).map((entry) => ({
    ...entry,
    paceSecondsPerKm:
      entry.distanceM > 0 ? Math.round(entry.durationSeconds / (entry.distanceM / 1000)) : null,
  }))

  const totalDistanceM = Math.round(summaries.reduce((sum, summary) => sum + summary.distanceM, 0))
  const totalDurationSeconds = summaries.reduce((sum, summary) => sum + summary.durationSeconds, 0)

  const avgPaceSecondsPerKm =
    totalDistanceM > 0 ? Math.round(totalDurationSeconds / (totalDistanceM / 1000)) : null

  return {
    sessions: sessionIds.size,
    totalDistanceM,
    avgPaceSecondsPerKm,
    distanceTrendPercent: computeTrendPercent(summaries.map((summary) => summary.distanceM)),
    bestRecent: [...summaries]
      .sort((a, b) => {
        if (a.distanceM !== b.distanceM) return b.distanceM - a.distanceM
        return toEpoch(b.performedAt) - toEpoch(a.performedAt)
      })
      .slice(0, 3),
  }
}

export function computeMobilityModeStats(
  sets: ModeAwareSetPoint[],
  startDate: string,
  endDate: string,
): MobilityModeStats {
  const mobilitySets = sets.filter((set) => {
    if (!isWithinRange(set.performedAt, startDate, endDate)) return false
    if (set.trackingMode === 'time') return true
    return set.category === 'mobility' || set.category === 'yoga' || set.category === 'pilates'
  })

  const sessionIds = new Set(mobilitySets.map((set) => set.workoutId))
  const dayKeys = new Set(
    mobilitySets
      .map((set) => {
        const epoch = toEpoch(set.performedAt)
        return epoch > 0 ? toLocalDate(new Date(epoch).toISOString()) : ''
      })
      .filter((value) => value.length > 0),
  )

  const byWorkout = new Map<string, MobilitySessionSummary>()
  for (const set of mobilitySets) {
    const durationSeconds = toPositiveNumber(set.durationSeconds)
    if (durationSeconds === null) continue

    const current = byWorkout.get(set.workoutId) ?? {
      workoutId: set.workoutId,
      performedAt: set.performedAt,
      durationSeconds: 0,
    }
    if (toEpoch(set.performedAt) > toEpoch(current.performedAt)) {
      current.performedAt = set.performedAt
    }
    current.durationSeconds += durationSeconds
    byWorkout.set(set.workoutId, current)
  }

  const sessions = sortWorkoutsByDate(Array.from(byWorkout.values()))
  const totalMinutes = sessions.reduce((sum, session) => sum + session.durationSeconds, 0) / 60
  const rangeDays = Math.max(
    1,
    Math.round((toEpoch(endDate) - toEpoch(startDate)) / (24 * 60 * 60 * 1000)),
  )
  const weeks = Math.max(1, Math.ceil(rangeDays / 7))

  return {
    sessions: sessionIds.size,
    totalMinutes: round(totalMinutes),
    minutesPerWeek: round(totalMinutes / weeks),
    daysPracticed: dayKeys.size,
    recentSessions: [...sessions]
      .sort((a, b) => toEpoch(b.performedAt) - toEpoch(a.performedAt))
      .slice(0, 3),
  }
}

// --- New Pure APIs ---

export function computePeriodStats(
  workouts: ProgressWorkoutPoint[],
  sets: ProgressSetPoint[],
  startDate: string,
  endDate: string,
): { sessions: number; volume: number; prsHit: number; weeksActive: number } {
  const workoutsInPeriod = workouts.filter((workout) =>
    isWithinRange(workout.performedAt, startDate, endDate),
  )
  const workoutIds = new Set(workoutsInPeriod.map((workout) => workout.id))

  const setsInPeriod = sets.filter(
    (set) => workoutIds.has(set.workoutId) || isWithinRange(set.performedAt, startDate, endDate),
  )

  const prEvents = computePREvents(sets)
  const prsHit = prEvents.filter((event) =>
    isWithinRange(event.performedAt, startDate, endDate),
  ).length

  const weeks = new Set(
    workoutsInPeriod.map((workout) => weekKey(workout.performedAt)).filter((key) => key.length > 0),
  )

  return {
    sessions: workoutIds.size,
    volume: volumeFromSets(setsInPeriod),
    prsHit,
    weeksActive: weeks.size,
  }
}

export function computeCurrentPRs(sets: ProgressSetPoint[]): CurrentPR[] {
  const bestByExercise = new Map<string, CurrentPR>()

  for (const set of [...sets].sort(compareProgressSets)) {
    const e1rm = computeE1RM(set.weight, set.reps)
    if (e1rm <= 0) continue

    const current = bestByExercise.get(set.exerciseDefinitionId)
    const candidate: CurrentPR = {
      exerciseDefinitionId: set.exerciseDefinitionId,
      exerciseName: set.exerciseName,
      reps: set.reps,
      weight: set.weight,
      e1rm,
      performedAt: set.performedAt,
      workoutId: set.workoutId,
    }

    if (!current) {
      bestByExercise.set(set.exerciseDefinitionId, candidate)
      continue
    }

    if (candidate.e1rm > current.e1rm) {
      bestByExercise.set(set.exerciseDefinitionId, candidate)
      continue
    }

    if (candidate.e1rm === current.e1rm) {
      const candidateEpoch = toEpoch(candidate.performedAt)
      const currentEpoch = toEpoch(current.performedAt)

      if (candidateEpoch > currentEpoch) {
        bestByExercise.set(set.exerciseDefinitionId, candidate)
        continue
      }

      if (candidateEpoch === currentEpoch) {
        if (candidate.weight > current.weight) {
          bestByExercise.set(set.exerciseDefinitionId, candidate)
          continue
        }

        if (candidate.weight === current.weight && candidate.reps > current.reps) {
          bestByExercise.set(set.exerciseDefinitionId, candidate)
          continue
        }

        if (
          candidate.weight === current.weight &&
          candidate.reps === current.reps &&
          candidate.workoutId.localeCompare(current.workoutId) > 0
        ) {
          bestByExercise.set(set.exerciseDefinitionId, candidate)
        }
      }
    }
  }

  return Array.from(bestByExercise.values()).sort((a, b) => {
    if (a.e1rm !== b.e1rm) return b.e1rm - a.e1rm
    const nameDiff = a.exerciseName.localeCompare(b.exerciseName)
    if (nameDiff !== 0) return nameDiff
    return a.exerciseDefinitionId.localeCompare(b.exerciseDefinitionId)
  })
}

export function computeTrending(sets: ProgressSetPoint[], windowDays: number): TrendingPoint[] {
  if (!Number.isFinite(windowDays) || windowDays <= 0) return []
  if (sets.length === 0) return []

  const latestEpoch = Math.max(...sets.map((set) => toEpoch(set.performedAt)))
  const windowMs = Math.round(windowDays * 24 * 60 * 60 * 1000)
  const windowStart = latestEpoch - windowMs
  const midpoint = windowStart + Math.floor(windowMs / 2)

  const recentSets = sets.filter((set) => {
    const epoch = toEpoch(set.performedAt)
    return epoch >= windowStart && epoch <= latestEpoch
  })

  const grouped = new Map<string, ProgressSetPoint[]>()

  for (const set of recentSets) {
    const current = grouped.get(set.exerciseDefinitionId) ?? []
    current.push(set)
    grouped.set(set.exerciseDefinitionId, current)
  }

  const trends: TrendingPoint[] = []

  for (const [exerciseDefinitionId, exerciseSets] of grouped.entries()) {
    if (exerciseSets.length < 2) continue

    const firstHalf = exerciseSets.filter((set) => toEpoch(set.performedAt) < midpoint)
    const secondHalf = exerciseSets.filter((set) => toEpoch(set.performedAt) >= midpoint)

    if (firstHalf.length === 0 || secondHalf.length === 0) continue

    const baselineE1RM = Math.max(...firstHalf.map((set) => computeE1RM(set.weight, set.reps)))
    const currentE1RM = Math.max(...secondHalf.map((set) => computeE1RM(set.weight, set.reps)))

    if (baselineE1RM <= 0 || currentE1RM <= 0) continue

    const deltaPercent = round(((currentE1RM - baselineE1RM) / baselineE1RM) * 100)

    trends.push({
      exerciseDefinitionId,
      exerciseName: exerciseSets[0]?.exerciseName ?? 'Exercise',
      deltaPercent,
      baselineE1RM,
      currentE1RM,
    })
  }

  return trends.sort((a, b) => {
    if (a.deltaPercent !== b.deltaPercent) return b.deltaPercent - a.deltaPercent
    const nameDiff = a.exerciseName.localeCompare(b.exerciseName)
    if (nameDiff !== 0) return nameDiff
    return a.exerciseDefinitionId.localeCompare(b.exerciseDefinitionId)
  })
}

export function computeRoutineStats(
  routineId: string,
  workouts: ProgressWorkoutPoint[],
  sets: ProgressSetPoint[],
): RoutineStats {
  const routineWorkoutIds = new Set(
    workouts.filter((workout) => workout.routineId === routineId).map((workout) => workout.id),
  )

  const routineSets = sets.filter((set) => routineWorkoutIds.has(set.workoutId))
  const sessions = routineWorkoutIds.size
  const volume = volumeFromSets(routineSets)
  const prsHit = computePREvents(routineSets).length

  const workoutVolumes = workouts
    .filter((workout) => routineWorkoutIds.has(workout.id))
    .map((workout) => {
      const workoutSets = routineSets.filter((set) => set.workoutId === workout.id)
      return {
        id: workout.id,
        performedAt: workout.performedAt,
        volume: volumeFromSets(workoutSets),
      }
    })
    .sort((a, b) => toEpoch(a.performedAt) - toEpoch(b.performedAt))

  const splitIndex = Math.floor(workoutVolumes.length / 2)
  const firstHalf = workoutVolumes.slice(0, splitIndex)
  const secondHalf = workoutVolumes.slice(splitIndex)

  const firstHalfVolume = firstHalf.reduce((sum, workout) => sum + workout.volume, 0)
  const secondHalfVolume = secondHalf.reduce((sum, workout) => sum + workout.volume, 0)

  const volumeTrendPercent =
    firstHalfVolume <= 0
      ? secondHalfVolume > 0
        ? 100
        : 0
      : round(((secondHalfVolume - firstHalfVolume) / firstHalfVolume) * 100)

  const groupedByExercise = new Map<string, ProgressSetPoint[]>()
  for (const set of routineSets) {
    const bucket = groupedByExercise.get(set.exerciseDefinitionId) ?? []
    bucket.push(set)
    groupedByExercise.set(set.exerciseDefinitionId, bucket)
  }

  const keyLifts: RoutineLiftSignal[] = Array.from(groupedByExercise.entries())
    .map(([exerciseDefinitionId, exerciseSets]) => {
      const orderedSets = [...exerciseSets].sort(
        (a, b) => toEpoch(a.performedAt) - toEpoch(b.performedAt),
      )
      const lastSet = orderedSets[orderedSets.length - 1]
      const bestSet = orderedSets.reduce((best, candidate) => {
        const bestE1RM = computeE1RM(best.weight, best.reps)
        const candidateE1RM = computeE1RM(candidate.weight, candidate.reps)
        return candidateE1RM > bestE1RM ? candidate : best
      }, orderedSets[0])

      return {
        exerciseDefinitionId,
        exerciseName: lastSet.exerciseName,
        last: {
          reps: lastSet.reps,
          weight: lastSet.weight,
          e1rm: computeE1RM(lastSet.weight, lastSet.reps),
        },
        best: {
          reps: bestSet.reps,
          weight: bestSet.weight,
          e1rm: computeE1RM(bestSet.weight, bestSet.reps),
        },
      }
    })
    .sort((a, b) => {
      if (a.best.e1rm !== b.best.e1rm) return b.best.e1rm - a.best.e1rm
      const nameDiff = a.exerciseName.localeCompare(b.exerciseName)
      if (nameDiff !== 0) return nameDiff
      return a.exerciseDefinitionId.localeCompare(b.exerciseDefinitionId)
    })

  return {
    routineId,
    sessions,
    volume,
    prsHit,
    volumeTrendPercent,
    keyLifts,
  }
}

// --- Existing helpers kept for compatibility ---

/** Today's local YYYY-MM-DD */
function todayLocal(): string {
  return toLocalDate(new Date().toISOString())
}

/** Subtract N days from a YYYY-MM-DD string and return YYYY-MM-DD */
function subtractDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - n)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Short day label (Mon, Tue, …) from YYYY-MM-DD */
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}

/** Extract local date from a workout, using started_at with ended_at fallback */
function workoutDate(w: ProgressWorkout): string | null {
  const iso = w.started_at ?? w.ended_at
  return iso ? toLocalDate(iso) : null
}

/**
 * Sort nested arrays so computation is deterministic.
 * Mutates in place for efficiency, returns the same array.
 */
export function normalizeWorkouts(workouts: ProgressWorkout[]): ProgressWorkout[] {
  for (const w of workouts) {
    w.workout_exercises.sort((a, b) =>
      a.exercise_definition_id.localeCompare(b.exercise_definition_id),
    )
    for (const ex of w.workout_exercises) {
      ex.workout_sets.sort((a, b) => a.set_index - b.set_index)
    }
  }
  return workouts
}

/**
 * Current streak: consecutive days with a workout, ending at today or yesterday.
 * Returns 0 if no workout in the last 2 days.
 */
export function computeStreakAtDate(workouts: ProgressWorkout[], now: Date): number {
  if (workouts.length === 0) return 0

  const dates = new Set<string>()
  for (const w of workouts) {
    const d = workoutDate(w)
    if (d) dates.add(d)
  }

  if (dates.size === 0) return 0

  const safeNow = Number.isNaN(now.getTime()) ? new Date() : now
  const today = toLocalDate(safeNow.toISOString())
  const yesterday = subtractDays(today, 1)

  let start: string
  if (dates.has(today)) {
    start = today
  } else if (dates.has(yesterday)) {
    start = yesterday
  } else {
    return 0
  }

  let streak = 0
  let current = start
  while (dates.has(current)) {
    streak++
    current = subtractDays(current, 1)
  }

  return streak
}

/**
 * Current streak wrapper that uses local "now".
 * Keep this signature stable for existing callsites.
 */
export function computeStreak(workouts: ProgressWorkout[]): number {
  return computeStreakAtDate(workouts, new Date())
}

/**
 * Weekly volume: sum of (weight × reps) for each of the last 7 days.
 * Always returns exactly 7 entries, oldest first.
 */
export function computeWeeklyVolume(workouts: ProgressWorkout[]): {
  total: number
  byDay: { label: string; volume: number }[]
} {
  const today = todayLocal()

  const buckets: { dateStr: string; label: string; volume: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const dateStr = subtractDays(today, i)
    buckets.push({ dateStr, label: dayLabel(dateStr), volume: 0 })
  }

  const dateIndex = new Map<string, number>()
  buckets.forEach((b, i) => dateIndex.set(b.dateStr, i))

  for (const w of workouts) {
    const d = workoutDate(w)
    if (!d) continue
    const idx = dateIndex.get(d)
    if (idx === undefined) continue

    for (const ex of w.workout_exercises) {
      for (const s of ex.workout_sets) {
        const vol = Number(s.weight) * Number(s.reps)
        if (Number.isFinite(vol) && vol > 0) {
          buckets[idx].volume += vol
        }
      }
    }
  }

  const total = buckets.reduce((sum, b) => sum + b.volume, 0)
  const byDay = buckets.map((b) => ({
    label: b.label,
    volume: Math.round(b.volume),
  }))

  return { total: Math.round(total), byDay }
}

/**
 * Exercise PRs: best e1RM per exercise across all workouts.
 */
export function computeExercisePRs(workouts: ProgressWorkout[]): {
  exerciseId: string
  exerciseName: string
  weight: number
  reps: number
  e1rm: number
}[] {
  const best = new Map<
    string,
    {
      exerciseId: string
      exerciseName: string
      weight: number
      reps: number
      e1rm: number
    }
  >()

  for (const w of workouts) {
    for (const ex of w.workout_exercises) {
      if (!ex.exercise_definitions) continue

      const id = ex.exercise_definition_id
      const name = ex.exercise_definitions.name

      for (const s of ex.workout_sets) {
        const e1rm = computeE1RM(Number(s.weight), Number(s.reps))
        if (e1rm <= 0) continue

        const current = best.get(id)
        if (!current || e1rm > current.e1rm) {
          best.set(id, {
            exerciseId: id,
            exerciseName: name,
            weight: s.weight ?? 0,
            reps: s.reps ?? 0,
            e1rm,
          })
        }
      }
    }
  }

  return Array.from(best.values()).sort((a, b) => b.e1rm - a.e1rm)
}
