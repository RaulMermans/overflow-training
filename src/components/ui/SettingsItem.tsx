import { Pressable, Text, StyleSheet } from 'react-native'
import { colors, typography } from '../../theme'

interface SettingsItemProps {
  icon?: string
  label: string
  value?: string
  onPress?: () => void
  isDestructive?: boolean
  showArrow?: boolean
}

export default function SettingsItem({
  icon,
  label,
  value,
  onPress,
  isDestructive = false,
  showArrow = true,
}: SettingsItemProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.container,
        pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] },
      ]}
    >
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={[styles.label, isDestructive && styles.labelDestructive]}>{label}</Text>
      {value && <Text style={styles.value}>{value}</Text>}
      {showArrow && <Text style={styles.arrow}>▶</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    minHeight: 52,
  },
  icon: {
    fontSize: 20,
  },
  label: {
    ...typography.body,
    color: colors.text.primary,
    flex: 1,
  },
  labelDestructive: {
    color: colors.semantic.error,
  },
  value: {
    ...typography.body,
    color: colors.text.muted,
  },
  arrow: {
    fontSize: 12,
    color: colors.text.muted,
  },
})
