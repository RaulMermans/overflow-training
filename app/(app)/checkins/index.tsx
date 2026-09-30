import { useCallback, useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Image,
  InteractionManager,
  Modal,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { AppHeader, Box, Card, EmptyState, ListRow, Screen, Text } from '../../../src/components/ui'
import { useAuth } from '../../../src/auth/useAuth'
import { useI18n } from '../../../src/i18n/useI18n'
import { formatDateTimeByLanguage } from '../../../src/i18n/formatters'
import {
  addCheckinFromPicker,
  deleteCheckin,
  listCheckins,
  type CheckinEntry,
} from '../../../src/features/checkins/storage'
import { syncCheckinsCloud } from '../../../src/features/checkins/cloudSync'
import { computeCheckinMilestonePeriodForSave } from '../../../src/features/checkins/milestones'
import { handleTrophyEvent } from '../../../src/features/trophies/service'
import { useTrophyToasts } from '../../../src/features/trophies/ui/TrophyToastHost'
import { colors } from '../../../src/theme'

function formatCheckinDate(iso: string, language: 'en' | 'es', unknownDateLabel: string): string {
  return (
    formatDateTimeByLanguage(
      iso,
      language,
      {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      },
      {
        hour: 'numeric',
        minute: '2-digit',
      },
    ) ?? unknownDateLabel
  )
}

function formatPoseLabel(pose: CheckinEntry['pose'], t: ReturnType<typeof useI18n>['t']): string {
  if (pose === 'side') return t('checkins.pose.side')
  if (pose === 'back') return t('checkins.pose.back')
  return t('checkins.pose.front')
}

export default function CheckinsListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { enqueueToast } = useTrophyToasts()
  const { t, language } = useI18n()

  const [entries, setEntries] = useState<CheckinEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUri, setPreviewUri] = useState<string | null>(null)

  const handleBackWithFallback = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }

    router.replace('/(app)/(tabs)/progress')
  }, [router])

  const handleOpenPreview = useCallback((uri: string) => {
    const trimmedUri = uri.trim()
    if (!trimmedUri) return
    setPreviewUri(trimmedUri)
  }, [])

  const handleClosePreview = useCallback(() => {
    setPreviewUri(null)
  }, [])

  const loadEntries = useCallback(async () => {
    if (!user?.id) {
      setEntries([])
      setIsLoading(false)
      return
    }
    const userId = user.id

    setIsLoading(true)
    setError(null)

    try {
      const nextEntries = await listCheckins(userId)
      setEntries(nextEntries)
    } catch {
      setError(t('checkins.error.load'))
      setEntries([])
    } finally {
      setIsLoading(false)
    }
  }, [t, user?.id])

  useFocusEffect(
    useCallback(() => {
      let isCancelled = false

      void loadEntries().then(() => {
        if (!user?.id || isCancelled) return
        void syncCheckinsCloud(user.id, { pullRemote: true })
          .then(() => {
            if (isCancelled) return
            void loadEntries()
          })
          .catch(() => {
            // Keep local list available if cloud sync fails.
          })
      })

      return () => {
        isCancelled = true
      }
    }, [loadEntries, user?.id]),
  )

  const pickAndSave = useCallback(
    async (source: 'camera' | 'library') => {
      if (!user?.id || isAdding) return
      const userId = user.id

      const permissionResponse =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (!permissionResponse.granted) {
        Alert.alert(
          t('checkins.permission.title'),
          source === 'camera'
            ? t('checkins.permission.cameraBody')
            : t('checkins.permission.libraryBody'),
        )
        return
      }

      const pickerResponse =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.9,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.9,
            })

      if (pickerResponse.canceled) {
        return
      }

      const asset = pickerResponse.assets?.[0]
      if (!asset?.uri) {
        setError(t('checkins.error.readPhoto'))
        return
      }

      setIsAdding(true)
      setError(null)

      try {
        const existingEntries = await listCheckins(userId)
        const savedEntry = await addCheckinFromPicker(userId, asset.uri, {
          takenAtISO: new Date().toISOString(),
          pose: 'front',
          width: asset.width,
          height: asset.height,
        })

        if (!savedEntry) {
          setError(t('checkins.error.save'))
          return
        }

        await loadEntries()
        void syncCheckinsCloud(userId, { pullRemote: false })
          .then(() => {
            void loadEntries()
          })
          .catch(() => {
            // Keep local save path responsive even when cloud sync fails.
          })

        const period = computeCheckinMilestonePeriodForSave(existingEntries, savedEntry.takenAtISO)

        if (period) {
          InteractionManager.runAfterInteractions(() => {
            void handleTrophyEvent(
              {
                type: 'CHECKIN_SAVED',
                period,
                at: new Date().toISOString(),
              },
              userId,
            )
              .then((ids) => {
                ids.forEach((id) => enqueueToast(id))
              })
              .catch(() => {
                // Never block check-in flow on trophy updates.
              })
          })
        }
      } catch {
        setError(t('checkins.error.save'))
      } finally {
        setIsAdding(false)
      }
    },
    [enqueueToast, isAdding, loadEntries, t, user?.id],
  )

  const handleAddPress = useCallback(() => {
    if (!user?.id || isAdding) return

    if (Platform.OS !== 'ios') {
      void pickAndSave('library')
      return
    }

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          t('checkins.action.takePhoto'),
          t('checkins.action.chooseLibrary'),
          t('common.cancel'),
        ],
        cancelButtonIndex: 2,
      },
      (buttonIndex) => {
        if (buttonIndex === 0) {
          void pickAndSave('camera')
        } else if (buttonIndex === 1) {
          void pickAndSave('library')
        }
      },
    )
  }, [isAdding, pickAndSave, t, user?.id])

  const handleDelete = useCallback(
    async (checkinId: string) => {
      if (!user?.id) return
      const userId = user.id

      try {
        await deleteCheckin(userId, checkinId)
        await loadEntries()
      } catch {
        setError(t('checkins.error.delete'))
      }
    },
    [loadEntries, t, user?.id],
  )

  const handleEntryPress = useCallback(
    (entry: CheckinEntry, index: number) => {
      if (Platform.OS !== 'ios') return

      const previous = entries[index + 1] ?? null
      const canCompare = Boolean(previous)

      const options = canCompare
        ? [t('checkins.action.compareWithPrevious'), t('common.delete'), t('common.cancel')]
        : [t('common.delete'), t('common.cancel')]
      const cancelButtonIndex = options.length - 1
      const destructiveButtonIndex = canCompare ? 1 : 0

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          destructiveButtonIndex,
        },
        (buttonIndex) => {
          if (canCompare && buttonIndex === 0 && previous) {
            router.push({
              pathname: '/(app)/checkins/compare',
              params: {
                beforeId: previous.id,
                afterId: entry.id,
              },
            })
            return
          }

          if ((canCompare && buttonIndex === 1) || (!canCompare && buttonIndex === 0)) {
            void handleDelete(entry.id)
          }
        },
      )
    },
    [entries, handleDelete, router, t],
  )

  return (
    <Screen scroll>
      <AppHeader
        title={t('checkins.title')}
        subtitle={t('checkins.subtitle')}
        leftActionLabel={t('common.back')}
        onLeftActionPress={handleBackWithFallback}
        rightActionLabel={isAdding ? t('common.saving') : t('checkins.add')}
        onRightActionPress={handleAddPress}
      />

      {error ? (
        <Card marginBottom="md">
          <Text variant="bodySm" color="error">
            {error}
          </Text>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <Text variant="bodySm" color="textMuted">
            {t('checkins.loading')}
          </Text>
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState
          title={t('checkins.emptyTitle')}
          body={t('checkins.emptyBody')}
          ctaLabel={isAdding ? t('common.saving') : t('checkins.add')}
          onCtaPress={handleAddPress}
        />
      ) : (
        <>
          <Card padding="none">
            {entries.map((entry, index) => {
              const previous = entries[index + 1] ?? null
              const previewUri = entry.photoUri?.trim()

              return (
                <ListRow
                  key={entry.id}
                  label={formatCheckinDate(entry.takenAtISO, language, t('checkins.unknownDate'))}
                  subtitle={formatPoseLabel(entry.pose, t)}
                  value={previous ? t('checkins.action.compare') : t('checkins.action.options')}
                  rightContent={
                    previewUri ? (
                      <RNPressable
                        onPress={(event) => {
                          event.stopPropagation()
                          handleOpenPreview(previewUri)
                        }}
                        accessibilityRole="button"
                        style={styles.thumbnailPressable}
                        hitSlop={8}
                      >
                        {({ pressed }) => (
                          <Image
                            source={{ uri: previewUri }}
                            resizeMode="cover"
                            style={[styles.thumbnail, pressed ? styles.thumbnailPressed : null]}
                          />
                        )}
                      </RNPressable>
                    ) : undefined
                  }
                  onPress={() => handleEntryPress(entry, index)}
                />
              )
            })}
          </Card>

          <Box marginTop="md">
            <Text variant="bodySm" color="textMuted">
              {t('checkins.localFirstHint')}
            </Text>
          </Box>
        </>
      )}

      <Modal
        visible={Boolean(previewUri)}
        transparent
        animationType="fade"
        onRequestClose={handleClosePreview}
      >
        <View style={styles.previewOverlay}>
          <RNPressable
            accessibilityRole="button"
            onPress={handleClosePreview}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.previewContent}>
            <RNPressable
              onPress={(event) => {
                event.stopPropagation()
              }}
              style={styles.previewImageFrame}
            >
              {previewUri ? (
                <Image
                  source={{ uri: previewUri }}
                  resizeMode="contain"
                  style={styles.previewImage}
                />
              ) : null}
            </RNPressable>

            <RNPressable
              accessibilityRole="button"
              onPress={handleClosePreview}
              style={styles.previewCloseButton}
            >
              {({ pressed }) => (
                <Text variant="labelSm" color="textPrimary" opacity={pressed ? 0.8 : 1}>
                  {t('common.close')}
                </Text>
              )}
            </RNPressable>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

const styles = StyleSheet.create({
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: colors.bg.secondary,
  },
  thumbnailPressable: {
    borderRadius: 8,
  },
  thumbnailPressed: {
    opacity: 0.85,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  previewContent: {
    width: '100%',
    alignItems: 'center',
  },
  previewImageFrame: {
    width: '100%',
    maxWidth: 420,
    aspectRatio: 3 / 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewCloseButton: {
    minHeight: 44,
    minWidth: 88,
    marginTop: 12,
    borderRadius: 999,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
})
