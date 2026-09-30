import { Box } from './Box'
import { Button } from './Button'
import { Card } from './Card'
import { Pressable } from './Pressable'
import { Text } from './Text'

interface EmptyStateCardProps {
  title: string
  body: string
  primaryActionLabel?: string
  onPrimaryAction?: () => void
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  testID?: string
}

export function EmptyStateCard({
  title,
  body,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  testID,
}: EmptyStateCardProps) {
  return (
    <Card testID={testID}>
      <Box gap="xs">
        <Text variant="h3">{title}</Text>
        <Text variant="bodySm" color="textMuted">
          {body}
        </Text>
      </Box>

      {primaryActionLabel && onPrimaryAction ? (
        <Box marginTop="md">
          <Button title={primaryActionLabel} onPress={onPrimaryAction} />
        </Box>
      ) : null}

      {secondaryActionLabel && onSecondaryAction ? (
        <Pressable
          onPress={onSecondaryAction}
          accessibilityRole="button"
          alignItems="center"
          justifyContent="center"
          minHeight={44}
          marginTop="xs"
        >
          {({ pressed }) => (
            <Text variant="labelSm" color="accent" opacity={pressed ? 0.8 : 1}>
              {secondaryActionLabel}
            </Text>
          )}
        </Pressable>
      ) : null}
    </Card>
  )
}
