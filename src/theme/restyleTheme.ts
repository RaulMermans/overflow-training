import { createTheme } from '@shopify/restyle'
import { colors, space, radii, type, elevation } from './tokens'

export const restyleTheme = createTheme({
  colors: {
    background: colors.bg.primary,
    backgroundSecondary: colors.bg.secondary,
    surface: colors.surface.primary,
    surfaceElevated: colors.surface.elevated,
    input: colors.surface.input,
    overlay: colors.surface.overlay,
    textPrimary: colors.text.primary,
    textSecondary: colors.text.secondary,
    textMuted: colors.text.muted,
    textDisabled: colors.text.disabled,
    textInverse: colors.text.inverse,
    accent: colors.accent.primary,
    accentPrimaryMuted: colors.accent.primaryMuted,
    accentSecondary: colors.accent.secondary,
    accentSecondaryMuted: colors.accent.secondaryMuted,
    accentTertiary: colors.accent.tertiary,
    accentTertiaryMuted: colors.accent.tertiaryMuted,
    accentMuted: colors.accent.primaryMuted,
    success: colors.semantic.success,
    warning: colors.semantic.warning,
    error: colors.semantic.error,
    pr: colors.semantic.pr,
    borderSubtle: colors.border.subtle,
    borderDefault: colors.border.default,
    borderStrong: colors.border.strong,
    divider: colors.divider.default,
    dividerStrong: colors.divider.strong,
    scrimSoft: colors.scrim.soft,
    scrimMedium: colors.scrim.medium,
    scrimStrong: colors.scrim.strong,
    focusRing: colors.focusRing.default,
    focusRingOffset: colors.focusRing.offset,
    shadowDefault: colors.shadow.default,
    ctaDark: colors.button.ctaDark,
    warmWash: colors.bg.warmWash,
    celebration: colors.accent.celebration,
  },
  spacing: {
    none: space[0],
    xs: space[1],
    sm: space[2],
    md: space[3],
    lg: space[4],
    xl: space[5],
    '2xl': space[6],
    '3xl': space[8],
    '4xl': space[10],
  },
  borderRadii: {
    none: 0,
    sm: radii.sm,
    md: radii.md,
    lg: radii.lg,
    xl: radii.xl,
    '2xl': radii['2xl'],
    full: radii.full,
  },
  textVariants: {
    defaults: {
      color: 'textPrimary',
      ...type.body,
    },
    display: {
      color: 'textPrimary',
      ...type.display,
    },
    displayBold: {
      color: 'textPrimary',
      ...type.displayBold,
    },
    title: {
      color: 'textPrimary',
      ...type.h1,
    },
    section: {
      color: 'textPrimary',
      ...type.h3,
    },
    h1: {
      color: 'textPrimary',
      ...type.h1,
    },
    h2: {
      color: 'textPrimary',
      ...type.h2,
    },
    h3: {
      color: 'textPrimary',
      ...type.h3,
    },
    body: {
      color: 'textPrimary',
      ...type.body,
    },
    caption: {
      color: 'textSecondary',
      ...type.bodySm,
    },
    bodySm: {
      color: 'textSecondary',
      ...type.bodySm,
    },
    label: {
      color: 'textPrimary',
      ...type.label,
    },
    labelSm: {
      color: 'textSecondary',
      ...type.labelSm,
    },
    micro: {
      color: 'textMuted',
      ...type.micro,
    },
    tabular: {
      color: 'textPrimary',
      ...type.tabular,
    },
    stepLabel: {
      color: 'textMuted',
      ...type.stepLabel,
    },
    heroStat: {
      color: 'textPrimary',
      ...type.heroStat,
    },
    heroLabel: {
      color: 'textMuted',
      ...type.heroLabel,
    },
  },
  cardVariants: {
    defaults: {
      backgroundColor: 'surface',
      borderRadius: 'lg',
      borderWidth: 0,
      borderColor: 'borderSubtle',
      padding: 'lg',
    },
    surface: {
      backgroundColor: 'surface',
      borderWidth: 0,
      borderColor: 'borderSubtle',
    },
    elevated: {
      backgroundColor: 'surfaceElevated',
      borderWidth: 1,
      borderColor: 'borderSubtle',
    },
  },
  buttonVariants: {
    defaults: {
      minHeight: 44,
      borderRadius: 'md',
      paddingHorizontal: 'lg',
      paddingVertical: 'md',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    primary: {
      backgroundColor: 'accent',
      borderColor: 'accent',
    },
    secondary: {
      backgroundColor: 'surface',
      borderColor: 'borderDefault',
    },
    ghost: {
      backgroundColor: 'backgroundSecondary',
      borderColor: 'borderSubtle',
    },
    destructive: {
      backgroundColor: 'surface',
      borderColor: 'error',
    },
    cta: {
      backgroundColor: 'ctaDark',
      borderColor: 'ctaDark',
    },
  },
  shadows: {
    none: elevation.none,
    sm: elevation.sm,
    md: elevation.md,
  },
  breakpoints: {
    phone: 0,
    tablet: 768,
  },
})

export type Theme = typeof restyleTheme
