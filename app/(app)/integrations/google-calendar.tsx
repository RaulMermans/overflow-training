import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActionSheetIOS, Modal, Platform, StyleSheet, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import {
  Screen,
  Box,
  Text,
  Card,
  ListRow,
  SectionHeader,
  Button,
  SegmentedControl,
  LoadingState,
  ErrorState,
} from '../../../src/components/ui'
import { useAuth } from '../../../src/auth/useAuth'
import { useI18n } from '../../../src/i18n/useI18n'
import type { TranslationKey } from '../../../src/i18n'
import { getGoogleCalendarFeatureState } from '../../../src/features/googleCalendar/googleCalendarConfig'
import { useGoogleCalendarSync } from '../../../src/features/googleCalendar/useGoogleCalendarSync'
import type { CalendarListEntry } from '../../../src/features/googleCalendar/types'

export default function GoogleCalendarScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { t } = useI18n()
  const googleCalendarFeature = getGoogleCalendarFeatureState()
  const {
    connection,
    availableCalendars,
    isLoading,
    isConnecting,
    isSyncing,
    error,
    needsReconnect,
    connectGoogleCalendar,
    disconnectGoogleCalendar,
    setSelectedCalendar,
    setSyncEnabled,
    reSync,
    reload,
  } = useGoogleCalendarSync()

  // Guard: redirect away only when the feature flag is off. If build-time config
  // is missing, keep the screen reachable so direct/manual navigation still fails
  // gracefully with the missing-config state instead of exposing the entry point.
  useEffect(() => {
    if (!googleCalendarFeature.isFeatureEnabled) {
      router.replace('/(app)/(tabs)/profile')
    }
  }, [googleCalendarFeature.isFeatureEnabled, router])

  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  if (!googleCalendarFeature.isFeatureEnabled) return null

  const isConnected = connection?.status === 'connected' && !needsReconnect
  const statusText = isConnected
    ? t('googleCalendar.status.connected')
    : needsReconnect
      ? t('googleCalendar.status.reconnect')
      : t('googleCalendar.status.disconnected')
  const errorMessage = error ? t(`googleCalendar.error.${error.code}` as TranslationKey) : null

  const handleCalendarPicker = useCallback(
    (calendars: CalendarListEntry[]) => {
      if (!calendars.length || Platform.OS !== 'ios') return

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...calendars.map((calendar) => calendar.summary), t('common.cancel')],
          cancelButtonIndex: calendars.length,
          title: t('googleCalendar.calendarPickerTitle'),
        },
        (buttonIndex) => {
          const selected = calendars[buttonIndex]
          if (selected) {
            void setSelectedCalendar(selected.id, selected.summary)
          }
        },
      )
    },
    [setSelectedCalendar, t],
  )

  const handleDisconnectConfirm = useCallback(async () => {
    setShowDisconnectModal(false)
    setIsDisconnecting(true)
    try {
      await disconnectGoogleCalendar()
    } finally {
      setIsDisconnecting(false)
    }
  }, [disconnectGoogleCalendar])

  const connectLabel = useMemo(() => {
    if (!googleCalendarFeature.isConfigured) return t('googleCalendar.action.configRequired')
    if (needsReconnect) return t('googleCalendar.action.reconnect')
    return t('googleCalendar.action.connect')
  }, [googleCalendarFeature.isConfigured, needsReconnect, t])

  if (!user) return null

  return (
    <Screen>
      <Stack.Screen
        options={{ title: t('googleCalendar.title'), headerBackTitle: t('tabs.profile') }}
      />

      {isLoading ? (
        <LoadingState message={t('googleCalendar.loading')} />
      ) : (
        <Box paddingHorizontal="lg" paddingTop="lg">
          {errorMessage ? (
            <ErrorState message={errorMessage} retryLabel={t('common.reload')} onRetry={reload} />
          ) : null}

          <Card padding="md" marginBottom="xl">
            <Box gap="sm">
              <Text variant="body">{t('googleCalendar.summary')}</Text>
              <Text variant="bodySm" color="textMuted">
                {t('googleCalendar.detail.appUpdates')}
              </Text>
              <Text variant="bodySm" color="textMuted">
                {t('googleCalendar.detail.googleNoWriteback')}
              </Text>
            </Box>
          </Card>

          <SectionHeader title={t('googleCalendar.section.connection')} variant="dense" />
          <Card padding="none" marginBottom="xl">
            <Box padding="lg" gap="xs">
              <Text variant="body">{statusText}</Text>
              <Text variant="bodySm" color="textMuted">
                {needsReconnect
                  ? t('googleCalendar.connection.needsReconnect')
                  : isConnected
                    ? t('googleCalendar.connection.connectedBody')
                    : t('googleCalendar.connection.disconnectedBody')}
              </Text>
              {!googleCalendarFeature.isConfigured ? (
                <Text variant="bodySm" color="error">
                  {t('googleCalendar.error.missingConfig')}
                </Text>
              ) : null}
              {connection?.lastError && needsReconnect ? (
                <Text variant="bodySm" color="error">
                  {connection.lastError}
                </Text>
              ) : null}
            </Box>

            {isConnected || needsReconnect ? (
              <Box padding="md" gap="sm">
                <Button
                  title={isConnecting ? t('googleCalendar.action.connecting') : connectLabel}
                  isLoading={isConnecting}
                  disabled={isConnecting || !googleCalendarFeature.isConfigured}
                  onPress={() => {
                    void connectGoogleCalendar()
                  }}
                />
                <Button
                  title={
                    isDisconnecting
                      ? t('googleCalendar.action.disconnecting')
                      : t('googleCalendar.action.disconnect')
                  }
                  variant="secondary"
                  disabled={isDisconnecting || isSyncing}
                  onPress={() => setShowDisconnectModal(true)}
                />
              </Box>
            ) : (
              <Box padding="md">
                <Button
                  title={isConnecting ? t('googleCalendar.action.connecting') : connectLabel}
                  isLoading={isConnecting}
                  disabled={isConnecting || !googleCalendarFeature.isConfigured}
                  onPress={() => {
                    void connectGoogleCalendar()
                  }}
                />
              </Box>
            )}
          </Card>

          {connection ? (
            <>
              <SectionHeader title={t('googleCalendar.section.calendar')} variant="dense" />
              <Card padding="none" marginBottom="xl">
                <ListRow
                  title={t('googleCalendar.calendarRow')}
                  rightMeta={connection.selectedCalendarSummary ?? connection.selectedCalendarId}
                  showChevron={availableCalendars.length > 0}
                  onPress={
                    availableCalendars.length > 0
                      ? () => handleCalendarPicker(availableCalendars)
                      : undefined
                  }
                />
                {availableCalendars.length === 0 ? (
                  <ListRow
                    title={t('googleCalendar.reloadCalendars')}
                    rightMeta={t('common.reload')}
                    showChevron
                    onPress={() => {
                      void reload()
                    }}
                  />
                ) : null}
              </Card>

              <SectionHeader title={t('googleCalendar.section.sync')} variant="dense" />
              <Card padding="none" marginBottom="xl">
                <ListRow
                  title={t('googleCalendar.syncToggle')}
                  rightContent={
                    <SegmentedControl
                      options={[
                        { value: 'on', label: t('common.on') },
                        { value: 'off', label: t('common.off') },
                      ]}
                      value={connection.syncEnabled ? 'on' : 'off'}
                      onChange={(value) => {
                        void setSyncEnabled(value === 'on')
                      }}
                    />
                  }
                />
                <ListRow
                  title={
                    isSyncing
                      ? t('googleCalendar.action.syncing')
                      : t('googleCalendar.action.repair')
                  }
                  rightMeta={t('googleCalendar.repairMeta')}
                  showChevron
                  disabled={isSyncing || !connection.syncEnabled}
                  onPress={() => {
                    void reSync()
                  }}
                />
              </Card>
            </>
          ) : null}
        </Box>
      )}

      <Modal
        visible={showDisconnectModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDisconnectModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Box
            backgroundColor="surface"
            paddingHorizontal="xl"
            paddingTop="xl"
            paddingBottom="2xl"
            style={styles.modalSheet}
          >
            <Text variant="h3" marginBottom="sm">
              {t('googleCalendar.disconnectTitle')}
            </Text>
            <Text variant="bodySm" color="textMuted">
              {t('googleCalendar.disconnectBody')}
            </Text>
            <Box gap="sm" marginTop="lg">
              <Button
                title={t('googleCalendar.action.disconnect')}
                variant="destructive"
                onPress={() => {
                  void handleDisconnectConfirm()
                }}
              />
              <Button
                title={t('common.cancel')}
                variant="secondary"
                onPress={() => setShowDisconnectModal(false)}
              />
            </Box>
          </Box>
        </View>
      </Modal>
    </Screen>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
})
