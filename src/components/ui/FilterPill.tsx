import { hapticSelection } from '../../lib/feedback'
import { Box } from './Box'
import { Pressable } from './Pressable'
import { Text } from './Text'

interface FilterPillProps {
  label: string
  isActive: boolean
  onPress: () => void
}

export default function FilterPill({ label, isActive, onPress }: FilterPillProps) {
  return (
    <Pressable
      onPress={() => {
        hapticSelection()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      minHeight={44}
    >
      {({ pressed }) => (
        <Box
          minHeight={44}
          paddingHorizontal="lg"
          paddingVertical="sm"
          backgroundColor={isActive ? 'accentMuted' : 'surface'}
          borderRadius="full"
          borderWidth={1}
          borderColor={isActive ? 'accent' : 'borderDefault'}
          justifyContent="center"
          opacity={pressed ? 0.85 : 1}
          style={{ transform: [{ scale: pressed ? 0.985 : 1 }] }}
        >
          <Text variant="labelSm" color={isActive ? 'accent' : 'textSecondary'}>
            {label}
          </Text>
        </Box>
      )}
    </Pressable>
  )
}
