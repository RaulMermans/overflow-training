import React from 'react'
import { Text, TextProps, TextStyle } from 'react-native'
import { colors, typography } from '../../theme'

type Variant = keyof typeof typography

interface ThemedTextProps extends TextProps {
  variant?: Variant
  color?: string
}

export function ThemedText({
  variant = 'body',
  color = colors.text.primary,
  style,
  ...props
}: ThemedTextProps) {
  return <Text style={[typography[variant] as TextStyle, { color }, style]} {...props} />
}
