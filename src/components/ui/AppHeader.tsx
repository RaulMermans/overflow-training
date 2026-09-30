import { Box } from './Box'
import { Pressable } from './Pressable'
import { Text } from './Text'

interface AppHeaderProps {
  title: string
  subtitle?: string
  subtitleNumberOfLines?: number
  meta?: string
  leftActionLabel?: string
  onLeftActionPress?: () => void
  rightActionLabel?: string
  onRightActionPress?: () => void
  variant?: 'default' | 'compact'
  rightActionTestID?: string
  leftActionTestID?: string
}

const paddingTopByVariant = {
  default: '3xl',
  compact: '2xl',
} as const

const paddingBottomByVariant = {
  default: 'xl',
  compact: 'md',
} as const

const titleVariantByKind = {
  default: 'h1',
  compact: 'h2',
} as const

const metaVariantByKind = {
  default: 'label',
  compact: 'labelSm',
} as const

export function AppHeader({
  title,
  subtitle,
  subtitleNumberOfLines,
  meta,
  leftActionLabel,
  onLeftActionPress,
  rightActionLabel,
  onRightActionPress,
  variant = 'default',
  rightActionTestID,
  leftActionTestID,
}: AppHeaderProps) {
  return (
    <Box
      paddingTop={paddingTopByVariant[variant]}
      paddingBottom={paddingBottomByVariant[variant]}
      flexDirection="row"
      alignItems="flex-start"
      justifyContent="space-between"
      gap="md"
    >
      {leftActionLabel && onLeftActionPress ? (
        <Pressable
          testID={leftActionTestID}
          onPress={onLeftActionPress}
          accessibilityRole="button"
          minHeight={44}
          alignItems="center"
          justifyContent="center"
          paddingHorizontal="sm"
          hitSlop={8}
        >
          {({ pressed }) => (
            <Text
              variant={metaVariantByKind[variant]}
              color="accent"
              opacity={pressed ? 0.8 : 1}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {leftActionLabel}
            </Text>
          )}
        </Pressable>
      ) : null}

      <Box flex={1} minWidth={0}>
        <Text variant={titleVariantByKind[variant]}>{title}</Text>
        {subtitle ? (
          <Text
            marginTop="xs"
            variant="bodySm"
            color="textMuted"
            numberOfLines={subtitleNumberOfLines}
            ellipsizeMode={subtitleNumberOfLines ? 'tail' : undefined}
          >
            {subtitle}
          </Text>
        ) : null}
      </Box>

      {rightActionLabel && onRightActionPress ? (
        <Pressable
          testID={rightActionTestID}
          onPress={onRightActionPress}
          accessibilityRole="button"
          minHeight={44}
          alignItems="center"
          justifyContent="center"
          paddingHorizontal="sm"
          hitSlop={8}
        >
          {({ pressed }) => (
            <Text
              variant={metaVariantByKind[variant]}
              color="accent"
              opacity={pressed ? 0.8 : 1}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {rightActionLabel}
            </Text>
          )}
        </Pressable>
      ) : meta ? (
        <Box maxWidth="35%" minWidth={0}>
          <Text
            variant={metaVariantByKind[variant]}
            color="textMuted"
            numberOfLines={1}
            ellipsizeMode="tail"
            textAlign="right"
          >
            {meta}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
