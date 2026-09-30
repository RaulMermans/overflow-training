import { Box } from '../ui/Box'
import { Text } from '../ui/Text'

interface SessionHeaderProps {
  title: string
  elapsedLabel: string
}

export function SessionHeader({ title, elapsedLabel }: SessionHeaderProps) {
  return (
    <Box
      paddingHorizontal="xl"
      paddingTop="lg"
      paddingBottom="md"
      borderBottomWidth={1}
      borderBottomColor="borderSubtle"
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
    >
      <Text variant="h2">{title}</Text>
      <Text variant="label" color="textMuted">
        {elapsedLabel}
      </Text>
    </Box>
  )
}
