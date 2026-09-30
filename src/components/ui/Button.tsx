import type { ReactNode } from 'react'
import { ActivityIndicator } from 'react-native'
import { useReducedMotion } from '../../lib/motion'
import { useTheme } from '@shopify/restyle'
import type { Theme } from '../../theme/restyleTheme'
import { hapticImpactLight } from '../../lib/feedback'
import { Box } from './Box'
import { Pressable, type PressableProps } from './Pressable'
import { Text } from './Text'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'cta'

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string
  variant?: ButtonVariant
  isLoading?: boolean
  loading?: boolean
  leftAccessory?: ReactNode
  rightAccessory?: ReactNode
}

const variantStyles: Record<
  ButtonVariant,
  { bg: keyof Theme['colors']; border: keyof Theme['colors']; text: keyof Theme['colors'] }
> = {
  primary: { bg: 'accent', border: 'accent', text: 'textInverse' },
  secondary: { bg: 'surface', border: 'borderDefault', text: 'textPrimary' },
  ghost: { bg: 'backgroundSecondary', border: 'borderSubtle', text: 'textSecondary' },
  destructive: { bg: 'surface', border: 'error', text: 'error' },
  cta: { bg: 'ctaDark', border: 'ctaDark', text: 'textInverse' },
}

export function Button({
  title,
  variant = 'primary',
  isLoading,
  loading,
  disabled,
  leftAccessory,
  rightAccessory,
  onPressIn,
  ...props
}: ButtonProps) {
  const theme = useTheme<Theme>()
  const reducedMotion = useReducedMotion()
  const palette = variantStyles[variant]
  const { accessibilityState, ...pressableProps } = props
  const resolvedLoading = isLoading ?? loading ?? false
  const isDisabled = disabled || resolvedLoading
  const mergedAccessibilityState = {
    ...accessibilityState,
    disabled: isDisabled,
    busy: resolvedLoading,
  }

  const handlePressIn = (e: Parameters<NonNullable<typeof onPressIn>>[0]) => {
    if ((variant === 'primary' || variant === 'cta') && !isDisabled) {
      hapticImpactLight(reducedMotion)
    }
    onPressIn?.(e)
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? title}
      accessibilityState={mergedAccessibilityState}
      disabled={isDisabled}
      onPressIn={handlePressIn}
      {...pressableProps}
    >
      {({ pressed }) => (
        <Box
          minHeight={44}
          borderRadius={variant === 'cta' ? 'xl' : 'lg'}
          borderWidth={1}
          borderColor={palette.border}
          backgroundColor={palette.bg}
          paddingVertical="md"
          paddingHorizontal="lg"
          alignItems="center"
          justifyContent="center"
          opacity={isDisabled ? 0.6 : pressed ? 0.85 : 1}
          flexDirection="row"
          gap="sm"
          style={{ transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }] }}
        >
          {resolvedLoading ? (
            <ActivityIndicator color={theme.colors[palette.text]} />
          ) : (
            <>
              {leftAccessory}
              <Text
                variant="label"
                color={palette.text}
                numberOfLines={2}
                ellipsizeMode="tail"
                textAlign="center"
                style={
                  variant === 'cta'
                    ? { flexShrink: 1, textTransform: 'uppercase', letterSpacing: 1.2 }
                    : { flexShrink: 1 }
                }
              >
                {title}
              </Text>
              {rightAccessory}
            </>
          )}
        </Box>
      )}
    </Pressable>
  )
}
