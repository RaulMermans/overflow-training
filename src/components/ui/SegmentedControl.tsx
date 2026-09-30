import { hapticSelection } from '../../lib/feedback'
import { Box } from './Box'
import { Pressable } from './Pressable'
import { Text } from './Text'

export interface SegmentedOption {
  value: string
  label: string
}

interface SegmentedControlProps {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
}

export default function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <Box
      accessibilityRole="radiogroup"
      flexDirection="row"
      backgroundColor="surface"
      borderRadius="md"
      borderWidth={1}
      borderColor="borderSubtle"
      padding="xs"
      gap="xs"
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => {
              hapticSelection()
              onChange(option.value)
            }}
            style={{ flex: 1 }}
          >
            {({ pressed }) => (
              <Box
                minHeight={44}
                borderRadius="sm"
                justifyContent="center"
                alignItems="center"
                backgroundColor={selected ? 'surfaceElevated' : 'surface'}
                opacity={pressed ? 0.9 : 1}
                paddingVertical="sm"
                paddingHorizontal="xs"
                style={{ transform: [{ scale: pressed ? 0.985 : 1 }] }}
              >
                <Text
                  variant="labelSm"
                  color={selected ? 'textPrimary' : 'textMuted'}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                  textAlign="center"
                >
                  {option.label}
                </Text>
              </Box>
            )}
          </Pressable>
        )
      })}
    </Box>
  )
}
