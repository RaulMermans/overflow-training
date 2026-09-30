import { Box } from './Box'
import { Button } from './Button'
import { Text } from './Text'

interface ErrorStateProps {
  title?: string
  message: string
  retryLabel?: string
  onRetry?: () => void
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  retryLabel,
  onRetry,
}: ErrorStateProps) {
  return (
    <Box
      backgroundColor="surface"
      borderRadius="lg"
      borderColor="borderSubtle"
      borderWidth={1}
      padding="lg"
      marginTop="sm"
    >
      <Text variant="label" color="error">
        {title}
      </Text>
      <Text marginTop="xs" variant="bodySm" color="textMuted">
        {message}
      </Text>
      {retryLabel && onRetry ? (
        <Button marginTop="md" title={retryLabel} variant="secondary" onPress={onRetry} />
      ) : null}
    </Box>
  )
}
