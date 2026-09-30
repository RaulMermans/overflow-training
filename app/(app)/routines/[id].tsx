import { useCallback, useMemo, useState } from 'react'
import { Alert, Modal, StyleSheet, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import {
  AppHeader,
  Box,
  Button,
  Card,
  ErrorCard,
  Input,
  ListRow,
  LoadingState,
  Screen,
  SectionHeader,
  Text,
} from '../../../src/components/ui'
import { useAuth } from '../../../src/auth/useAuth'
import { fetchExerciseDefinitionsByIds } from '../../../src/db/workouts'
import {
  deleteRoutine,
  loadRoutineUsage,
  loadRoutines,
  normalizeRoutineSection,
  setPinnedRoutine,
  upsertRoutine,
  type RoutineSection,
  type Routine,
} from '../../../src/lib/routines'
import { toCloudRoutinePayload } from '../../../src/db/routineCloudPayload'
import { deleteCloudRoutine, upsertCloudRoutineWithItems } from '../../../src/db/routinesPlans'
import { colors, radius, spacing } from '../../../src/theme'
import { buildActionableErrorState, sanitizeErrorMessage } from '../../../src/utils/errorMessages'
import { useI18n } from '../../../src/i18n/useI18n'
import type { TranslationKey } from '../../../src/i18n'

const SECTION_TITLE_KEY: Record<RoutineSection, TranslationKey> = {
  warmup: 'routine.sections.warmup',
  main: 'routine.sections.main',
  cooldown: 'routine.sections.cooldown',
}

export default function RoutineDetailScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { t } = useI18n()
  const params = useLocalSearchParams<{ id?: string | string[] }>()
  const routineId = Array.isArray(params.id) ? params.id[0] : params.id

  const [routine, setRoutine] = useState<Routine | null>(null)
  const [exerciseNameById, setExerciseNameById] = useState<Record<string, string>>({})
  const [lastUsedAt, setLastUsedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPinning, setIsPinning] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isNameModalVisible, setIsNameModalVisible] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [error, setError] = useState<unknown | null>(null)

  const loadRoutine = useCallback(async () => {
    if (!user || !routineId) {
      setRoutine(null)
      setError(t('routine.detail.notFound'))
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const [routines, usage] = await Promise.all([
        loadRoutines(user.id),
        loadRoutineUsage(user.id),
      ])
      const target = routines.find((entry) => entry.id === routineId)

      if (!target) {
        setRoutine(null)
        setExerciseNameById({})
        setLastUsedAt(null)
        setError(t('routine.detail.notFound'))
        setIsLoading(false)
        return
      }

      setRoutine(target)
      setNameDraft(target.name)
      setLastUsedAt(usage[target.id]?.lastUsedAt ?? null)

      const definitionIds = target.items.map((item) => item.exerciseDefinitionId)
      const { data } = await fetchExerciseDefinitionsByIds(definitionIds)
      const names = (data ?? []).reduce<Record<string, string>>((acc, definition) => {
        acc[definition.id] = definition.name
        return acc
      }, {})
      setExerciseNameById(names)
    } catch (loadError) {
      setRoutine(null)
      setExerciseNameById({})
      setLastUsedAt(null)
      setError(loadError instanceof Error ? loadError.message : t('routine.detail.errorLoad'))
    }

    setIsLoading(false)
  }, [routineId, t, user])

  useFocusEffect(
    useCallback(() => {
      void loadRoutine()
    }, [loadRoutine]),
  )

  const orderedItems = useMemo(
    () => [...(routine?.items ?? [])].sort((a, b) => a.orderIndex - b.orderIndex),
    [routine?.items],
  )

  const sectionedItems = useMemo(() => {
    const grouped: Record<RoutineSection, typeof orderedItems> = {
      warmup: [],
      main: [],
      cooldown: [],
    }

    for (const item of orderedItems) {
      const section = normalizeRoutineSection(item.section)
      grouped[section].push(item)
    }

    return grouped
  }, [orderedItems])
  const errorState = useMemo(() => {
    if (!error) return null
    return buildActionableErrorState(error)
  }, [error])

  if (!user) {
    return <Redirect href="/(auth)/login" />
  }

  const handleTogglePinned = async () => {
    if (!routine || isPinning) return

    setIsPinning(true)

    try {
      const nextPinned = !routine.pinned
      await setPinnedRoutine(user.id, routine.id, nextPinned)
      const nextRoutine: Routine = {
        ...routine,
        pinned: nextPinned ? true : undefined,
        updatedAt: new Date().toISOString(),
      }
      if (nextRoutine.items.length > 0) {
        const payload = toCloudRoutinePayload(nextRoutine)
        void upsertCloudRoutineWithItems({
          userId: user.id,
          routine: payload.routine,
          items: payload.items,
        })
      }
      setRoutine((current) =>
        current ? { ...current, pinned: nextPinned ? true : undefined } : current,
      )
    } catch (pinError) {
      Alert.alert(
        t('routine.detail.errorPinTitle'),
        sanitizeErrorMessage(
          pinError instanceof Error ? pinError.message : t('routine.detail.errorPinBody'),
        ),
      )
    } finally {
      setIsPinning(false)
    }
  }

  const handleDeleteRoutine = () => {
    if (!routine || isDeleting) return

    Alert.alert(t('routine.detail.deleteTitle'), t('routine.detail.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('routine.detail.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setIsDeleting(true)
            try {
              const cloudDelete = await deleteCloudRoutine({
                userId: user.id,
                routineId: routine.id,
              })

              if (cloudDelete.error) {
                Alert.alert(
                  t('routine.detail.deleteErrorTitle'),
                  sanitizeErrorMessage(cloudDelete.error.message),
                )
                return
              }

              await deleteRoutine(user.id, routine.id)
              router.replace('/(app)/routines')
            } catch (error) {
              Alert.alert(
                t('routine.detail.deleteErrorTitle'),
                sanitizeErrorMessage(
                  error instanceof Error ? error.message : t('routine.detail.deleteErrorBody'),
                ),
              )
            } finally {
              setIsDeleting(false)
            }
          })()
        },
      },
    ])
  }

  const handleEditRoutine = () => {
    if (!routine || isDeleting) return

    router.push({
      pathname: '/(app)/routines/new',
      params: { editId: routine.id },
    })
  }

  const handleSaveName = async () => {
    if (!routine || isRenaming) return

    const trimmed = nameDraft.trim()
    if (!trimmed) {
      Alert.alert(
        t('routine.detail.renameNameRequiredTitle'),
        t('routine.detail.renameNameRequiredBody'),
      )
      return
    }

    setIsRenaming(true)

    try {
      const nextRoutine: Routine = {
        ...routine,
        name: trimmed,
        updatedAt: new Date().toISOString(),
      }

      await upsertRoutine(user.id, nextRoutine)
      if (nextRoutine.items.length > 0) {
        const payload = toCloudRoutinePayload(nextRoutine)
        const cloudResult = await upsertCloudRoutineWithItems({
          userId: user.id,
          routine: payload.routine,
          items: payload.items,
        })
        if (cloudResult.error) {
          const msg = cloudResult.error.message?.toLowerCase() ?? ''
          if (!msg.includes('routine_empty') && !msg.includes('routine must have at least one')) {
            if (
              msg.includes('failed to fetch') ||
              msg.includes('network') ||
              msg.includes('offline') ||
              msg.includes('load failed')
            ) {
              Alert.alert(
                t('routine.detail.renameErrorTitle'),
                t('routine.new.savedLocallyOffline'),
              )
            } else {
              Alert.alert(
                t('routine.detail.renameErrorTitle'),
                sanitizeErrorMessage(cloudResult.error.message),
              )
              return
            }
          }
        }
      }
      setRoutine((current) => (current ? { ...current, name: trimmed } : current))
      setIsNameModalVisible(false)
    } catch (saveError) {
      Alert.alert(
        t('routine.detail.renameErrorTitle'),
        sanitizeErrorMessage(
          saveError instanceof Error ? saveError.message : t('routine.detail.renameErrorBody'),
        ),
      )
    } finally {
      setIsRenaming(false)
    }
  }

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <Box flex={1} justifyContent="center" alignItems="center">
          <LoadingState message={t('routine.detail.loading')} />
        </Box>
      </Screen>
    )
  }

  if (!routine || error) {
    return (
      <Screen>
        <AppHeader
          title={t('routine.detail.titleFallback')}
          subtitle={t('routine.detail.subtitle')}
        />
        <ErrorCard
          title={
            errorState?.kind === 'offline'
              ? t('errors.offline.title')
              : errorState?.kind === 'sync'
                ? t('errors.sync.title')
                : t('errors.generic.title')
          }
          message={
            errorState?.kind === 'offline'
              ? t('errors.offline.message')
              : errorState?.kind === 'sync'
                ? t('errors.sync.message')
                : t('errors.generic.message')
          }
          primaryActionLabel={
            errorState?.primaryAction === 'check_connection'
              ? t('errors.action.checkConnection')
              : t('common.tryAgain')
          }
          onPrimaryAction={() => void loadRoutine()}
          detailsLabel={t('errors.action.details')}
          detailsTitle={t('errors.detailsTitle')}
          details={errorState?.rawMessage ?? null}
          closeLabel={t('common.close')}
        />
        <Box marginTop="md">
          <Button
            title={t('routine.detail.backToRoutines')}
            variant="secondary"
            onPress={() => {
              if (router.canGoBack()) {
                router.back()
                return
              }

              router.replace('/(app)/routines')
            }}
          />
        </Box>
      </Screen>
    )
  }

  const lastUsedText = lastUsedAt
    ? t('routines.lastUsed', {
        date: new Date(lastUsedAt).toLocaleDateString(),
      })
    : t('routines.notStartedYet')

  return (
    <>
      <Screen>
        <AppHeader
          title={routine.name}
          subtitle={t('routines.exerciseCount', {
            count: String(orderedItems.length),
            plural: orderedItems.length === 1 ? '' : 's',
          })}
        />

        <Card>
          <SectionHeader
            title={t('routine.detail.actions')}
            variant="dense"
            actionLabel={t('routine.detail.editName')}
            onActionPress={() => {
              if (!isDeleting) {
                setIsNameModalVisible(true)
              }
            }}
          />

          <Text marginBottom="sm" variant="bodySm" color="textMuted">
            {routine.pinned ? `${t('routines.pinned')} · ` : ''}
            {lastUsedText}
          </Text>

          <Box gap="sm">
            <Button
              title={t('routine.detail.editRoutine')}
              onPress={handleEditRoutine}
              disabled={isDeleting}
            />
            <Button
              title={
                isPinning
                  ? t('routine.detail.updating')
                  : routine.pinned
                    ? t('routine.detail.unpinRoutine')
                    : t('routine.detail.pinRoutine')
              }
              variant="secondary"
              loading={isPinning}
              disabled={isPinning || isDeleting}
              onPress={() => {
                void handleTogglePinned()
              }}
            />
            <Button
              title={isDeleting ? t('routine.detail.deleting') : t('routine.detail.deleteRoutine')}
              variant="destructive"
              loading={isDeleting}
              disabled={isDeleting}
              onPress={handleDeleteRoutine}
            />
          </Box>
        </Card>

        <Box marginTop="xl">
          <SectionHeader title={t('routine.detail.exercises')} variant="dense" />
          {orderedItems.length === 0 ? (
            <Card>
              <Text variant="bodySm" color="textMuted">
                {t('routine.detail.emptyExercises')}
              </Text>
            </Card>
          ) : (
            <>
              {(['warmup', 'main', 'cooldown'] as RoutineSection[]).map((section) => {
                const items = sectionedItems[section]
                if (items.length === 0) return null

                return (
                  <Box key={section} marginBottom="md">
                    <Text marginBottom="sm" variant="labelSm" color="textMuted">
                      {t(SECTION_TITLE_KEY[section])}
                    </Text>
                    <Card padding="none">
                      {items.map((item, index) => {
                        const fallbackName = t('routine.detail.exerciseFallback', {
                          index: index + 1,
                        })
                        const label = exerciseNameById[item.exerciseDefinitionId] ?? fallbackName
                        const subtitle = exerciseNameById[item.exerciseDefinitionId]
                          ? t('routine.sectionOrder', { index: index + 1 })
                          : `${t('routine.sectionOrder', { index: index + 1 })} • ${t('routine.detail.routineUnavailable')}`

                        return (
                          <ListRow
                            key={`${section}-${item.exerciseDefinitionId}-${index}`}
                            label={label}
                            subtitle={subtitle}
                            showChevron={false}
                          />
                        )
                      })}
                    </Card>
                  </Box>
                )
              })}
            </>
          )}
        </Box>
      </Screen>

      <Modal
        visible={isNameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsNameModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text variant="h3">{t('routine.detail.editName')}</Text>
            <Text marginTop="xs" variant="bodySm" color="textMuted">
              {t('routine.detail.renameHint')}
            </Text>

            <Box marginTop="md">
              <Input
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder={t('routine.new.namePlaceholder')}
                autoCapitalize="words"
                editable={!isRenaming}
              />
            </Box>

            <Box marginTop="md" flexDirection="row" gap="sm">
              <Box flex={1}>
                <Button
                  title={t('common.cancel')}
                  variant="secondary"
                  onPress={() => setIsNameModalVisible(false)}
                  disabled={isRenaming}
                />
              </Box>
              <Box flex={1}>
                <Button
                  title={isRenaming ? t('common.saving') : t('common.save')}
                  loading={isRenaming}
                  disabled={isRenaming}
                  onPress={() => {
                    void handleSaveName()
                  }}
                />
              </Box>
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
  modalCard: {
    marginHorizontal: spacing[5],
    marginBottom: spacing[8],
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing[5],
    gap: spacing[3],
  },
})
