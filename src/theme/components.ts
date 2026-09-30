import { StyleSheet } from 'react-native'
import { colors, typography, spacing, radius } from './tokens'

export const cardStyles = StyleSheet.create({
  surface: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  elevated: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.default,
  },
})

export const buttonStyles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primary: {
    backgroundColor: colors.accent.primary,
  },
  secondary: {
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  ghost: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  destructive: {
    backgroundColor: colors.semantic.errorMuted,
  },
})

export const buttonTextStyles = StyleSheet.create({
  primary: {
    color: colors.text.inverse,
    ...typography.label,
  },
  secondary: {
    color: colors.text.primary,
    ...typography.label,
  },
  ghost: {
    color: colors.accent.primary,
    ...typography.label,
  },
  destructive: {
    color: colors.semantic.error,
    ...typography.label,
  },
})

export const inputStyles = StyleSheet.create({
  base: {
    backgroundColor: colors.bg.input,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    color: colors.text.primary,
    ...typography.body,
    minHeight: 48,
  },
  focused: {
    borderColor: colors.accent.primary,
  },
  error: {
    borderColor: colors.semantic.error,
  },
})

export const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  scrollContent: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[10],
  },
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
})
