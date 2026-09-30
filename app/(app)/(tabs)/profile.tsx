import { useCallback, useMemo, useState } from 'react'
import { RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import {
  ActionSheetIOS,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  Screen,
  Box,
  Text,
  Card,
  Input,
  ListRow,
  SectionHeader,
  LoadingState,
  ErrorState,
  Button,
  SegmentedControl,
  ArchetypeIcon,
} from '../../../src/components/ui'
import { ArchetypePicker } from '../../../src/features/identity/ArchetypePicker'
import { getArchetypeById } from '../../../src/features/identity/archetypes'
import { useAuth } from '../../../src/auth/useAuth'
import { useI18n } from '../../../src/i18n/useI18n'
import type { TranslationKey } from '../../../src/i18n'
import { fetchCompletedWorkoutCount, fetchProgressExercisePRs } from '../../../src/db/progress'
import { sanitizeErrorMessage } from '../../../src/utils/errorMessages'
import {
  loadProfilePreferences,
  saveProfilePreferences,
  type ProfilePreferences,
} from '../../../src/lib/profilePreferences'
import { loadWeeklyWorkoutsGoal, saveWeeklyWorkoutsGoal } from '../../../src/db/userSettings'
import { colors } from '../../../src/theme/tokens'
import { ENABLE_NOTIFICATIONS } from '../../../src/config/featureFlags'
import { getGoogleCalendarFeatureState } from '../../../src/features/googleCalendar/googleCalendarConfig'
import { APP_LINKS } from '../../../src/config/appLinks'
import { capture } from '../../../src/analytics/posthogClient'
import {
  getNotificationPermissionStatus,
  requestNotificationPermissions,
  type PermissionStatus,
} from '../../../src/lib/notifications/permissions'
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '../../../src/lib/notifications/preferences'
import {
  scheduleWorkoutReminder,
  cancelAllReminders,
} from '../../../src/lib/notifications/scheduler'
import type { NotificationPreferences } from '../../../src/lib/notifications/types'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../../src/lib/notifications/types'

function maskEmail(raw: string): string {
  const [local, domain] = raw.split('@')
  if (!local || !domain) return '***@***.com'
  const maskedLocal = local[0] + '***'
  const parts = domain.split('.')
  const maskedDomain = parts[0][0] + '***.' + (parts.slice(1).join('.') || 'com')
  return `${maskedLocal}@${maskedDomain}`
}

interface ProfileStats {
  totalWorkouts: number
  prCount: number
}

export default function ProfileScreen() {
  const router = useRouter()
  const { user, signOut, deleteAccount } = useAuth()
  const { t, language, setLanguage } = useI18n()
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [preferences, setPreferences] = useState<ProfilePreferences>({
    units: 'kg',
    restTimerSeconds: 90,
  })
  const [weeklyGoal, setWeeklyGoal] = useState(4)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showArchetypePicker, setShowArchetypePicker] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [notifPermission, setNotifPermission] = useState<PermissionStatus>('undetermined')
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  })

  const loadProfile = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!user) {
        setStats(null)
        setIsLoading(false)
        return
      }

      if (!opts?.silent) setIsLoading(true)
      setError(null)

      const [
        { data: completedCount, error: workoutsError },
        { data: allTimePRs, error: progressError },
        loadedPreferences,
        weeklyGoalValue,
        notifPermissionStatus,
        notifPrefsLoaded,
      ] = await Promise.all([
        fetchCompletedWorkoutCount(user.id),
        fetchProgressExercisePRs(),
        loadProfilePreferences(user.id),
        loadWeeklyWorkoutsGoal(user.id),
        ENABLE_NOTIFICATIONS
          ? getNotificationPermissionStatus()
          : Promise.resolve('undetermined' as PermissionStatus),
        ENABLE_NOTIFICATIONS
          ? loadNotificationPreferences(user.id)
          : Promise.resolve({ ...DEFAULT_NOTIFICATION_PREFERENCES }),
      ])

      if (workoutsError || progressError) {
        setError(
          sanitizeErrorMessage(
            workoutsError?.message ?? progressError?.message ?? t('profile.errorLoad'),
          ),
        )
        setStats(null)
        if (!opts?.silent) setIsLoading(false)
        return
      }

      setStats({
        totalWorkouts: completedCount ?? 0,
        prCount: (allTimePRs ?? []).length,
      })
      setPreferences(loadedPreferences)
      setWeeklyGoal(weeklyGoalValue)
      setNotifPermission(notifPermissionStatus)
      setNotifPrefs(notifPrefsLoaded)
      if (!opts?.silent) setIsLoading(false)
    },
    [t, user],
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadProfile({ silent: true })
    setRefreshing(false)
  }, [loadProfile])

  useFocusEffect(
    useCallback(() => {
      loadProfile()
    }, [loadProfile]),
  )

  const email = useMemo(
    () => (user?.email ? maskEmail(user.email) : t('common.unknown')),
    [user, t],
  )
  const googleCalendarFeature = getGoogleCalendarFeatureState()

  const updatePreferences = async (next: ProfilePreferences) => {
    setPreferences(next)
    await (user ? saveProfilePreferences(user.id, next) : saveProfilePreferences(next))
  }

  const updateWeeklyGoal = async (nextGoal: number) => {
    if (!user) return
    const normalizedGoal = await saveWeeklyWorkoutsGoal(user.id, nextGoal)
    setWeeklyGoal(normalizedGoal)
  }

  const handleRestTimerPress = () => {
    const options = [60, 90, 120, 180]
    if (Platform.OS !== 'ios') {
      const currentIndex = options.findIndex((value) => value === preferences.restTimerSeconds)
      const nextIndex = (currentIndex + 1) % options.length
      void updatePreferences({ ...preferences, restTimerSeconds: options[nextIndex] })
      return
    }

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...options.map((value) => `${value} ${t('common.sec')}`), t('common.cancel')],
        cancelButtonIndex: options.length,
        title: t('profile.restTimerTitle'),
      },
      (buttonIndex) => {
        if (buttonIndex >= 0 && buttonIndex < options.length) {
          void updatePreferences({ ...preferences, restTimerSeconds: options[buttonIndex] })
        }
      },
    )
  }

  const handleLanguagePress = () => {
    if (Platform.OS !== 'ios') {
      void setLanguage(language === 'en' ? 'es' : 'en')
      return
    }

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          t('profile.languageDisplay.en'),
          t('profile.languageDisplay.es'),
          t('common.cancel'),
        ],
        cancelButtonIndex: 2,
        title: t('profile.languageTitle'),
      },
      (buttonIndex) => {
        if (buttonIndex === 0) void setLanguage('en')
        else if (buttonIndex === 1) void setLanguage('es')
      },
    )
  }

  const handleRequestNotifPermission = async () => {
    const status = await requestNotificationPermissions()
    setNotifPermission(status)
    if (status === 'granted' && user) {
      const nextPrefs = { ...notifPrefs, enabled: true }
      setNotifPrefs(nextPrefs)
      await saveNotificationPreferences(user.id, nextPrefs)
      await scheduleWorkoutReminder(user.id)
    }
  }

  const handleToggleReminders = async (enabled: boolean) => {
    if (!user) return
    const nextPrefs = { ...notifPrefs, enabled }
    setNotifPrefs(nextPrefs)
    await saveNotificationPreferences(user.id, nextPrefs)
    if (enabled) {
      await scheduleWorkoutReminder(user.id)
    } else {
      await cancelAllReminders()
    }
  }

  const handleReminderTimePress = () => {
    if (!user) return
    const hours = [6, 7, 8, 9, 10, 18, 19, 20]
    if (Platform.OS !== 'ios') {
      const currentIndex = hours.findIndex((h) => h === notifPrefs.reminderHour)
      const nextIndex = (currentIndex + 1) % hours.length
      const nextPrefs = { ...notifPrefs, reminderHour: hours[nextIndex], reminderMinute: 0 }
      setNotifPrefs(nextPrefs)
      void saveNotificationPreferences(user.id, nextPrefs).then(() =>
        scheduleWorkoutReminder(user.id),
      )
      return
    }

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          ...hours.map((h) => {
            const ampm = h < 12 ? t('common.am') : t('common.pm')
            const display = h <= 12 ? h : h - 12
            return `${display}:00 ${ampm}`
          }),
          t('common.cancel'),
        ],
        cancelButtonIndex: hours.length,
        title: t('notifications.reminderTime'),
      },
      (buttonIndex) => {
        if (buttonIndex >= 0 && buttonIndex < hours.length) {
          const nextPrefs = { ...notifPrefs, reminderHour: hours[buttonIndex], reminderMinute: 0 }
          setNotifPrefs(nextPrefs)
          void saveNotificationPreferences(user.id, nextPrefs).then(() =>
            scheduleWorkoutReminder(user.id),
          )
        }
      },
    )
  }

  const handleSignOut = async () => {
    setIsSigningOut(true)
    setError(null)
    try {
      await signOut()
    } catch (err) {
      setError(sanitizeErrorMessage(err instanceof Error ? err.message : t('profile.errorSignOut')))
    } finally {
      setIsSigningOut(false)
    }
  }

  const handleDeleteAccount = () => {
    capture('account_delete_initiated')
    setDeleteConfirmText('')
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    setShowDeleteModal(false)
    setIsDeletingAccount(true)
    setError(null)
    try {
      await deleteAccount()
      capture('account_deleted')
    } catch (err) {
      capture('account_delete_failed')
      setError(
        sanitizeErrorMessage(err instanceof Error ? err.message : t('profile.errorDeleteAccount')),
      )
    } finally {
      setIsDeletingAccount(false)
    }
  }

  if (!user) {
    return (
      <Screen scroll={false}>
        <Box flex={1} justifyContent="center" alignItems="center">
          <Text variant="h2">{t('profile.title')}</Text>
          <Text marginTop="sm" variant="bodySm" color="textMuted">
            {t('profile.signedOut')}
          </Text>
          <Button
            title={t('profile.signIn')}
            marginTop="lg"
            onPress={() => router.replace('/(auth)/login')}
          />
        </Box>
      </Screen>
    )
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.accent.primary}
        />
      }
    >
      {error ? (
        <ErrorState message={error} retryLabel={t('common.reload')} onRetry={loadProfile} />
      ) : null}

      {/* Identity hero — archetype icon + stats */}
      <Box
        alignItems="center"
        paddingTop="xl"
        paddingBottom="2xl"
        backgroundColor="surface"
        accessible
        accessibilityRole="summary"
        accessibilityLabel={t('profile.identityA11y', { email })}
      >
        <Box marginBottom="lg">
          <ArchetypeIcon archetypeId={preferences.archetypeId} size={96} showBorder />
        </Box>

        <Text variant="bodySm" color="textMuted" marginBottom="xs">
          {email}
        </Text>
        <Text variant="micro" color="accent" style={{ fontWeight: '600', letterSpacing: 0.4 }}>
          {t('profile.memberBadge')}
        </Text>
        <Text variant="micro" color="textMuted" marginTop="xs">
          {t('profile.established', {
            year: user.created_at
              ? String(new Date(user.created_at).getFullYear())
              : String(new Date().getFullYear()),
          })}
        </Text>

        <Box flexDirection="row" marginTop="xl" paddingHorizontal="xl">
          <Box
            flex={1}
            alignItems="center"
            accessible
            accessibilityLabel={`${stats?.totalWorkouts ?? 0} ${t('profile.workouts')}`}
          >
            <Text variant="h2" testID="profile:workoutsCount">
              {isLoading ? '—' : String(stats?.totalWorkouts ?? 0)}
            </Text>
            <Text variant="micro" color="textMuted" style={{ letterSpacing: 0.8 }}>
              {t('profile.workouts')}
            </Text>
          </Box>
          <Box width={1} backgroundColor="borderSubtle" marginHorizontal="lg" />
          <Box
            flex={1}
            alignItems="center"
            accessible
            accessibilityLabel={`${stats?.prCount ?? 0} ${t('profile.prs')}`}
          >
            <Text variant="h2">{isLoading ? '—' : String(stats?.prCount ?? 0)}</Text>
            <Text variant="micro" color="textMuted" style={{ letterSpacing: 0.8 }}>
              {t('profile.prs')}
            </Text>
          </Box>
        </Box>
      </Box>

      {isLoading ? (
        <LoadingState message={t('profile.loading')} />
      ) : (
        <Box paddingHorizontal="lg" paddingTop="lg">
          <SectionHeader title={t('profile.preferences')} variant="dense" />
          <Card padding="none" marginBottom="xl" style={{ borderTopWidth: 0 }}>
            <ListRow
              title={t('profile.identity')}
              rightMeta={t(getArchetypeById(preferences.archetypeId).nameKey)}
              showChevron
              onPress={() => setShowArchetypePicker(true)}
            />
            <ListRow
              title={t('profile.restTimer')}
              rightMeta={`${preferences.restTimerSeconds}s`}
              valueVariant="tabular"
              showChevron
              onPress={handleRestTimerPress}
            />
            <ListRow
              title={t('profile.language')}
              rightMeta={t(`profile.languageDisplay.${language}` as TranslationKey)}
              showChevron
              onPress={handleLanguagePress}
            />
          </Card>

          {ENABLE_NOTIFICATIONS ? (
            <>
              <SectionHeader title={t('notifications.sectionTitle')} variant="dense" />
              <Card padding="none" marginBottom="xl">
                {notifPermission === 'granted' ? (
                  <>
                    <ListRow
                      title={t('notifications.reminders')}
                      rightContent={
                        <SegmentedControl
                          options={[
                            { value: 'on', label: t('common.on') },
                            { value: 'off', label: t('common.off') },
                          ]}
                          value={notifPrefs.enabled ? 'on' : 'off'}
                          onChange={(value) => {
                            void handleToggleReminders(value === 'on')
                          }}
                        />
                      }
                    />
                    {notifPrefs.enabled ? (
                      <ListRow
                        title={t('notifications.reminderTime')}
                        rightMeta={(() => {
                          const h = notifPrefs.reminderHour
                          const ampm = h < 12 ? t('common.am') : t('common.pm')
                          const display = h <= 12 ? h : h - 12
                          return `${display}:00 ${ampm}`
                        })()}
                        showChevron
                        onPress={handleReminderTimePress}
                      />
                    ) : null}
                  </>
                ) : notifPermission === 'denied' ? (
                  <ListRow
                    title={t('notifications.permissionDenied')}
                    rightMeta={t('notifications.openSettings')}
                    showChevron
                    onPress={() => Linking.openSettings()}
                  />
                ) : (
                  <ListRow
                    title={t('notifications.permissionNeeded')}
                    rightMeta={t('notifications.permissionAllow')}
                    showChevron
                    onPress={() => {
                      void handleRequestNotifPermission()
                    }}
                  />
                )}
              </Card>
            </>
          ) : null}

          {googleCalendarFeature.isVisible ? (
            <>
              <SectionHeader title={t('profile.integrations')} variant="dense" />
              <Card padding="none" marginBottom="xl">
                <ListRow
                  title={t('profile.googleCalendar')}
                  rightMeta={
                    googleCalendarFeature.isConfigured
                      ? undefined
                      : t('googleCalendar.action.configRequired')
                  }
                  showChevron
                  onPress={() => router.push('/(app)/integrations/google-calendar')}
                />
              </Card>
            </>
          ) : null}

          <SectionHeader title={t('profile.goals')} variant="dense" />
          <Card padding="none" marginBottom="xl">
            <ListRow
              title={t('profile.weeklyWorkoutsGoal')}
              rightContent={
                <Box
                  backgroundColor="accentPrimaryMuted"
                  paddingHorizontal="md"
                  paddingVertical="xs"
                  borderRadius="full"
                >
                  <Text variant="micro" color="accent" style={{ fontWeight: '800' }}>
                    {t('profile.weeklyGoalValue', { count: String(weeklyGoal) })}
                  </Text>
                </Box>
              }
              showChevron={false}
            />
            <Box padding="md">
              <SegmentedControl
                options={[2, 3, 4, 5, 6].map((value) => ({
                  value: String(value),
                  label: String(value),
                }))}
                value={String(weeklyGoal)}
                onChange={(value) => {
                  const nextGoal = Number(value)
                  if (!Number.isFinite(nextGoal)) return
                  void updateWeeklyGoal(nextGoal)
                }}
              />
            </Box>
          </Card>

          <SectionHeader title={t('trophies.title').toUpperCase()} variant="dense" />
          <Card padding="none" marginBottom="xl">
            <ListRow
              title={t('trophies.title')}
              showChevron
              onPress={() => router.push('/(app)/trophies')}
            />
          </Card>

          <SectionHeader title={t('profile.legal')} variant="dense" />
          <Card padding="none" marginBottom="xl">
            <ListRow
              title={t('profile.privacyPolicy')}
              showChevron
              onPress={() => Linking.openURL(APP_LINKS.privacy)}
            />
            <ListRow
              title={t('profile.termsOfService')}
              showChevron
              onPress={() => Linking.openURL(APP_LINKS.terms)}
            />
            <ListRow
              title={t('profile.support')}
              showChevron
              onPress={() => Linking.openURL(APP_LINKS.support)}
            />
          </Card>

          <SectionHeader title={t('profile.account')} variant="dense" />
          <Card padding="none" marginBottom="2xl">
            <ListRow
              testID="profile:signOutButton"
              title={isSigningOut ? t('profile.signingOut') : t('profile.signOut')}
              showChevron
              disabled={isSigningOut || isDeletingAccount}
              onPress={handleSignOut}
            />
            <ListRow
              title={isDeletingAccount ? t('profile.deletingAccount') : t('profile.deleteAccount')}
              destructive
              showChevron={false}
              disabled={isSigningOut || isDeletingAccount}
              onPress={handleDeleteAccount}
            />
          </Card>
        </Box>
      )}

      <ArchetypePicker
        visible={showArchetypePicker}
        selectedId={preferences.archetypeId}
        onSelect={(archetypeId) => {
          void updatePreferences({ ...preferences, archetypeId })
        }}
        onClose={() => setShowArchetypePicker(false)}
      />

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowDeleteModal(false)
        }}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Box
              backgroundColor="surface"
              paddingHorizontal="xl"
              paddingTop="xl"
              paddingBottom="2xl"
              style={styles.modalSheet}
            >
              <Text variant="h3" color="error" marginBottom="sm">
                {t('profile.deleteAccountModalTitle')}
              </Text>
              <Text variant="bodySm" color="textMuted">
                {t('profile.deleteAccountModalBody')}
              </Text>
              <Text variant="label" marginTop="lg" marginBottom="sm">
                {t('profile.deleteAccountTypePrompt')}
              </Text>
              <Input
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder={t('profile.deleteAccountTypePlaceholder')}
                autoCapitalize="characters"
                autoCorrect={false}
                invalid={deleteConfirmText.length > 0 && deleteConfirmText !== 'DELETE'}
              />
              <Box gap="sm" marginTop="lg">
                <Button
                  title={t('profile.deleteAccountConfirmAction')}
                  variant="destructive"
                  disabled={deleteConfirmText !== 'DELETE' || isDeletingAccount}
                  isLoading={isDeletingAccount}
                  onPress={() => {
                    void confirmDelete()
                  }}
                />
                <Button
                  title={t('common.cancel')}
                  variant="secondary"
                  onPress={() => {
                    setShowDeleteModal(false)
                  }}
                />
              </Box>
            </Box>
          </KeyboardAvoidingView>
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
