import { View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getArchetypeById } from '../../features/identity/archetypes'
import { colors } from '../../theme/tokens'

interface ArchetypeIconProps {
  archetypeId?: string
  size?: number
  selected?: boolean
  /** Override border visibility (default: only shown when selected) */
  showBorder?: boolean
}

/**
 * Renders a single archetype icon badge.
 * Uses the archetype registry for colors and icon glyph.
 * Safe to call with undefined archetypeId — defaults to 'builder'.
 */
export function ArchetypeIcon({
  archetypeId,
  size = 56,
  selected = false,
  showBorder,
}: ArchetypeIconProps): React.JSX.Element {
  const archetype = getArchetypeById(archetypeId)
  const iconSize = Math.round(size * 0.46)
  const borderRadius = size / 2
  const hasBorder = showBorder ?? selected

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: archetype.bgColor,
          borderWidth: hasBorder ? 2 : 1,
          borderColor: hasBorder ? archetype.borderColor : colors.border.subtle,
        },
      ]}
      accessible={false}
    >
      <Ionicons name={archetype.icon} size={iconSize} color={archetype.fgColor} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
