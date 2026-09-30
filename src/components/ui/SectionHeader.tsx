import { Box } from './Box'
import { Pressable } from './Pressable'
import { Text } from './Text'

type SectionHeaderVariant = 'default' | 'dense'

interface SectionHeaderProps {
  title: string
  actionLabel?: string
  onActionPress?: () => void
  variant?: SectionHeaderVariant
}

const spacingByVariant: Record<SectionHeaderVariant, 'md' | 'sm'> = {
  default: 'md',
  dense: 'sm',
}

const textByVariant: Record<SectionHeaderVariant, 'h3' | 'label'> = {
  default: 'h3',
  dense: 'label',
}

export function SectionHeader({
  title,
  actionLabel,
  onActionPress,
  variant = 'default',
}: SectionHeaderProps) {
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      gap="sm"
      marginBottom={spacingByVariant[variant]}
    >
      <Box flex={1} minWidth={0}>
        <Text
          variant={textByVariant[variant]}
          numberOfLines={3}
          ellipsizeMode="tail"
          style={{ flexShrink: 1 }}
        >
          {title}
        </Text>
      </Box>
      {actionLabel && onActionPress ? (
        <Pressable
          onPress={onActionPress}
          accessibilityRole="button"
          minHeight={44}
          justifyContent="center"
          maxWidth="45%"
        >
          {({ pressed }) => (
            <Text
              variant="labelSm"
              color="accent"
              opacity={pressed ? 0.8 : 1}
              numberOfLines={2}
              ellipsizeMode="tail"
              textAlign="right"
            >
              {actionLabel}
            </Text>
          )}
        </Pressable>
      ) : null}
    </Box>
  )
}
