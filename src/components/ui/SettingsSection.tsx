import { View, Text, StyleSheet } from 'react-native'
import { colors, typography, radius } from '../../theme'

interface SettingsSectionProps {
  title: string
  children: React.ReactNode
}

export default function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  title: {
    ...typography.labelSm,
    color: colors.text.muted,
    marginBottom: 12,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
})
