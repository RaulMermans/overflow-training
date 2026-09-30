import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../theme/tokens'
import type { TranslationKey } from '../../i18n'

// ── Archetype identity system ──────────────────────────────────────────────
//
// 10 expressive training personality archetypes.
// Stable string IDs are stored in user preferences (never use display labels).
// Color values: fgColor references colors.* tokens (no hex literals here).
//               bgColor / borderColor use rgba() derived from the token palette.
// To add a new archetype: append to ARCHETYPES array. No other structural change.

export type ArchetypeId =
  | 'strategist'
  | 'stoic'
  | 'builder'
  | 'competitor'
  | 'minimalist'
  | 'disciplined'
  | 'explorer'
  | 'technician'
  | 'beast'
  | 'comeback'

export interface ArchetypeDefinition {
  id: ArchetypeId
  /** Ionicons outline glyph name */
  icon: keyof typeof Ionicons.glyphMap
  /** Muted fill for the icon container */
  bgColor: string
  /** Icon foreground — references a token value */
  fgColor: string
  /** Border color for selected/hover states */
  borderColor: string
  nameKey: TranslationKey
  taglineKey: TranslationKey
}

export const ARCHETYPES: ArchetypeDefinition[] = [
  {
    id: 'strategist',
    icon: 'analytics-outline',
    bgColor: colors.accent.primaryMuted,
    fgColor: colors.accent.primary,
    borderColor: 'rgba(129, 62, 58, 0.38)',
    nameKey: 'identity.strategist.name',
    taglineKey: 'identity.strategist.tagline',
  },
  {
    id: 'stoic',
    icon: 'shield-outline',
    bgColor: 'rgba(74, 74, 74, 0.10)',
    fgColor: colors.text.secondary,
    borderColor: 'rgba(74, 74, 74, 0.30)',
    nameKey: 'identity.stoic.name',
    taglineKey: 'identity.stoic.tagline',
  },
  {
    id: 'builder',
    icon: 'construct-outline',
    bgColor: colors.tier.bronzeMuted,
    fgColor: colors.tier.bronze,
    borderColor: 'rgba(169, 113, 66, 0.36)',
    nameKey: 'identity.builder.name',
    taglineKey: 'identity.builder.tagline',
  },
  {
    id: 'competitor',
    icon: 'trophy-outline',
    bgColor: colors.accent.secondaryMuted,
    fgColor: colors.accent.secondary,
    borderColor: 'rgba(181, 147, 69, 0.40)',
    nameKey: 'identity.competitor.name',
    taglineKey: 'identity.competitor.tagline',
  },
  {
    id: 'minimalist',
    icon: 'remove-circle-outline',
    bgColor: 'rgba(128, 128, 128, 0.10)',
    fgColor: colors.text.muted,
    borderColor: 'rgba(128, 128, 128, 0.28)',
    nameKey: 'identity.minimalist.name',
    taglineKey: 'identity.minimalist.tagline',
  },
  {
    id: 'disciplined',
    icon: 'timer-outline',
    bgColor: colors.accent.tertiaryMuted,
    fgColor: colors.accent.tertiary,
    borderColor: 'rgba(158, 108, 110, 0.36)',
    nameKey: 'identity.disciplined.name',
    taglineKey: 'identity.disciplined.tagline',
  },
  {
    id: 'explorer',
    icon: 'compass-outline',
    bgColor: 'rgba(201, 168, 76, 0.14)',
    fgColor: colors.accent.celebration,
    borderColor: 'rgba(201, 168, 76, 0.36)',
    nameKey: 'identity.explorer.name',
    taglineKey: 'identity.explorer.tagline',
  },
  {
    id: 'technician',
    icon: 'hardware-chip-outline',
    bgColor: colors.tier.silverMuted,
    fgColor: colors.tier.silver,
    borderColor: 'rgba(118, 118, 118, 0.32)',
    nameKey: 'identity.technician.name',
    taglineKey: 'identity.technician.tagline',
  },
  {
    id: 'beast',
    icon: 'flame-outline',
    bgColor: 'rgba(129, 62, 58, 0.20)',
    fgColor: colors.accent.primary,
    borderColor: 'rgba(129, 62, 58, 0.44)',
    nameKey: 'identity.beast.name',
    taglineKey: 'identity.beast.tagline',
  },
  {
    id: 'comeback',
    icon: 'arrow-up-circle-outline',
    bgColor: colors.semantic.successMuted,
    fgColor: colors.semantic.success,
    borderColor: 'rgba(124, 139, 106, 0.36)',
    nameKey: 'identity.comeback.name',
    taglineKey: 'identity.comeback.tagline',
  },
]

export const DEFAULT_ARCHETYPE_ID: ArchetypeId = 'builder'

export function getArchetypeById(id: string | undefined): ArchetypeDefinition {
  return (
    ARCHETYPES.find((a) => a.id === id) ?? ARCHETYPES.find((a) => a.id === DEFAULT_ARCHETYPE_ID)!
  )
}
