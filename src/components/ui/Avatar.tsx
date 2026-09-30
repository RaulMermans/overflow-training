import { View, Text, StyleSheet } from 'react-native'
import { colors } from '../../theme'

interface AvatarProps {
  emoji?: string
  size?: number
  name?: string
}

export default function Avatar({ emoji = '🏋️', size = 44, name }: AvatarProps) {
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      accessibilityLabel={name ? `${name}'s avatar` : 'Avatar'}
    >
      <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
