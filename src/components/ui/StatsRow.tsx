import { Box } from './Box'
import { Text } from './Text'

export interface StatsRowItem {
  label: string
  value: string | number
}

interface StatsRowProps {
  items: StatsRowItem[]
}

export function StatsRow({ items }: StatsRowProps) {
  return (
    <Box flexDirection="row" gap="sm">
      {items.map((item) => (
        <Box
          key={item.label}
          flex={1}
          borderRadius="md"
          borderWidth={1}
          borderColor="divider"
          backgroundColor="surfaceElevated"
          padding="sm"
          minHeight={64}
          justifyContent="center"
        >
          <Text variant="micro" color="textMuted">
            {item.label}
          </Text>
          <Text marginTop="xs" variant="tabular">
            {String(item.value)}
          </Text>
        </Box>
      ))}
    </Box>
  )
}
