import React from 'react'
import { Pressable, PressableProps, ViewStyle, ActivityIndicator } from 'react-native'
import { buttonStyles, colors } from '../../theme'
import { Text } from './Text'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'

interface ThemedButtonProps extends Omit<PressableProps, 'style'> {
  variant?: ButtonVariant
  title: string
  loading?: boolean
  style?: ViewStyle
}

const variantToColor: Record<ButtonVariant, 'textInverse' | 'accent' | 'textPrimary'> = {
  primary: 'textInverse',
  secondary: 'accent',
  ghost: 'accent',
  destructive: 'textInverse',
}

export function ThemedButton({
  variant = 'primary',
  title,
  loading,
  disabled,
  style,
  ...props
}: ThemedButtonProps) {
  const textColor = variantToColor[variant]
  return (
    <Pressable
      style={({ pressed }) => [
        buttonStyles.base,
        buttonStyles[variant],
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
        disabled && { opacity: 0.5 },
        style,
      ]}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.text.inverse : colors.accent.primary}
        />
      ) : (
        <Text variant="label" color={textColor}>
          {title}
        </Text>
      )}
    </Pressable>
  )
}
