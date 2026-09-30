import { useEffect, useState } from 'react'
import { Modal, StyleSheet, View } from 'react-native'
import { Box, Button, Chip, Text } from '../ui'
import { useSyncStatus } from '../../features/sync/useSyncStatus'
import { useI18n } from '../../i18n/useI18n'
import { formatDateTimeByLanguage } from '../../i18n/formatters'
import { colors, radius, spacing } from '../../theme'
import type { SyncErrorCode } from '../../lib/sync/syncErrorTaxonomy'
import { ENABLE_ROUTINE_PLAN_SYNC } from '../../config/featureFlags'

type SyncPillStatus = ReturnType<typeof useSyncStatus>['status'] | 'warning'

function getVariant(status: SyncPillStatus) {
  if (status === 'synced') return 'success' as const
  if (status === 'syncing') return 'accent' as const
  if (status === 'warning') return 'warning' as const
  if (status === 'offline') return 'warning' as const
  if (status === 'error') return 'error' as const
  return 'neutral' as const
}

function getLabel(
  status: SyncPillStatus,
  t: ReturnType<typeof useI18n>['t'],
  lastErrorCode: SyncErrorCode | null,
): string {
  if (status === 'synced') return t('sync.synced')
  if (status === 'syncing') return t('sync.syncing')
  if (status === 'warning') return t('sync.warning')
  if (status === 'offline') return t('sync.offline')
  if (status === 'error' && lastErrorCode) {
    const key = `sync.errorCode.${lastErrorCode}` as const
    return t(key)
  }
  if (status === 'error') return t('sync.error')
  return t('sync.idle')
}

function getCtaLabel(
  lastErrorCode: SyncErrorCode | null,
  lastErrorRetryable: boolean,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (lastErrorCode === 'AUTH') return t('sync.cta.reLogin')
  if (lastErrorCode === 'NETWORK' || lastErrorCode === 'TIMEOUT' || lastErrorCode === 'SERVER')
    return t('sync.cta.retry')
  if (lastErrorCode === 'RATE_LIMIT') return t('sync.cta.wait')
  if (lastErrorCode === 'RLS' || lastErrorCode === 'CONSTRAINT' || lastErrorCode === 'VALIDATION')
    return t('sync.cta.contactSupport')
  if (lastErrorRetryable) return t('sync.cta.retry')
  return t('sync.cta.contactSupport')
}

interface SyncStatusPillProps {
  mode?: 'default' | 'issuesOnly'
}

export function SyncStatusPill({ mode = 'default' }: SyncStatusPillProps) {
  const { t, language } = useI18n()
  const sync = useSyncStatus()
  const [isDetailsVisible, setIsDetailsVisible] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isRepairing, setIsRepairing] = useState(false)
  const displayStatus: SyncPillStatus =
    sync.status === 'synced' && sync.hasScheduleWarning ? 'warning' : sync.status
  const isIdle = sync.status === 'idle'
  const isActionable =
    displayStatus === 'error' || displayStatus === 'offline' || displayStatus === 'warning'
  const hideInIssuesOnlyMode =
    mode === 'issuesOnly' && (displayStatus === 'synced' || displayStatus === 'syncing')
  const errorCodeLabel =
    sync.lastErrorCode && displayStatus === 'error'
      ? t(`sync.errorCode.${sync.lastErrorCode}` as const)
      : null
  const detailMessage = errorCodeLabel
    ? errorCodeLabel
    : sync.errorMessage?.trim()
      ? sync.errorMessage
      : displayStatus === 'offline'
        ? t('sync.offlineDetail')
        : displayStatus === 'warning'
          ? t('sync.warningDetail')
          : t('common.unknown')
  const primaryCtaLabel = getCtaLabel(sync.lastErrorCode, sync.lastErrorRetryable, t)
  const errorSource = sync.lastErrorSource ?? 'none'
  const lastAttemptedAt = sync.lastAttemptedAt
    ? formatDateTimeByLanguage(sync.lastAttemptedAt, language)
    : null

  useEffect(() => {
    if (!isActionable) {
      setIsDetailsVisible(false)
      setIsRetrying(false)
      setIsResetting(false)
      setIsRepairing(false)
    }
  }, [isActionable])

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await sync.refresh()
    } finally {
      setIsRetrying(false)
    }
  }

  const handleResetLocalSync = async () => {
    setIsResetting(true)
    try {
      await sync.resetLocalSync()
      await sync.refresh()
    } finally {
      setIsResetting(false)
    }
  }

  const handleRepairScheduleData = async () => {
    setIsRepairing(true)
    try {
      await sync.repairScheduleData()
      setIsDetailsVisible(false)
    } finally {
      setIsRepairing(false)
    }
  }

  const showRepairCTA = sync.hasScheduleWarning || sync.lastRoutinesPlansRecoverableError

  if (isIdle || hideInIssuesOnlyMode) return null

  return (
    <>
      <Box flexDirection="row" alignItems="center" gap="sm" marginBottom="sm" flexWrap="wrap">
        <Chip
          testID="syncPill:chip"
          accessibilityLabel={getLabel(displayStatus, t, sync.lastErrorCode)}
          label={getLabel(displayStatus, t, sync.lastErrorCode)}
          variant={getVariant(displayStatus)}
          onPress={isActionable ? () => setIsDetailsVisible(true) : undefined}
        />
        {sync.pendingCount > 0 ? (
          <Text variant="bodySm" color="textMuted">
            {t('sync.pendingCount', { count: String(sync.pendingCount) })}
          </Text>
        ) : null}
      </Box>

      <Modal
        visible={isDetailsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDetailsVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text
              variant="label"
              color={
                displayStatus === 'offline' || displayStatus === 'warning' ? 'warning' : 'error'
              }
            >
              {displayStatus === 'offline'
                ? t('sync.offline')
                : displayStatus === 'warning'
                  ? t('sync.warning')
                  : t('sync.error')}
            </Text>
            <Text marginTop="sm" variant="bodySm" color="textMuted">
              {detailMessage}
            </Text>
            <Text marginTop="xs" variant="bodySm" color="textMuted">
              {t('sync.details.source', { source: errorSource })}
            </Text>
            <Text marginTop="xs" variant="bodySm" color="textMuted">
              {t('sync.details.outboxBlocked', {
                count: sync.lastOutboxBlocked,
              })}
            </Text>
            <Text marginTop="xs" variant="bodySm" color="textMuted">
              {t('sync.details.outboxOffline', {
                value: sync.lastOutboxOffline ? t('common.yes') : t('common.no'),
              })}
            </Text>
            <Text marginTop="xs" variant="bodySm" color="textMuted">
              {t('sync.details.outboxPausedByAuth', {
                value: sync.lastOutboxPausedByAuth ? t('common.yes') : t('common.no'),
              })}
            </Text>
            <Text marginTop="xs" variant="bodySm" color="textMuted">
              {t('sync.details.scheduleStatus', {
                status: sync.lastRoutinesPlansStatus,
              })}
            </Text>
            {ENABLE_ROUTINE_PLAN_SYNC && sync.lastRoutinesPlansWarningCount > 0 ? (
              <Text marginTop="xs" variant="bodySm" color="textMuted">
                {t('sync.scheduleWarnings', {
                  count: sync.lastRoutinesPlansWarningCount,
                })}
              </Text>
            ) : null}
            {ENABLE_ROUTINE_PLAN_SYNC && sync.lastRoutinesPlansQuarantinedCount > 0 ? (
              <Text marginTop="xs" variant="bodySm" color="textMuted">
                {t('sync.scheduleQuarantined', {
                  count: sync.lastRoutinesPlansQuarantinedCount,
                })}
              </Text>
            ) : null}
            {ENABLE_ROUTINE_PLAN_SYNC && sync.lastRoutinesPlansQuarantineReasons.length > 0 ? (
              <Text marginTop="xs" variant="bodySm" color="textMuted">
                {t('sync.scheduleReasons', {
                  reasons: sync.lastRoutinesPlansQuarantineReasons.join(', '),
                })}
              </Text>
            ) : null}
            {lastAttemptedAt ? (
              <Text marginTop="xs" variant="bodySm" color="textMuted">
                {t('sync.lastAttemptedAt', { time: lastAttemptedAt })}
              </Text>
            ) : null}

            <Box marginTop="md" gap="sm">
              <Button
                title={primaryCtaLabel}
                variant="secondary"
                loading={isRetrying}
                onPress={() => {
                  void handleRetry()
                }}
              />
              {showRepairCTA ? (
                <Button
                  title={
                    isRepairing ? t('sync.repairScheduleDataRunning') : t('sync.repairScheduleData')
                  }
                  variant="secondary"
                  loading={isRepairing}
                  onPress={() => {
                    void handleRepairScheduleData()
                  }}
                />
              ) : null}
              {__DEV__ ? (
                <Button
                  title={t('sync.resetLocalDev')}
                  variant="secondary"
                  loading={isResetting}
                  onPress={() => {
                    void handleResetLocalSync()
                  }}
                />
              ) : null}
              <Button
                title={t('common.close')}
                variant="ghost"
                onPress={() => setIsDetailsVisible(false)}
              />
            </Box>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: 'flex-end',
  },
  card: {
    marginHorizontal: spacing[5],
    marginBottom: spacing[8],
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing[5],
  },
})
