import { forwardRef, useEffect, useMemo, useState } from 'react'
import {
  TextInput as RNTextInput,
  type StyleProp,
  StyleSheet,
  type TextInputProps,
  type TextStyle,
} from 'react-native'
import { useTheme } from '@shopify/restyle'
import type { Theme } from '../../theme/restyleTheme'

interface InputProps extends TextInputProps {
  invalid?: boolean
  style?: StyleProp<TextStyle>
}

export const Input = forwardRef<RNTextInput, InputProps>(function Input(
  { invalid = false, style, onFocus, onBlur, placeholderTextColor, ...props },
  ref,
) {
  const theme = useTheme<Theme>()
  const [focused, setFocused] = useState(false)
  const isEditable = props.editable !== false

  useEffect(() => {
    if (!isEditable && focused) {
      setFocused(false)
    }
  }, [focused, isEditable])

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    setFocused(true)
    onFocus?.(event)
  }

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    setFocused(false)
    onBlur?.(event)
  }

  const borderColor = invalid
    ? theme.colors.error
    : focused && isEditable
      ? theme.colors.accent
      : isEditable
        ? theme.colors.borderSubtle
        : theme.colors.borderDefault

  // Memoize so this object is only recreated when visual state actually changes,
  // not on every keystroke (controlled TextInput re-renders on every value change).
  const dynamicStyle = useMemo(
    () => ({
      backgroundColor: isEditable ? theme.colors.input : theme.colors.backgroundSecondary,
      color: theme.colors.textPrimary,
      borderColor,
      borderWidth: focused ? 1.5 : 1,
      borderRadius: theme.borderRadii.lg,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      minHeight: 44,
      fontSize: theme.textVariants.body.fontSize,
      lineHeight: theme.textVariants.body.lineHeight,
      fontWeight: theme.textVariants.body.fontWeight,
      letterSpacing: theme.textVariants.body.letterSpacing,
      ...(focused && isEditable
        ? {
            shadowColor: theme.colors.accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 3,
          }
        : null),
    }),
    [focused, isEditable, borderColor],
  )

  return (
    <RNTextInput
      ref={ref}
      {...props}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholderTextColor={
        placeholderTextColor ?? (isEditable ? theme.colors.textMuted : theme.colors.textDisabled)
      }
      selectionColor={theme.colors.accent}
      style={[styles.base, dynamicStyle, style]}
    />
  )
})

const styles = StyleSheet.create({
  base: {},
})
