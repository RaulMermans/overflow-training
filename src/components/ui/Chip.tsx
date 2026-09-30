import { Box } from './Box'
import { Pressable } from './Pressable'
import { Text } from './Text'

type ChipVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'error'

interface ChipProps {
  label: string
  variant?: ChipVariant
  onPress?: () => void
  disabled?: boolean
  testID?: string
  accessibilityLabel?: string
}

const variants: Record<
  ChipVariant,
  {
    bg: 'surfaceElevated' | 'accentMuted' | 'success' | 'warning' | 'error'
    text: 'textSecondary' | 'accent' | 'textInverse'
  }
> = {
  neutral: { bg: 'surfaceElevated', text: 'textSecondary' },
  accent: { bg: 'accentMuted', text: 'accent' },
  success: { bg: 'success', text: 'textInverse' },
  warning: { bg: 'warning', text: 'textInverse' },
  error: { bg: 'error', text: 'textInverse' },
}

export function Chip({
  label,
  variant = 'neutral',
  onPress,
  disabled,
  testID,
  accessibilityLabel,
}: ChipProps) {
  const palette = variants[variant]
  const a11yLabel = accessibilityLabel ?? label

  if (!onPress) {
    return (
      <Box
        testID={testID}
        accessibilityLabel={a11yLabel}
        minHeight={32}
        borderRadius="full"
        paddingHorizontal="md"
        paddingVertical="xs"
        backgroundColor={palette.bg}
        justifyContent="center"
        alignItems="center"
      >
        <Text variant="labelSm" color={palette.text}>
          {label}
        </Text>
      </Box>
    )
  }

  return (
    <Pressable
      testID={testID}
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      minHeight={44}
    >
      {({ pressed }) => (
        <Box
          minHeight={44}
          borderRadius="full"
          paddingHorizontal="md"
          paddingVertical="xs"
          backgroundColor={palette.bg}
          justifyContent="center"
          alignItems="center"
          opacity={disabled ? 0.45 : pressed ? 0.8 : 1}
          style={{ transform: [{ scale: pressed && !disabled ? 0.985 : 1 }] }}
        >
          <Text variant="labelSm" color={palette.text}>
            {label}
          </Text>
        </Box>
      )}
    </Pressable>
  )
}
