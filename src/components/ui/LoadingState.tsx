import { ActivityIndicator } from 'react-native'
import { useTheme } from '@shopify/restyle'
import type { Theme } from '../../theme/restyleTheme'
import { Box } from './Box'
import { Text } from './Text'

interface LoadingStateProps {
  message?: string
}

export function LoadingState({ message }: LoadingStateProps) {
  const theme = useTheme<Theme>()

  return (
    <Box alignItems="center" justifyContent="center" paddingVertical="3xl" paddingHorizontal="xl">
      <ActivityIndicator size="large" color={theme.colors.accent} />
      {message ? (
        <Box marginTop="sm" maxWidth={360}>
          <Text variant="bodySm" color="textMuted" textAlign="center">
            {message}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
