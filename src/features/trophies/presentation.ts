import type { TrophyDefinition, TrophyTier } from './catalog'
import type { TrophyState } from './storage'

export type TrophyFilterOption = 'all' | TrophyTier

export interface TrophyPresentationState {
  isUnlocked: boolean
  isHiddenLocked: boolean
  isFocusedTier: boolean
  useSubtleTierAccents: boolean
  showCompletionChip: boolean
}

export function getTrophyPresentationState(
  def: TrophyDefinition,
  trophyState: TrophyState | null,
  activeFilter: TrophyFilterOption,
): TrophyPresentationState {
  const isUnlocked = Boolean(trophyState?.unlocked[def.id])
  const isHiddenLocked = def.hidden && !isUnlocked
  const isFocusedTier = activeFilter !== 'all' && activeFilter === def.tier
  const useSubtleTierAccents = activeFilter === 'all'

  return {
    isUnlocked,
    isHiddenLocked,
    isFocusedTier,
    useSubtleTierAccents,
    showCompletionChip: isUnlocked,
  }
}
