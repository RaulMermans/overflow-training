import type { TranslationKey } from '../../i18n'

export type WinId = 'prs' | 'bestWeek' | 'goalStreak' | 'comeback'
export type WinVariant = 'positive' | 'neutral'

export type WinTextRef = {
  key: TranslationKey
  params?: Record<string, string | number>
}

export type ProgressWin = {
  id: WinId
  title: WinTextRef
  body: WinTextRef
  variant: WinVariant
  icon: 'trophy' | 'trend' | 'consistency' | 'return'
}

export type ProgressWinsViewModel = {
  wins: ProgressWin[]
}

export type BuildProgressWinsInput = {
  prsCount?: number | null
  currentAverage?: number
  previousAverage?: number
  bestWeekCurrent?: number
  bestWeekPrevious?: number
  goalHitStreak?: number
}

const MAX_WINS = 3

function buildPrWin(prsCount?: number | null): ProgressWin | null {
  if (!Number.isFinite(prsCount) || !prsCount || prsCount <= 0) return null

  return {
    id: 'prs',
    icon: 'trophy',
    variant: 'positive',
    title: { key: 'progress.v2.wins.prs.title' },
    body: {
      key: prsCount === 1 ? 'progress.v2.wins.prs.bodySingle' : 'progress.v2.wins.prs.bodyPlural',
      params: { count: prsCount },
    },
  }
}

function buildBestWeekWin(bestWeekCurrent?: number, bestWeekPrevious?: number): ProgressWin | null {
  if (!Number.isFinite(bestWeekCurrent) || !bestWeekCurrent || bestWeekCurrent <= 0) return null
  if (!Number.isFinite(bestWeekPrevious)) return null
  if (bestWeekCurrent <= (bestWeekPrevious ?? 0)) return null

  return {
    id: 'bestWeek',
    icon: 'trend',
    variant: 'positive',
    title: { key: 'progress.v2.wins.bestWeek.title' },
    body: {
      key: 'progress.v2.wins.bestWeek.body',
      params: {
        count: bestWeekCurrent,
      },
    },
  }
}

function buildGoalStreakWin(goalHitStreak?: number): ProgressWin | null {
  if (!Number.isFinite(goalHitStreak) || !goalHitStreak || goalHitStreak < 2) return null

  return {
    id: 'goalStreak',
    icon: 'consistency',
    variant: 'positive',
    title: { key: 'progress.v2.wins.goalStreak.title' },
    body: {
      key:
        goalHitStreak === 2
          ? 'progress.v2.wins.goalStreak.bodyShort'
          : 'progress.v2.wins.goalStreak.body',
      params: { count: goalHitStreak },
    },
  }
}

function buildComebackWin(currentAverage?: number, previousAverage?: number): ProgressWin | null {
  if (!Number.isFinite(currentAverage) || currentAverage === undefined || currentAverage <= 0) {
    return null
  }
  if (!Number.isFinite(previousAverage) || previousAverage === undefined || previousAverage > 0)
    return null

  return {
    id: 'comeback',
    icon: 'return',
    variant: 'neutral',
    title: { key: 'progress.v2.wins.comeback.title' },
    body: { key: 'progress.v2.wins.comeback.body' },
  }
}

function sortWins(wins: ProgressWin[]): ProgressWin[] {
  const order: Record<WinId, number> = {
    prs: 0,
    bestWeek: 1,
    goalStreak: 2,
    comeback: 3,
  }

  return [...wins].sort((left, right) => order[left.id] - order[right.id])
}

export function buildProgressWins(input: BuildProgressWinsInput): ProgressWinsViewModel {
  const wins: ProgressWin[] = []

  const prWin = buildPrWin(input.prsCount)
  if (prWin) wins.push(prWin)

  const bestWeekWin = buildBestWeekWin(input.bestWeekCurrent, input.bestWeekPrevious)
  if (bestWeekWin) wins.push(bestWeekWin)

  const goalStreakWin = buildGoalStreakWin(input.goalHitStreak)
  if (goalStreakWin) wins.push(goalStreakWin)

  const comebackWin = buildComebackWin(input.currentAverage, input.previousAverage)
  if (comebackWin) wins.push(comebackWin)

  return {
    wins: sortWins(wins).slice(0, MAX_WINS),
  }
}
