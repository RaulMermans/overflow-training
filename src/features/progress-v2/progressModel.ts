import type { TranslationKey } from '../../i18n'
import { computeStartWeekMonday } from '../analytics/analyticsClient'
import { computeDelta } from '../analytics/analyticsService'
import type {
  Delta,
  ExerciseE1RMWeeklyRowDTO,
  ProgressOverviewModel,
  TrendPoint,
  WeeklyMuscleBalanceRowDTO,
  WeeklyStrengthVolumeRowDTO,
  WeeklyWorkoutsRowDTO,
  WeekPoint,
} from '../analytics/analyticsTypes'

export type TimeRange = '4W' | '3M' | '6M' | '1Y'
export type ProgressLens = 'overview' | 'strength' | 'body'
export type HeroStatus = 'onTrack' | 'building' | 'offPace'
export type CoachingTone = 'positive' | 'neutral' | 'warning'
export type BodyRegionKey = 'upperPush' | 'upperPull' | 'lowerBody' | 'core'

export const PROGRESS_RANGE_CONFIG: Record<TimeRange, { days: number; weeks: number }> = {
  '4W': { days: 28, weeks: 4 },
  '3M': { days: 84, weeks: 12 },
  '6M': { days: 168, weeks: 24 },
  '1Y': { days: 364, weeks: 52 },
}

const BODY_REGION_ORDER: BodyRegionKey[] = ['upperPush', 'upperPull', 'lowerBody', 'core']

export type ProgressHeroModel = {
  isEmpty: boolean
  status: HeroStatus
  weeklyGoal: number
  workoutsPerWeek: number
  delta: Delta
  trendSeries: WeekPoint[]
  summaryKey: TranslationKey
}

export type ProgressConsistencyModel = {
  isEmpty: boolean
  workoutsPerWeek: number
  minutesTrained: number
  delta: Delta
  weeklySeries: WeekPoint[]
  goalHitWeeks: number
  goalHitStreak: number
  activeWeekStreak: number
  bestWeekCount: number
  takeawayKey: TranslationKey
  takeawayParams?: Record<string, string | number>
}

export type StrengthTrendPoint = TrendPoint & { isPr: boolean }

export type ProgressStrengthModel = {
  isEmpty: boolean
  currentBestKg: number | null
  previousBestKg: number | null
  delta: Delta | null
  points: StrengthTrendPoint[]
  prCount: number
  takeawayKey: TranslationKey
}

export type BodyRegionEntry = {
  key: BodyRegionKey
  currentPct: number
  previousPct: number
  deltaPct: number
  currentVolumeKg: number
}

export type ProgressBodyModel = {
  isEmpty: boolean
  regions: BodyRegionEntry[]
  leadingRegion: BodyRegionEntry | null
  trailingRegion: BodyRegionEntry | null
  takeawayKey: TranslationKey
  takeawayParams?: Record<string, string | number>
}

export type ProgressCoachingInsight = {
  tone: CoachingTone
  bodyKey: TranslationKey
  bodyParams?: Record<string, string | number>
}

export type ProgressDashboardModel = {
  hero: ProgressHeroModel
  consistency: ProgressConsistencyModel
  strength: ProgressStrengthModel
  body: ProgressBodyModel
  coaching: ProgressCoachingInsight
  winsInput: {
    prsCount: number
    currentAverage: number
    previousAverage: number
    bestWeekCurrent: number
    bestWeekPrevious: number
    goalHitStreak: number
  }
}

type WorkoutComparisonSummary = {
  currentSeries: WeekPoint[]
  previousSeries: WeekPoint[]
  currentTotal: number
  previousTotal: number
  currentAverage: number
  previousAverage: number
  delta: Delta
  bestWeekCurrent: number
  bestWeekPrevious: number
  goalHitWeeks: number
  goalHitStreak: number
  activeWeekStreak: number
}

function addWeeks(isoMonday: string, offset: number): string {
  const date = new Date(`${isoMonday}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offset * 7)
  return date.toISOString().slice(0, 10)
}

function buildWeekWindow(startWeek: string, weekCount: number): string[] {
  return Array.from({ length: Math.max(weekCount, 0) }, (_, index) => addWeeks(startWeek, index))
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function countTrailing(series: WeekPoint[], predicate: (point: WeekPoint) => boolean): number {
  let count = 0
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (!predicate(series[index])) break
    count += 1
  }
  return count
}

function roundPct(value: number): number {
  return Math.round(value)
}

function normalizeWorkoutComparison(
  rows: WeeklyWorkoutsRowDTO[],
  range: TimeRange,
  weeklyGoal: number,
  now: Date = new Date(),
): WorkoutComparisonSummary {
  const { weeks } = PROGRESS_RANGE_CONFIG[range]
  const currentWeekStart = computeStartWeekMonday(1, now)
  const currentStart = addWeeks(currentWeekStart, -(weeks - 1))
  const previousStart = addWeeks(currentStart, -weeks)

  const workoutMap = new Map<string, number>()
  for (const row of rows) {
    workoutMap.set(row.week_start, row.workouts_completed)
  }

  const currentSeries = buildWeekWindow(currentStart, weeks).map((weekStart) => ({
    weekStart,
    value: workoutMap.get(weekStart) ?? 0,
    isFilled: !workoutMap.has(weekStart),
  }))
  const previousSeries = buildWeekWindow(previousStart, weeks).map((weekStart) => ({
    weekStart,
    value: workoutMap.get(weekStart) ?? 0,
    isFilled: !workoutMap.has(weekStart),
  }))

  const currentTotal = sum(currentSeries.map((point) => point.value))
  const previousTotal = sum(previousSeries.map((point) => point.value))
  const currentAverage = weeks > 0 ? currentTotal / weeks : 0
  const previousAverage = weeks > 0 ? previousTotal / weeks : 0
  const safeGoal = Math.max(weeklyGoal, 1)

  return {
    currentSeries,
    previousSeries,
    currentTotal,
    previousTotal,
    currentAverage,
    previousAverage,
    delta: computeDelta(currentAverage, previousAverage),
    bestWeekCurrent: Math.max(...currentSeries.map((point) => point.value), 0),
    bestWeekPrevious: Math.max(...previousSeries.map((point) => point.value), 0),
    goalHitWeeks: currentSeries.filter((point) => point.value >= safeGoal).length,
    goalHitStreak: countTrailing(currentSeries, (point) => point.value >= safeGoal),
    activeWeekStreak: countTrailing(currentSeries, (point) => point.value > 0),
  }
}

function buildHeroModel(
  overview: ProgressOverviewModel | null,
  workoutSummary: WorkoutComparisonSummary,
  weeklyGoal: number,
): ProgressHeroModel {
  if (!overview || overview.isEmpty || workoutSummary.currentTotal === 0) {
    return {
      isEmpty: true,
      status: 'building',
      weeklyGoal,
      workoutsPerWeek: 0,
      delta: computeDelta(0, 0),
      trendSeries: workoutSummary.currentSeries,
      summaryKey: 'progress.v2.hero.summary.empty',
    }
  }

  const safeGoal = Math.max(weeklyGoal, 1)
  const workoutsPerWeek = overview.workoutsPerWeek
  const goalRatio = workoutsPerWeek / safeGoal

  let status: HeroStatus = 'offPace'
  if (goalRatio >= 1) {
    status = 'onTrack'
  } else if (goalRatio >= 0.75 || workoutSummary.delta.abs > 0) {
    status = 'building'
  }

  let summaryKey: TranslationKey = 'progress.v2.hero.summary.offPace'
  if (status === 'onTrack' && workoutSummary.delta.abs > 0.15) {
    summaryKey = 'progress.v2.hero.summary.onTrackRising'
  } else if (status === 'onTrack') {
    summaryKey = 'progress.v2.hero.summary.onTrackSteady'
  } else if (status === 'building' && workoutSummary.previousTotal === 0) {
    summaryKey = 'progress.v2.hero.summary.buildingStart'
  } else if (status === 'building') {
    summaryKey = 'progress.v2.hero.summary.building'
  }

  return {
    isEmpty: false,
    status,
    weeklyGoal,
    workoutsPerWeek,
    delta: workoutSummary.delta,
    trendSeries: workoutSummary.currentSeries,
    summaryKey,
  }
}

function buildConsistencyModel(
  overview: ProgressOverviewModel | null,
  workoutSummary: WorkoutComparisonSummary,
): ProgressConsistencyModel {
  if (!overview || overview.isEmpty || workoutSummary.currentTotal === 0) {
    return {
      isEmpty: true,
      workoutsPerWeek: 0,
      minutesTrained: 0,
      delta: computeDelta(0, 0),
      weeklySeries: workoutSummary.currentSeries,
      goalHitWeeks: 0,
      goalHitStreak: 0,
      activeWeekStreak: 0,
      bestWeekCount: 0,
      takeawayKey: 'progress.v2.consistency.takeaway.empty',
    }
  }

  let takeawayKey: TranslationKey = 'progress.v2.consistency.takeaway.steady'
  let takeawayParams: Record<string, string | number> | undefined

  if (workoutSummary.goalHitWeeks > 0) {
    takeawayKey = 'progress.v2.consistency.takeaway.goalHits'
    takeawayParams = {
      hitWeeks: workoutSummary.goalHitWeeks,
      totalWeeks: workoutSummary.currentSeries.length,
    }
  } else if (workoutSummary.activeWeekStreak >= 2) {
    takeawayKey = 'progress.v2.consistency.takeaway.activeStreak'
    takeawayParams = { streak: workoutSummary.activeWeekStreak }
  } else if (workoutSummary.bestWeekCurrent > 0) {
    takeawayKey = 'progress.v2.consistency.takeaway.bestWeek'
    takeawayParams = { count: workoutSummary.bestWeekCurrent }
  }

  return {
    isEmpty: false,
    workoutsPerWeek: overview.workoutsPerWeek,
    minutesTrained: overview.minutesTrained,
    delta: workoutSummary.delta,
    weeklySeries: workoutSummary.currentSeries,
    goalHitWeeks: workoutSummary.goalHitWeeks,
    goalHitStreak: workoutSummary.goalHitStreak,
    activeWeekStreak: workoutSummary.activeWeekStreak,
    bestWeekCount: workoutSummary.bestWeekCurrent,
    takeawayKey,
    takeawayParams,
  }
}

function normalizeStrengthPoints(
  rows: ExerciseE1RMWeeklyRowDTO[],
  startWeek: string,
  weekCount: number,
): TrendPoint[] {
  const valueMap = new Map<string, number>()
  for (const row of rows) {
    valueMap.set(row.week_start, row.best_e1rm)
  }

  return buildWeekWindow(startWeek, weekCount).map((weekStart) => ({
    weekStart,
    value: valueMap.has(weekStart) ? (valueMap.get(weekStart) ?? null) : null,
    isFilled: !valueMap.has(weekStart),
  }))
}

function maxTrendValue(points: TrendPoint[]): number | null {
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null && Number.isFinite(value))
  if (values.length === 0) return null
  return Math.max(...values)
}

function buildStrengthModel(
  rows: ExerciseE1RMWeeklyRowDTO[],
  range: TimeRange,
  now: Date = new Date(),
): ProgressStrengthModel {
  const { weeks } = PROGRESS_RANGE_CONFIG[range]
  const currentWeekStart = computeStartWeekMonday(1, now)
  const currentStart = addWeeks(currentWeekStart, -(weeks - 1))
  const previousStart = addWeeks(currentStart, -weeks)

  const currentPoints = normalizeStrengthPoints(rows, currentStart, weeks)
  const previousPoints = normalizeStrengthPoints(rows, previousStart, weeks)
  const currentBestKg = maxTrendValue(currentPoints)
  const previousBestKg = maxTrendValue(previousPoints)

  if (currentBestKg === null) {
    return {
      isEmpty: true,
      currentBestKg: null,
      previousBestKg,
      delta: previousBestKg === null ? null : computeDelta(0, previousBestKg),
      points: currentPoints.map((point) => ({ ...point, isPr: false })),
      prCount: 0,
      takeawayKey: 'progress.v2.strength.takeaway.empty',
    }
  }

  let runningBest = -Infinity
  let prCount = 0
  const points = currentPoints.map((point) => {
    const isPr = point.value !== null && point.value > runningBest
    if (point.value !== null) {
      runningBest = Math.max(runningBest, point.value)
      if (isPr) prCount += 1
    }
    return { ...point, isPr }
  })

  const delta =
    previousBestKg === null
      ? computeDelta(currentBestKg, 0)
      : computeDelta(currentBestKg, previousBestKg)

  let takeawayKey: TranslationKey = 'progress.v2.strength.takeaway.flat'
  if (previousBestKg === null) {
    takeawayKey = 'progress.v2.strength.takeaway.firstTrend'
  } else if (delta.tone === 'up') {
    takeawayKey = 'progress.v2.strength.takeaway.up'
  } else if (delta.tone === 'down') {
    takeawayKey = 'progress.v2.strength.takeaway.down'
  }

  return {
    isEmpty: false,
    currentBestKg,
    previousBestKg,
    delta,
    points,
    prCount,
    takeawayKey,
  }
}

function bodyRegionForMuscle(muscleKey: string): BodyRegionKey {
  switch (muscleKey) {
    case 'chest':
    case 'shoulders':
    case 'triceps':
      return 'upperPush'
    case 'back':
    case 'lats':
    case 'upperBack':
    case 'biceps':
    case 'forearms':
      return 'upperPull'
    case 'quads':
    case 'hamstrings':
    case 'glutes':
    case 'calves':
      return 'lowerBody'
    default:
      return 'core'
  }
}

function aggregateBodyRegions(
  rows: WeeklyMuscleBalanceRowDTO[],
  startWeek: string,
  weekCount: number,
): Map<BodyRegionKey, number> {
  const allowedWeeks = new Set(buildWeekWindow(startWeek, weekCount))
  const totals = new Map<BodyRegionKey, number>()

  for (const row of rows) {
    if (!allowedWeeks.has(row.week_start)) continue
    const region = bodyRegionForMuscle(row.muscle_key)
    totals.set(region, (totals.get(region) ?? 0) + row.volume_kg)
  }

  return totals
}

function buildBodyModel(
  rows: WeeklyMuscleBalanceRowDTO[],
  range: TimeRange,
  now: Date = new Date(),
): ProgressBodyModel {
  const { weeks } = PROGRESS_RANGE_CONFIG[range]
  const currentWeekStart = computeStartWeekMonday(1, now)
  const currentStart = addWeeks(currentWeekStart, -(weeks - 1))
  const previousStart = addWeeks(currentStart, -weeks)
  const currentTotals = aggregateBodyRegions(rows, currentStart, weeks)
  const previousTotals = aggregateBodyRegions(rows, previousStart, weeks)
  const currentTotalVolume = sum([...currentTotals.values()])
  const previousTotalVolume = sum([...previousTotals.values()])

  if (currentTotalVolume <= 0) {
    return {
      isEmpty: true,
      regions: [],
      leadingRegion: null,
      trailingRegion: null,
      takeawayKey: 'progress.v2.body.takeaway.empty',
    }
  }

  const regions = BODY_REGION_ORDER.map((key) => {
    const currentVolumeKg = currentTotals.get(key) ?? 0
    const previousVolumeKg = previousTotals.get(key) ?? 0
    const currentPct =
      currentTotalVolume > 0 ? roundPct((currentVolumeKg / currentTotalVolume) * 100) : 0
    const previousPct =
      previousTotalVolume > 0 ? roundPct((previousVolumeKg / previousTotalVolume) * 100) : 0
    return {
      key,
      currentPct,
      previousPct,
      deltaPct: currentPct - previousPct,
      currentVolumeKg,
    }
  }).sort((left, right) => right.currentVolumeKg - left.currentVolumeKg)

  const leadingRegion = regions[0] ?? null
  const trailingRegion =
    [...regions].sort((left, right) => left.deltaPct - right.deltaPct)[0] ?? null

  let takeawayKey: TranslationKey = 'progress.v2.body.takeaway.balanced'
  let takeawayParams: Record<string, string | number> | undefined

  if (leadingRegion && leadingRegion.currentPct >= 55) {
    takeawayKey = 'progress.v2.body.takeaway.concentrated'
    takeawayParams = { region: leadingRegion.key, pct: leadingRegion.currentPct }
  } else if (trailingRegion && trailingRegion.deltaPct <= -8) {
    takeawayKey = 'progress.v2.body.takeaway.trailing'
    takeawayParams = { region: trailingRegion.key, pct: Math.abs(trailingRegion.deltaPct) }
  }

  return {
    isEmpty: false,
    regions,
    leadingRegion,
    trailingRegion,
    takeawayKey,
    takeawayParams,
  }
}

function buildCoachingInsight(
  hero: ProgressHeroModel,
  strength: ProgressStrengthModel,
  body: ProgressBodyModel,
  selectedExerciseName?: string | null,
): ProgressCoachingInsight {
  if (hero.isEmpty) {
    return {
      tone: 'neutral',
      bodyKey: 'progress.v2.coaching.empty',
    }
  }

  if (
    !body.isEmpty &&
    body.trailingRegion?.key === 'lowerBody' &&
    body.trailingRegion.deltaPct <= -8
  ) {
    return {
      tone: 'warning',
      bodyKey: 'progress.v2.coaching.lowerBody',
    }
  }

  if (!strength.isEmpty && strength.delta?.tone === 'up' && hero.status !== 'onTrack') {
    return {
      tone: 'positive',
      bodyKey: 'progress.v2.coaching.strengthVsConsistency',
      bodyParams: { lift: selectedExerciseName ?? 'This lift' },
    }
  }

  if (hero.status === 'offPace') {
    return {
      tone: 'warning',
      bodyKey: 'progress.v2.coaching.offPace',
    }
  }

  if (hero.status === 'building') {
    return {
      tone: 'positive',
      bodyKey: 'progress.v2.coaching.building',
    }
  }

  return {
    tone: 'neutral',
    bodyKey: 'progress.v2.coaching.steady',
  }
}

export function buildProgressDashboardModel(params: {
  range: TimeRange
  weeklyGoal: number
  overview: ProgressOverviewModel | null
  workoutRows: WeeklyWorkoutsRowDTO[]
  strengthRows: ExerciseE1RMWeeklyRowDTO[]
  muscleRows: WeeklyMuscleBalanceRowDTO[]
  selectedExerciseName?: string | null
  now?: Date
}): ProgressDashboardModel {
  const now = params.now ?? new Date()
  const workoutSummary = normalizeWorkoutComparison(
    params.workoutRows,
    params.range,
    params.weeklyGoal,
    now,
  )
  const hero = buildHeroModel(params.overview, workoutSummary, params.weeklyGoal)
  const consistency = buildConsistencyModel(params.overview, workoutSummary)
  const strength = buildStrengthModel(params.strengthRows, params.range, now)
  const body = buildBodyModel(params.muscleRows, params.range, now)
  const coaching = buildCoachingInsight(hero, strength, body, params.selectedExerciseName)

  return {
    hero,
    consistency,
    strength,
    body,
    coaching,
    winsInput: {
      prsCount: params.overview?.prsCount ?? 0,
      currentAverage: workoutSummary.currentAverage,
      previousAverage: workoutSummary.previousAverage,
      bestWeekCurrent: workoutSummary.bestWeekCurrent,
      bestWeekPrevious: workoutSummary.bestWeekPrevious,
      goalHitStreak: workoutSummary.goalHitStreak,
    },
  }
}

export function formatRegionDelta(deltaPct: number): string {
  if (deltaPct === 0) return '0'
  return `${deltaPct > 0 ? '+' : ''}${deltaPct}`
}

export function groupWeeklyVolumeRows(
  rows: WeeklyStrengthVolumeRowDTO[],
  range: TimeRange,
  now: Date = new Date(),
): {
  currentSeries: WeekPoint[]
  totalVolumeKg: number
  previousTotalVolumeKg: number
  delta: Delta
} {
  const { weeks } = PROGRESS_RANGE_CONFIG[range]
  const currentWeekStart = computeStartWeekMonday(1, now)
  const currentStart = addWeeks(currentWeekStart, -(weeks - 1))
  const previousStart = addWeeks(currentStart, -weeks)

  const volumeMap = new Map<string, number>()
  for (const row of rows) {
    volumeMap.set(row.week_start, row.volume_kg)
  }

  const currentSeries = buildWeekWindow(currentStart, weeks).map((weekStart) => ({
    weekStart,
    value: volumeMap.get(weekStart) ?? 0,
    isFilled: !volumeMap.has(weekStart),
  }))
  const previousSeries = buildWeekWindow(previousStart, weeks).map((weekStart) => ({
    weekStart,
    value: volumeMap.get(weekStart) ?? 0,
    isFilled: !volumeMap.has(weekStart),
  }))

  const totalVolumeKg = sum(currentSeries.map((point) => point.value))
  const previousTotalVolumeKg = sum(previousSeries.map((point) => point.value))

  return {
    currentSeries,
    totalVolumeKg,
    previousTotalVolumeKg,
    delta: computeDelta(totalVolumeKg, previousTotalVolumeKg),
  }
}
