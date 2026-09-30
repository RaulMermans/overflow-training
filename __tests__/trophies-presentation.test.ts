import { TROPHY_CATALOG } from '../src/features/trophies/catalog'
import { getTrophyPresentationState } from '../src/features/trophies/presentation'
import type { TrophyState } from '../src/features/trophies/storage'
import en from '../src/i18n/translations/en'
import es from '../src/i18n/translations/es'

function buildState(unlockedIds: string[] = []): TrophyState {
  const unlocked: TrophyState['unlocked'] = {}
  unlockedIds.forEach((id) => {
    unlocked[id] = { unlockedAt: '2026-02-23T12:00:00.000Z' }
  })

  return {
    version: 1,
    unlocked,
    counters: {
      totalWorkouts: 0,
      activeDaysTotal: 0,
      recentActiveDays: [],
      currentStreak: 0,
      longestStreak: 0,
      totalPRs: 0,
      totalRoutinesCreated: 0,
      totalFavoritesAdded: 0,
      totalVolumeKg: 0,
    },
    lastUpdatedAt: '2026-02-23T12:00:00.000Z',
  }
}

function trophyById(id: string) {
  const found = TROPHY_CATALOG.find((definition) => definition.id === id)
  if (!found) {
    throw new Error(`Expected trophy ${id} in catalog`)
  }
  return found
}

describe('trophies presentation state mapping', () => {
  it('maps unlocked focused tier state', () => {
    const state = buildState(['workouts_365'])
    const result = getTrophyPresentationState(trophyById('workouts_365'), state, 'gold')

    expect(result).toEqual({
      isUnlocked: true,
      isHiddenLocked: false,
      isFocusedTier: true,
      useSubtleTierAccents: false,
      showCompletionChip: true,
    })
  })

  it('maps unlocked all-filter state as subtle per-tier', () => {
    const state = buildState(['workouts_365'])
    const result = getTrophyPresentationState(trophyById('workouts_365'), state, 'all')

    expect(result.isUnlocked).toBe(true)
    expect(result.isFocusedTier).toBe(false)
    expect(result.useSubtleTierAccents).toBe(true)
    expect(result.showCompletionChip).toBe(true)
  })

  it('maps locked visible state', () => {
    const state = buildState()
    const result = getTrophyPresentationState(trophyById('workouts_365'), state, 'gold')

    expect(result).toEqual({
      isUnlocked: false,
      isHiddenLocked: false,
      isFocusedTier: true,
      useSubtleTierAccents: false,
      showCompletionChip: false,
    })
  })

  it('maps hidden locked diamond state', () => {
    const state = buildState()
    const result = getTrophyPresentationState(trophyById('workouts_500'), state, 'diamond')

    expect(result).toEqual({
      isUnlocked: false,
      isHiddenLocked: true,
      isFocusedTier: true,
      useSubtleTierAccents: false,
      showCompletionChip: false,
    })
  })
})

describe('trophies hero/completed localization keys', () => {
  const requiredKeys = [
    'trophies.hero.bronze.title',
    'trophies.hero.bronze.body',
    'trophies.hero.silver.title',
    'trophies.hero.silver.body',
    'trophies.hero.gold.title',
    'trophies.hero.gold.body',
    'trophies.completedBadge',
  ] as const

  it('has all required keys in english and spanish', () => {
    requiredKeys.forEach((key) => {
      expect(typeof en[key]).toBe('string')
      expect(en[key].length).toBeGreaterThan(0)

      expect(typeof es[key]).toBe('string')
      expect(es[key].length).toBeGreaterThan(0)
    })
  })
})
