import { Easing } from 'react-native'

// ============================================================================
// Workout Log Design Tokens
// ============================================================================

const accentPrimary = '#813E3A'
const accentPrimaryMuted = 'rgba(129, 62, 58, 0.18)'
const accentSecondary = '#B59345'
const accentSecondaryMuted = 'rgba(181, 147, 69, 0.18)'
const accentTertiary = '#9E6C6E'
const accentTertiaryMuted = 'rgba(158, 108, 110, 0.18)'
const warmWash = 'rgba(158, 108, 110, 0.05)'
const celebration = '#C9A84C'
const ctaDark = '#2A1210'
const semanticSuccess = '#7C8B6A'
const semanticSuccessMuted = 'rgba(124, 139, 106, 0.18)'
const scrimSoft = 'rgba(0, 0, 0, 0.1)'
const scrimMedium = 'rgba(0, 0, 0, 0.25)'
const scrimStrong = 'rgba(0, 0, 0, 0.4)'

export const colors = {
  bg: {
    primary: '#FFFFFF',
    secondary: '#F7F3EE',
    tertiary: '#EDE8DF',
    highlight: '#E5DDD0',
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    input: '#F7F3EE',
    overlay: scrimMedium,
    warmWash,
  },
  surface: {
    primary: '#FFFFFF',
    elevated: '#FFFFFF',
    input: '#F7F3EE',
    overlay: scrimMedium,
  },
  text: {
    primary: '#1A1209',
    secondary: '#4A4A4A',
    muted: '#808080',
    disabled: '#BDBDBD',
    inverse: '#FFFFFF',
  },
  accent: {
    primary: accentPrimary,
    primaryHover: '#6F3532',
    primaryMuted: accentPrimaryMuted,
    secondary: accentSecondary,
    secondaryMuted: accentSecondaryMuted,
    tertiary: accentTertiary,
    tertiaryMuted: accentTertiaryMuted,
    celebration,
  },
  tier: {
    bronze: '#A97142',
    bronzeMuted: 'rgba(169, 113, 66, 0.15)',
    silver: '#767676',
    silverMuted: 'rgba(118, 118, 118, 0.15)',
    gold: '#FFD700',
    goldMuted: 'rgba(255, 215, 0, 0.15)',
    diamond: '#B9F2FF',
    diamondMuted: 'rgba(185, 242, 255, 0.15)',
  },
  semantic: {
    success: semanticSuccess,
    successMuted: semanticSuccessMuted,
    warning: '#FFB800',
    warningMuted: 'rgba(255, 184, 0, 0.15)',
    error: '#FF3B30',
    errorMuted: 'rgba(255, 59, 48, 0.15)',
    pr: accentPrimary,
    prMuted: accentPrimaryMuted,
  },
  border: {
    subtle: '#EAE4DA',
    default: '#D9D0C3',
    strong: '#C2B7A6',
    focus: accentPrimary,
  },
  divider: {
    default: '#EAE4DA',
    subtle: '#F2EDE5',
    strong: '#D9D0C3',
  },
  scrim: {
    soft: scrimSoft,
    medium: scrimMedium,
    strong: scrimStrong,
  },
  shadow: {
    default: '#000000',
  },
  button: {
    ctaDark,
  },
  focusRing: {
    default: accentPrimary,
    offset: 'rgba(129, 62, 58, 0.25)',
  },
  muscle: {
    chest: accentPrimary,
    back: accentPrimary,
    shoulders: accentPrimary,
    legs: accentPrimary,
    arms: accentPrimary,
    core: accentPrimary,
  },
  streak: {
    level0: '#F4EDDA',
    level1: 'rgba(181, 147, 69, 0.24)',
    level2: 'rgba(181, 147, 69, 0.42)',
    level3: 'rgba(181, 147, 69, 0.62)',
    level4: accentSecondary,
  },
} as const

export const fontFamily = {
  regular: 'Rubik_400Regular',
  medium: 'Rubik_500Medium',
  semiBold: 'Rubik_600SemiBold',
  bold: 'Rubik_700Bold',
} as const

export const typeScale = {
  h1: {
    fontFamily: fontFamily.semiBold,
    fontWeight: '600' as const,
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.4,
  },
  h2: {
    fontFamily: fontFamily.semiBold,
    fontWeight: '600' as const,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontWeight: '400' as const,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontWeight: '400' as const,
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  micro: {
    fontFamily: fontFamily.medium,
    fontWeight: '500' as const,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 0.4,
  },
} as const

export const type = {
  display: {
    fontFamily: fontFamily.semiBold,
    fontWeight: '600' as const,
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -0.8,
  },
  displayBold: {
    fontFamily: fontFamily.bold,
    fontWeight: '700' as const,
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -0.8,
  },
  h1: typeScale.h1,
  h2: typeScale.h2,
  h3: {
    fontFamily: fontFamily.medium,
    fontWeight: '500' as const,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: 0,
  },
  bodyLg: {
    fontFamily: fontFamily.regular,
    fontWeight: '400' as const,
    fontSize: 18,
    lineHeight: 27,
    letterSpacing: 0,
  },
  body: typeScale.body,
  bodySm: typeScale.caption,
  label: {
    fontFamily: fontFamily.medium,
    fontWeight: '500' as const,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  labelSm: {
    fontFamily: fontFamily.medium,
    fontWeight: '500' as const,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  micro: typeScale.micro,
  tabular: {
    fontFamily: fontFamily.semiBold,
    fontWeight: '600' as const,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
  },
  stepLabel: {
    fontFamily: fontFamily.medium,
    fontWeight: '500' as const,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.5,
  },
  heroStat: {
    fontFamily: fontFamily.bold,
    fontWeight: '700' as const,
    fontSize: 56,
    lineHeight: 64,
    letterSpacing: -1.5,
  },
  heroLabel: {
    fontFamily: fontFamily.medium,
    fontWeight: '500' as const,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 2.0,
  },
} as const

// Compatibility alias.
export const typography = type

export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const

// Compatibility alias.
export const spacing = space

export const radii = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const

// Compatibility alias.
export const radius = radii

export const elevation = {
  none: {},
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.11,
    shadowRadius: 12,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 18,
    elevation: 10,
  },
  xl: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 16,
  },
} as const

export const motion = {
  duration: {
    instant: 100,
    fast: 150,
    normal: 200,
    slow: 300,
    slower: 400,
    cardEnter: 200,
    setPulse: 160,
    prGlow: 220,
    celebration: 2000,
  },
  easing: {
    ease: Easing.bezier(0.4, 0, 0.2, 1),
    easeOut: Easing.bezier(0, 0, 0.2, 1),
    easeIn: Easing.bezier(0.4, 0, 1, 1),
    spring: Easing.bezier(0.34, 1.56, 0.64, 1),
  },
  scale: {
    press: 0.98,
    pulseFrom: 0.99,
    pulseTo: 1.02,
  },
  opacity: {
    glowFrom: 0,
    glowTo: 0.32,
  },
} as const

export const focus = {
  ringWidth: 2,
  ringColor: colors.focusRing.default,
  ringOffsetColor: colors.focusRing.offset,
} as const

export const state = {
  pressedOpacity: 0.85,
  disabledOpacity: 0.55,
} as const

// Touch targets: minimum 44x44px per WCAG 2.2
export const touch = {
  min: 44,
  comfortable: 48,
} as const
