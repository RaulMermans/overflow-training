import React from 'react'
import { View, ViewStyle } from 'react-native'
import { colors, radius, spacing } from '../../theme'
import { Text } from './Text'

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'pr'

const variantStyles: Record<
  BadgeVariant,
  { bg: string; textColor: 'textSecondary' | 'accent' | 'success' | 'warning' | 'error' | 'pr' }
> = {
  default: { bg: colors.bg.elevated, textColor: 'textSecondary' },
  primary: { bg: colors.accent.primaryMuted, textColor: 'accent' },
  success: { bg: colors.semantic.successMuted, textColor: 'success' },
  warning: { bg: colors.semantic.warningMuted, textColor: 'warning' },
  error: { bg: colors.semantic.errorMuted, textColor: 'error' },
  pr: { bg: colors.semantic.prMuted, textColor: 'pr' },
}

interface BadgeProps {
  variant?: BadgeVariant
  label: string
  style?: ViewStyle
}

export function Badge({ variant = 'default', label, style }: BadgeProps) {
  const v = variantStyles[variant]
  return (
    <View
      style={[
        {
          backgroundColor: v.bg,
          borderRadius: radius.full,
          paddingHorizontal: spacing[2.5],
          paddingVertical: spacing[1],
        },
        style,
      ]}
    >
      <Text variant="labelSm" color={v.textColor}>
        {label}
      </Text>
    </View>
  )
}
