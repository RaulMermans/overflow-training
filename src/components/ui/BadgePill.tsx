import { Box } from './Box'
import { Text } from './Text'

export type BadgePillVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'error'

interface BadgePillProps {
  label: string
  variant?: BadgePillVariant
}

const variants: Record<
  BadgePillVariant,
  {
    bg: 'surfaceElevated' | 'accentMuted' | 'success' | 'warning' | 'error' | 'backgroundSecondary'
    text: 'textSecondary' | 'accent' | 'textInverse' | 'textPrimary'
    border: 'divider' | 'accent' | 'success' | 'warning' | 'error'
  }
> = {
  neutral: { bg: 'surfaceElevated', text: 'textSecondary', border: 'divider' },
  accent: { bg: 'accentMuted', text: 'accent', border: 'accent' },
  success: { bg: 'success', text: 'textInverse', border: 'success' },
  warning: { bg: 'warning', text: 'textInverse', border: 'warning' },
  error: { bg: 'error', text: 'textInverse', border: 'error' },
}

export function BadgePill({ label, variant = 'neutral' }: BadgePillProps) {
  const palette = variants[variant]

  return (
    <Box
      minHeight={30}
      borderRadius="full"
      borderWidth={1}
      borderColor={palette.border}
      paddingHorizontal="sm"
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
