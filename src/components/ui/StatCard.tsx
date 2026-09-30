import React from 'react'
import { View, ViewStyle } from 'react-native'
import { colors, radius, spacing } from '../../theme'
import { Text } from './Text'

interface StatCardProps {
  icon?: string
  value: string | number
  label: string
  valueColor?: 'textPrimary' | 'accent' | 'success' | 'error'
  style?: ViewStyle
}

export function StatCard({ icon, value, label, valueColor = 'accent', style }: StatCardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.bg.surface,
          borderRadius: radius.md,
          padding: spacing[4],
          borderWidth: 1,
          borderColor: colors.border.subtle,
          flex: 1,
        },
        style,
      ]}
    >
      {icon && (
        <Text variant="body" marginBottom="xs">
          {icon}
        </Text>
      )}
      <Text variant="h2" color={valueColor}>
        {String(value)}
      </Text>
      <Text variant="bodySm" color="textMuted" marginTop="xs">
        {label}
      </Text>
    </View>
  )
}
