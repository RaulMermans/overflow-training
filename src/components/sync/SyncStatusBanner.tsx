import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { useI18n } from '../../i18n/useI18n'
import { colors, radii, space, type } from '../../theme/tokens'
import { Text } from '../ui/Text'

interface SyncStatusBannerProps {
  pendingCount: number
  pausedByAuth?: boolean
  onRetry?: () => void
}

export function SyncStatusBanner({
  pendingCount,
  pausedByAuth = false,
  onRetry,
}: SyncStatusBannerProps) {
  const { t } = useI18n()

  if (!pausedByAuth && pendingCount <= 0) {
    return null
  }

  const isWarning = pausedByAuth

  return (
    <View style={[styles.container, isWarning ? styles.warning : styles.neutral]}>
      <View style={styles.copy}>
        <Text style={[styles.title, isWarning ? styles.warningTitle : styles.neutralTitle]}>
          {pausedByAuth ? t('sync.banner.pausedTitle') : t('sync.banner.pendingTitle')}
        </Text>
        <Text style={styles.body}>
          {pausedByAuth ? t('sync.banner.pausedBody') : t('sync.banner.pendingBody')}
        </Text>
      </View>

      {pausedByAuth && onRetry ? (
        <TouchableOpacity onPress={onRetry} style={styles.retryButton} accessibilityRole="button">
          <Text style={styles.retryText}>{t('sync.cta.retry')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: space[4],
    marginBottom: space[3],
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  neutral: {
    backgroundColor: colors.bg.secondary,
    borderColor: colors.border.subtle,
  },
  warning: {
    backgroundColor: colors.semantic.warningMuted,
    borderColor: colors.semantic.warning,
  },
  copy: {
    flex: 1,
  },
  title: {
    ...type.labelSm,
  },
  neutralTitle: {
    color: colors.text.secondary,
  },
  warningTitle: {
    color: colors.semantic.warning,
  },
  body: {
    ...type.micro,
    color: colors.text.muted,
    marginTop: space[0.5],
  },
  retryButton: {
    borderRadius: radii.sm,
    backgroundColor: colors.semantic.warning,
    paddingHorizontal: space[3],
    paddingVertical: space[1.5],
  },
  retryText: {
    ...type.labelSm,
    color: colors.text.inverse,
  },
})
