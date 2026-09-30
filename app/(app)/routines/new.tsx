import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Modal } from 'react-native'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import {
  AppHeader,
  Box,
  Button,
  Card,
  EmptyState,
  ErrorCard,
  Input,
  LoadingState,
  Pressable,
  Screen,
  Text,
} from '../../../src/components/ui'
import ExerciseSearch from '../../../src/components/ui/ExerciseSearch'
import { useAuth } from '../../../src/auth/useAuth'
import {
  fetchExerciseDefinitionsByIds,
  type ExerciseCategory,
  type ExerciseDefinitionRow,
} from '../../../src/db/workouts'
import {
  loadRoutines,
  upsertRoutine,
  type Routine,
  type RoutineItem,
  type RoutineSection,
} from '../../../src/lib/routines'
import { toCloudRoutinePayload } from '../../../src/db/routineCloudPayload'
import { upsertCloudRoutineWithItems } from '../../../src/db/routinesPlans'
import { listExerciseFavorites, toggleExerciseFavorite } from '../../../src/db/favorites'
import { sanitizeErrorMessage } from '../../../src/utils/errorMessages'
import { generateUuid } from '../../../src/lib/ids'
import { useI18n } from '../../../src/i18n/useI18n'
import type { TranslationKey } from '../../../src/i18n'

function generateRoutineId(): string {
  return generateUuid()
}

type SelectedRoutineExercise = {
  exercise: ExerciseDefinitionRow
  section: RoutineSection
  existingItem?: RoutineItem
}

const SECTION_ORDER: RoutineSection[] = ['warmup', 'main', 'cooldown']

const SECTION_TITLE_KEY: Record<RoutineSection, TranslationKey> = {
  warmup: 'routine.sections.warmup',
  main: 'routine.sections.main',
  cooldown: 'routine.sections.cooldown',
}

const SECTION_PICKER_CONFIG: Record<
  RoutineSection,
  {
    initialCategory: ExerciseCategory
    allowedCategories: ExerciseCategory[]
  }
> = {
  warmup: {
    initialCategory: 'warmup',
    allowedCategories: ['warmup', 'mobility', 'cardio'],
  },
  main: {
    initialCategory: 'strength',
    allowedCategories: ['strength', 'cardio', 'mobility'],
  },
  cooldown: {
    initialCategory: 'stretch',
    allowedCategories: ['stretch', 'mobility'],
  },
}

function inferSectionFromExercise(
  exercise: ExerciseDefinitionRow,
  fallback: RoutineSection,
): RoutineSection {
  if (exercise.category === 'warmup') return 'warmup'
  if (exercise.category === 'stretch') return 'cooldown'
  return fallback
}

function sortBySection(items: SelectedRoutineExercise[]): SelectedRoutineExercise[] {
  const grouped: Record<RoutineSection, SelectedRoutineExercise[]> = {
    warmup: [],
    main: [],
    cooldown: [],
  }

  for (const item of items) {
    grouped[item.section].push(item)
  }

  return SECTION_ORDER.flatMap((section) => grouped[section])
}

export default function NewRoutineScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { t } = useI18n()
  const params = useLocalSearchParams<{ editId?: string | string[] }>()
  const editId = Array.isArray(params.editId) ? params.editId[0] : params.editId
  const isEditMode = Boolean(editId)
  const [name, setName] = useState('')
  const [selectedExercises, setSelectedExercises] = useState<SelectedRoutineExercise[]>([])
  const [isPickerVisible, setIsPickerVisible] = useState(false)
  const [pickerSection, setPickerSection] = useState<RoutineSection>('main')
  const [isSaving, setIsSaving] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<RoutineSection, boolean>>({
    warmup: true,
    main: true,
    cooldown: true,
  })
  const [favoriteExerciseIds, setFavoriteExerciseIds] = useState<Set<string>>(new Set())
  const [existingRoutine, setExistingRoutine] = useState<Routine | null>(null)
  const [isHydrating, setIsHydrating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void listExerciseFavorites(user.id).then((result) => {
      if (!cancelled && result.data) {
        setFavoriteExerciseIds(result.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [user])

  const loadEditingRoutine = useCallback(async () => {
    if (!user || !editId) {
      setExistingRoutine(null)
      setLoadError(null)
      setIsHydrating(false)
      if (!editId) {
        setName('')
        setSelectedExercises([])
        setExpandedSections({
          warmup: true,
          main: true,
          cooldown: true,
        })
      }
      return
    }

    setIsHydrating(true)
    setLoadError(null)

    try {
      const routines = await loadRoutines(user.id)
      const target = routines.find((entry) => entry.id === editId)

      if (!target) {
        setExistingRoutine(null)
        setLoadError(t('routine.detail.notFound'))
        return
      }

      const { data, error } = await fetchExerciseDefinitionsByIds(
        target.items.map((item) => item.exerciseDefinitionId),
      )

      if (error) {
        throw error
      }

      const definitionById = (data ?? []).reduce<Record<string, ExerciseDefinitionRow>>(
        (acc, definition) => {
          acc[definition.id] = definition
          return acc
        },
        {},
      )

      const hydratedExercises = target.items.flatMap<SelectedRoutineExercise>((item) => {
        const exercise = definitionById[item.exerciseDefinitionId]
        if (!exercise) return []

        return [
          {
            exercise,
            section: item.section ?? 'main',
            existingItem: item,
          },
        ]
      })

      setExistingRoutine(target)
      setName(target.name)
      setSelectedExercises(sortBySection(hydratedExercises))
      setExpandedSections({
        warmup: true,
        main: true,
        cooldown: true,
      })
    } catch (error) {
      setExistingRoutine(null)
      setLoadError(
        sanitizeErrorMessage(
          error instanceof Error ? error.message : t('routine.detail.errorLoad'),
        ),
      )
    } finally {
      setIsHydrating(false)
    }
  }, [editId, t, user])

  useEffect(() => {
    void loadEditingRoutine()
  }, [loadEditingRoutine])

  const handleToggleExerciseFavorite = async (exerciseId: string, isFav: boolean) => {
    if (!user) return
    setFavoriteExerciseIds((prev) => {
      const next = new Set(prev)
      if (isFav) {
        next.add(exerciseId)
      } else {
        next.delete(exerciseId)
      }
      return next
    })
    const { error } = await toggleExerciseFavorite(user.id, exerciseId, isFav)
    if (error) {
      setFavoriteExerciseIds((prev) => {
        const next = new Set(prev)
        if (isFav) {
          next.delete(exerciseId)
        } else {
          next.add(exerciseId)
        }
        return next
      })
    }
  }

  const bySection = useMemo(() => {
    return {
      warmup: selectedExercises.filter((item) => item.section === 'warmup'),
      main: selectedExercises.filter((item) => item.section === 'main'),
      cooldown: selectedExercises.filter((item) => item.section === 'cooldown'),
    }
  }, [selectedExercises])
  const pickerConfig = SECTION_PICKER_CONFIG[pickerSection]

  if (!user) {
    return <Redirect href="/(auth)/login" />
  }

  if (isEditMode && isHydrating) {
    return (
      <Screen scroll={false}>
        <Box flex={1} justifyContent="center" alignItems="center">
          <LoadingState message={t('routine.edit.loading')} />
        </Box>
      </Screen>
    )
  }

  if (isEditMode && loadError) {
    return (
      <Screen>
        <AppHeader title={t('routine.edit.title')} subtitle={t('routine.edit.subtitle')} />
        <ErrorCard
          title={t('errors.generic.title')}
          message={loadError}
          primaryActionLabel={t('common.tryAgain')}
          onPrimaryAction={() => {
            void loadEditingRoutine()
          }}
          closeLabel={t('common.close')}
        />
      </Screen>
    )
  }

  const toggleSection = (section: RoutineSection) => {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }

  const moveWithinSection = (section: RoutineSection, index: number, direction: 'up' | 'down') => {
    setSelectedExercises((current) => {
      const grouped: Record<RoutineSection, SelectedRoutineExercise[]> = {
        warmup: current.filter((item) => item.section === 'warmup'),
        main: current.filter((item) => item.section === 'main'),
        cooldown: current.filter((item) => item.section === 'cooldown'),
      }

      const target = [...grouped[section]]
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= target.length) return current

      const [moved] = target.splice(index, 1)
      target.splice(nextIndex, 0, moved)
      grouped[section] = target

      return sortBySection([...grouped.warmup, ...grouped.main, ...grouped.cooldown])
    })
  }

  const removeExercise = (exerciseId: string) => {
    setSelectedExercises((current) => current.filter((item) => item.exercise.id !== exerciseId))
  }

  const moveToSection = (exerciseId: string, targetSection: RoutineSection) => {
    setSelectedExercises((current) => {
      const next = [...current]
      const index = next.findIndex((item) => item.exercise.id === exerciseId)
      if (index === -1) return current

      const [item] = next.splice(index, 1)
      next.push({ ...item, section: targetSection })
      return sortBySection(next)
    })
  }

  const openMoveMenu = (exerciseId: string, currentSection: RoutineSection) => {
    const options = SECTION_ORDER.filter((section) => section !== currentSection)

    Alert.alert(t('routine.new.moveToSectionTitle'), t('routine.new.moveToSectionBody'), [
      ...options.map((section) => ({
        text: t(SECTION_TITLE_KEY[section]),
        onPress: () => moveToSection(exerciseId, section),
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ])
  }

  const handleSelectExercise = (exercise: ExerciseDefinitionRow) => {
    const alreadySelected = selectedExercises.some((item) => item.exercise.id === exercise.id)

    if (alreadySelected) {
      Alert.alert(t('routine.new.duplicateTitle'), t('routine.new.duplicateBody'))
      return
    }

    const section = inferSectionFromExercise(exercise, pickerSection)
    setSelectedExercises((current) => sortBySection([...current, { exercise, section }]))
    setIsPickerVisible(false)
  }

  const handleSaveRoutine = async () => {
    const trimmedName = name.trim()

    if (!trimmedName) {
      Alert.alert(t('routine.new.nameRequiredTitle'), t('routine.new.nameRequiredBody'))
      return
    }

    if (selectedExercises.length === 0) {
      Alert.alert(t('routine.new.addExercisesTitle'), t('routine.new.addExercisesBody'))
      return
    }

    setIsSaving(true)

    const now = new Date().toISOString()
    const routineId = existingRoutine?.id ?? generateRoutineId()
    const routine: Routine = {
      id: routineId,
      clientUuid: existingRoutine?.clientUuid,
      name: trimmedName,
      description: existingRoutine?.description ?? null,
      color: existingRoutine?.color ?? null,
      createdAt: existingRoutine?.createdAt ?? now,
      updatedAt: now,
      pinned: existingRoutine?.pinned,
      items: sortBySection(selectedExercises).map((item, index) => ({
        exerciseDefinitionId: item.exercise.id,
        orderIndex: index,
        section: item.section,
        clientUuid: item.existingItem?.clientUuid,
        updatedAt: now,
        defaultSets: item.existingItem?.defaultSets ?? null,
        defaultReps: item.existingItem?.defaultReps ?? null,
      })),
    }

    try {
      await upsertRoutine(user.id, routine)
      const payload = toCloudRoutinePayload(routine)
      const cloudResult = await upsertCloudRoutineWithItems({
        userId: user.id,
        routine: payload.routine,
        items: payload.items,
      })
      if (cloudResult.error) {
        const msg = cloudResult.error.message?.toLowerCase() ?? ''
        if (msg.includes('routine_empty') || msg.includes('routine must have at least one')) {
          Alert.alert(t('routine.new.saveErrorTitle'), t('routine.new.addExercisesBody'))
          return
        }
        if (
          msg.includes('failed to fetch') ||
          msg.includes('network') ||
          msg.includes('offline') ||
          msg.includes('load failed')
        ) {
          Alert.alert(t('routine.new.saveErrorTitle'), t('routine.new.savedLocallyOffline'))
        } else {
          Alert.alert(
            t('routine.new.saveErrorTitle'),
            sanitizeErrorMessage(cloudResult.error.message),
          )
          return
        }
      }
      if (isEditMode && router.canGoBack()) {
        router.back()
        return
      }
      router.replace({
        pathname: '/(app)/routines/[id]',
        params: { id: routine.id },
      })
    } catch (saveError) {
      Alert.alert(
        t('routine.new.saveErrorTitle'),
        sanitizeErrorMessage(
          saveError instanceof Error ? saveError.message : t('routine.new.saveErrorBody'),
        ),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const renderSectionPanel = (section: RoutineSection) => {
    const items = bySection[section]
    const isExpanded = expandedSections[section]

    return (
      <Card key={section} marginTop="md">
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Pressable onPress={() => toggleSection(section)} accessibilityRole="button">
            {({ pressed }) => (
              <Text variant="label" opacity={pressed ? 0.8 : 1}>
                {t(SECTION_TITLE_KEY[section])}
              </Text>
            )}
          </Pressable>
          <Box flexDirection="row" gap="sm">
            <Button
              title={t('routine.new.addExercise')}
              variant="ghost"
              onPress={() => {
                setPickerSection(section)
                setIsPickerVisible(true)
              }}
            />
            <Button
              title={isExpanded ? t('routine.new.collapse') : t('routine.new.expand')}
              variant="ghost"
              onPress={() => toggleSection(section)}
            />
          </Box>
        </Box>

        {isExpanded ? (
          items.length === 0 ? (
            <Box marginTop="sm">
              <Text variant="bodySm" color="textMuted">
                {t('routine.new.sectionEmpty')}
              </Text>
            </Box>
          ) : (
            <Box marginTop="sm">
              {items.map((item, index) => (
                <Box
                  key={item.exercise.id}
                  paddingVertical="md"
                  borderBottomWidth={index === items.length - 1 ? 0 : 1}
                  borderBottomColor="borderSubtle"
                >
                  <Text variant="label">{item.exercise.name}</Text>
                  <Text marginTop="xs" variant="bodySm" color="textMuted">
                    {item.exercise.muscle_group ?? t('session.fullBody')}
                  </Text>

                  <Box flexDirection="row" gap="sm" marginTop="sm" flexWrap="wrap">
                    <Button
                      title={t('routine.new.moveUp')}
                      variant="ghost"
                      disabled={index === 0}
                      onPress={() => moveWithinSection(section, index, 'up')}
                    />
                    <Button
                      title={t('routine.new.moveDown')}
                      variant="ghost"
                      disabled={index === items.length - 1}
                      onPress={() => moveWithinSection(section, index, 'down')}
                    />
                    <Button
                      title={t('routine.new.moveSection')}
                      variant="ghost"
                      onPress={() => openMoveMenu(item.exercise.id, section)}
                    />
                    <Pressable
                      onPress={() => removeExercise(item.exercise.id)}
                      accessibilityRole="button"
                      minHeight={44}
                      justifyContent="center"
                      paddingHorizontal="sm"
                    >
                      {({ pressed }) => (
                        <Text variant="labelSm" color="error" opacity={pressed ? 0.8 : 1}>
                          {t('common.remove')}
                        </Text>
                      )}
                    </Pressable>
                  </Box>
                </Box>
              ))}
            </Box>
          )
        ) : null}
      </Card>
    )
  }

  return (
    <>
      <Screen>
        <AppHeader
          title={isEditMode ? t('routine.edit.title') : t('routine.new.title')}
          subtitle={isEditMode ? t('routine.edit.subtitle') : t('routine.new.subtitle')}
        />

        <Card>
          <Text variant="label" marginBottom="sm">
            {t('routine.new.nameLabel')}
          </Text>
          <Input
            testID="routineNew:nameInput"
            value={name}
            onChangeText={setName}
            placeholder={t('routine.new.namePlaceholder')}
            autoCapitalize="words"
            returnKeyType="done"
          />
        </Card>

        <Box marginTop="xl">
          {SECTION_ORDER.map((section) => renderSectionPanel(section))}

          {selectedExercises.length === 0 ? (
            <EmptyState
              title={t('routine.new.emptyTitle')}
              body={t('routine.new.emptyBody')}
              ctaLabel={t('routine.new.addExercise')}
              onCtaPress={() => {
                setPickerSection('main')
                setIsPickerVisible(true)
              }}
            />
          ) : null}
        </Box>

        <Box marginTop="xl" marginBottom="md">
          {selectedExercises.length === 0 ? (
            <Text variant="bodySm" color="textMuted" marginBottom="sm">
              {t('routine.new.addExercisesBody')}
            </Text>
          ) : null}
          <Button
            testID="routineNew:saveButton"
            title={
              isSaving
                ? t('common.saving')
                : isEditMode
                  ? t('routine.edit.save')
                  : t('routine.new.save')
            }
            onPress={() => {
              void handleSaveRoutine()
            }}
            loading={isSaving}
            disabled={isSaving || selectedExercises.length === 0}
          />
          <Box marginTop="sm">
            <Button
              title={t('common.cancel')}
              variant="secondary"
              onPress={() => {
                if (router.canGoBack()) {
                  router.back()
                  return
                }

                if (existingRoutine) {
                  router.replace({
                    pathname: '/(app)/routines/[id]',
                    params: { id: existingRoutine.id },
                  })
                  return
                }

                router.replace('/(app)/(tabs)/workout')
              }}
              disabled={isSaving}
            />
          </Box>
        </Box>
      </Screen>

      <Modal
        visible={isPickerVisible}
        animationType="slide"
        onRequestClose={() => setIsPickerVisible(false)}
      >
        <ExerciseSearch
          onSelectExercise={handleSelectExercise}
          onClose={() => setIsPickerVisible(false)}
          userId={user.id}
          initialCategory={pickerConfig.initialCategory}
          allowedCategories={pickerConfig.allowedCategories}
          recentExercises={selectedExercises.map((item) => item.exercise)}
          favoriteIds={favoriteExerciseIds}
          onToggleFavorite={(exerciseId, isFav) => {
            void handleToggleExerciseFavorite(exerciseId, isFav)
          }}
        />
      </Modal>
    </>
  )
}
