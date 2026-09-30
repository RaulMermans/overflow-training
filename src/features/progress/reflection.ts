export type ReflectionStatus = 'improving' | 'stable' | 'needsAttention'

export interface ReflectionInput {
  prDeltas: Array<number | null>
  currentWeeklyVolume: number
  previousWeeklyVolume: number
}

export interface ReflectionSummary {
  status: ReflectionStatus
  improvingCount: number
  decliningCount: number
  unchangedCount: number
  volumeDeltaPercent: number
  volumeTrend: 'up' | 'down' | 'flat'
  headline: string
  detail: string
}

const IMPROVING_THRESHOLD = 5
const DECLINING_THRESHOLD = -5

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10
}

export function computeVolumeDeltaPercent(current: number, previous: number): number {
  const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0
  const safePrevious = Number.isFinite(previous) ? Math.max(0, previous) : 0

  if (safePrevious === 0) {
    return safeCurrent > 0 ? 100 : 0
  }

  return roundPercent(((safeCurrent - safePrevious) / safePrevious) * 100)
}

export function summarizeReflection(input: ReflectionInput): ReflectionSummary {
  const improvingCount = input.prDeltas.filter(
    (delta) => typeof delta === 'number' && delta > 0,
  ).length
  const decliningCount = input.prDeltas.filter(
    (delta) => typeof delta === 'number' && delta < 0,
  ).length
  const unchangedCount = input.prDeltas.filter((delta) => delta === null || delta === 0).length

  const volumeDeltaPercent = computeVolumeDeltaPercent(
    input.currentWeeklyVolume,
    input.previousWeeklyVolume,
  )

  let volumeTrend: 'up' | 'down' | 'flat' = 'flat'
  if (volumeDeltaPercent >= IMPROVING_THRESHOLD) volumeTrend = 'up'
  if (volumeDeltaPercent <= DECLINING_THRESHOLD) volumeTrend = 'down'

  let status: ReflectionStatus = 'stable'

  if (improvingCount > decliningCount || volumeTrend === 'up') {
    status = 'improving'
  } else if (decliningCount > improvingCount && volumeTrend === 'down') {
    status = 'needsAttention'
  }

  const headlineByStatus: Record<ReflectionStatus, string> = {
    improving: 'Improving',
    stable: 'Stable',
    needsAttention: 'Needs attention',
  }

  const detail = `${improvingCount} up, ${decliningCount} down, ${unchangedCount} unchanged · volume ${volumeDeltaPercent}%`

  return {
    status,
    improvingCount,
    decliningCount,
    unchangedCount,
    volumeDeltaPercent,
    volumeTrend,
    headline: headlineByStatus[status],
    detail,
  }
}
