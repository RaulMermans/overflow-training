import { useEffect, useMemo, useState, type ComponentProps } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import {
  searchExerciseDefinitionsScoped,
  type ExerciseCategory,
  type ExerciseDefinitionRow,
} from '../../db/workouts'
import { useI18n } from '../../i18n/useI18n'
import type { TranslationKey } from '../../i18n'
import { getLocalizedExerciseName } from '../../i18n/exerciseNames'
import { colors, radius, typography } from '../../theme'
import { getCategoryIcon } from '../../lib/categoryIcon'

interface ExerciseSearchProps {
  onSelectExercise: (exercise: ExerciseDefinitionRow) => void
  onClose: () => void
  userId?: string
  initialCategory?: ExerciseCategory
  allowedCategories?: ExerciseCategory[]
  requireFocus?: boolean
  recentExercises?: ExerciseDefinitionRow[]
  favoriteIds?: Set<string>
  onToggleFavorite?: (exerciseId: string, isFav: boolean) => void
}

type PickerStep = 'type' | 'focus' | 'list'
type MaterialIconName = ComponentProps<typeof MaterialCommunityIcons>['name']
type PickerTarget =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'

const pickerTypeOptions: ReadonlyArray<{
  value: ExerciseCategory
  labelKey: TranslationKey
}> = [
  { value: 'strength', labelKey: 'routine.exercisePicker.filter.strength' },
  { value: 'warmup', labelKey: 'routine.exercisePicker.filter.warmup' },
  { value: 'stretch', labelKey: 'routine.exercisePicker.filter.stretch' },
  { value: 'cardio', labelKey: 'routine.exercisePicker.filter.cardio' },
  { value: 'mobility', labelKey: 'routine.exercisePicker.filter.mobility' },
  { value: 'yoga', labelKey: 'routine.exercisePicker.filter.yoga' },
  { value: 'pilates', labelKey: 'routine.exercisePicker.filter.pilates' },
  { value: 'other', labelKey: 'routine.exercisePicker.filter.other' },
]

const defaultPickerTypeStepOptions: ReadonlyArray<{
  value: ExerciseCategory
  labelKey: TranslationKey
}> = [
  { value: 'strength', labelKey: 'routine.exercisePicker.filter.strength' },
  { value: 'warmup', labelKey: 'routine.exercisePicker.filter.warmup' },
  { value: 'stretch', labelKey: 'routine.exercisePicker.filter.stretch' },
  { value: 'cardio', labelKey: 'routine.exercisePicker.filter.cardio' },
  { value: 'mobility', labelKey: 'routine.exercisePicker.filter.mobility' },
]

function getSearchCategories(category: ExerciseCategory | null): ExerciseCategory[] {
  if (!category) return []
  if (category === 'mobility') {
    return ['mobility', 'yoga', 'pilates', 'other']
  }
  return [category]
}

const pickerTargetLabelKeyByValue: Record<PickerTarget, TranslationKey> = {
  chest: 'routine.exercisePicker.targets.chest',
  back: 'routine.exercisePicker.targets.back',
  shoulders: 'routine.exercisePicker.targets.shoulders',
  biceps: 'routine.exercisePicker.targets.biceps',
  triceps: 'routine.exercisePicker.targets.triceps',
  quads: 'routine.exercisePicker.targets.quads',
  hamstrings: 'routine.exercisePicker.targets.hamstrings',
  glutes: 'routine.exercisePicker.targets.glutes',
  calves: 'routine.exercisePicker.targets.calves',
  core: 'routine.exercisePicker.targets.core',
}

const pickerTargetsByCategory: Record<ExerciseCategory, PickerTarget[]> = {
  strength: [
    'chest',
    'back',
    'shoulders',
    'biceps',
    'triceps',
    'quads',
    'hamstrings',
    'glutes',
    'calves',
    'core',
  ],
  warmup: ['shoulders', 'back', 'glutes', 'quads', 'hamstrings', 'core'],
  stretch: ['shoulders', 'back', 'hamstrings', 'glutes', 'quads', 'calves', 'core'],
  cardio: [],
  mobility: ['shoulders', 'back', 'hamstrings', 'glutes', 'quads', 'core'],
  yoga: [],
  pilates: [],
  other: [],
}

function categoryRequiresFocus(category: ExerciseCategory | null): boolean {
  return category === 'strength'
}

export default function ExerciseSearch({
  onSelectExercise,
  onClose,
  userId: _userId,
  initialCategory,
  allowedCategories,
  requireFocus,
  recentExercises = [],
  favoriteIds,
  onToggleFavorite,
}: ExerciseSearchProps) {
  const { t, language } = useI18n()
  const [step, setStep] = useState<PickerStep>('type')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory | null>(null)
  const [selectedFocus, setSelectedFocus] = useState<PickerTarget | null>(null)
  const [exercises, setExercises] = useState<ExerciseDefinitionRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [localFavoriteIds, setLocalFavoriteIds] = useState<Set<string>>(
    () => new Set(favoriteIds ?? []),
  )

  useEffect(() => {
    setLocalFavoriteIds(new Set(favoriteIds ?? []))
  }, [favoriteIds])

  const pickerTypeStepOptions = useMemo(() => {
    if (!allowedCategories || allowedCategories.length === 0) {
      return defaultPickerTypeStepOptions
    }

    return allowedCategories
      .map((category) => pickerTypeOptions.find((option) => option.value === category))
      .filter(
        (
          option,
        ): option is {
          value: ExerciseCategory
          labelKey: TranslationKey
        } => Boolean(option),
      )
  }, [allowedCategories])

  useEffect(() => {
    if (!initialCategory) {
      return
    }
    setSelectedCategory(initialCategory)
    setSelectedFocus(null)
    setSearchQuery('')
    setExercises([])
    setQueryError(null)
    setStep((requireFocus ?? categoryRequiresFocus(initialCategory)) ? 'focus' : 'list')
  }, [initialCategory, requireFocus])

  const focusRequiredFor = (category: ExerciseCategory | null): boolean => {
    if (!category) return false
    return requireFocus ?? categoryRequiresFocus(category)
  }

  const focusOptions = useMemo(() => {
    if (!selectedCategory) return []
    return pickerTargetsByCategory[selectedCategory]
  }, [selectedCategory])

  const shouldQueryResults =
    step === 'list' &&
    Boolean(selectedCategory) &&
    (!focusRequiredFor(selectedCategory) || Boolean(selectedFocus))
  const searchCategories = useMemo(() => getSearchCategories(selectedCategory), [selectedCategory])

  useEffect(() => {
    let isMounted = true

    if (!shouldQueryResults || searchCategories.length === 0) {
      setExercises([])
      setIsLoading(false)
      setQueryError(null)
      return
    }

    const timer = setTimeout(async () => {
      setIsLoading(true)
      setQueryError(null)
      const searchResponses = await Promise.all(
        searchCategories.map((category) =>
          searchExerciseDefinitionsScoped({
            category,
            target: focusRequiredFor(category) ? selectedFocus : undefined,
            query:
              searchQuery.trim().length === 0 && !focusRequiredFor(category) ? '%' : searchQuery,
            limit: 100,
          }),
        ),
      )

      if (!isMounted) return
      const errors = searchResponses
        .map((response) => response.error)
        .filter((value): value is Error => Boolean(value))

      if (errors.length === searchResponses.length) {
        if (__DEV__) console.error('Failed to search exercises:', errors[0])
        setExercises([])
        setQueryError(t('routine.exercisePicker.searchError'))
      } else {
        const deduped = new Map<string, ExerciseDefinitionRow>()
        searchResponses.forEach((response) => {
          response.data.forEach((exercise) => {
            deduped.set(exercise.id, exercise)
          })
        })
        setExercises(Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name)))

        if (errors.length > 0 && __DEV__) {
          console.warn('Partial exercise search failure:', errors[0])
        }
      }
      setIsLoading(false)
    }, 250)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [searchCategories, searchQuery, selectedFocus, shouldQueryResults, t])

  const groupedResults = useMemo(() => {
    const recentIds = new Set(recentExercises.map((exercise) => exercise.id))
    const favIds = localFavoriteIds
    const indexed = new Map(exercises.map((exercise) => [exercise.id, exercise]))

    const favorites = exercises.filter((exercise) => favIds.has(exercise.id))
    const recent = recentExercises
      .map((exercise) => indexed.get(exercise.id))
      .filter((exercise): exercise is ExerciseDefinitionRow => Boolean(exercise))
      .filter((exercise) => !favIds.has(exercise.id))
    const remainder = exercises.filter(
      (exercise) => !recentIds.has(exercise.id) && !favIds.has(exercise.id),
    )
    const mine = remainder.filter((exercise) => exercise.scope === 'user')
    const system = remainder.filter((exercise) => exercise.scope !== 'user')

    return { favorites, recent, mine, system }
  }, [exercises, localFavoriteIds, recentExercises])

  const selectedTypeLabelKey = useMemo(() => {
    return pickerTypeOptions.find((option) => option.value === selectedCategory)?.labelKey
  }, [selectedCategory])

  const selectedFocusLabelKey = selectedFocus ? pickerTargetLabelKeyByValue[selectedFocus] : null

  const resetListState = () => {
    setSearchQuery('')
    setExercises([])
    setQueryError(null)
    setIsLoading(false)
  }

  const handleBack = () => {
    if (step === 'list') {
      if (selectedCategory && focusRequiredFor(selectedCategory)) {
        setStep('focus')
        setSelectedFocus(null)
      } else {
        setStep('type')
        setSelectedCategory(null)
      }
      resetListState()
      return
    }

    if (step === 'focus') {
      setStep('type')
      setSelectedCategory(null)
      setSelectedFocus(null)
      resetListState()
    }
  }

  const handleSelectCategory = (category: ExerciseCategory) => {
    setSelectedCategory(category)
    setSelectedFocus(null)
    setSearchQuery('')
    setExercises([])
    setQueryError(null)
    setStep(focusRequiredFor(category) ? 'focus' : 'list')
  }

  const handleSelectFocus = (target: PickerTarget) => {
    setSelectedFocus(target)
    setSearchQuery('')
    setExercises([])
    setQueryError(null)
    setStep('list')
  }

  const renderSection = (title: string, items: ExerciseDefinitionRow[]) => {
    if (items.length === 0) return null
    return (
      <View style={styles.section} key={title}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {items.map((item) => {
          const isFav = localFavoriteIds.has(item.id)
          const icon = getCategoryIcon(item.category)
          return (
            <TouchableOpacity
              key={item.id}
              testID="exerciseSearch:exerciseRow"
              accessibilityLabel={getLocalizedExerciseName(item.slug, language, item.name)}
              style={styles.exerciseItem}
              onPress={() => onSelectExercise(item)}
            >
              <MaterialCommunityIcons
                name={icon.name as MaterialIconName}
                size={18}
                color={colors.text.muted}
                style={styles.categoryIcon}
              />
              <View style={styles.exerciseInfo}>
                <View style={styles.exerciseNameRow}>
                  <Text style={styles.exerciseName}>
                    {getLocalizedExerciseName(item.slug, language, item.name)}
                  </Text>
                  {item.scope === 'user' ? (
                    <View style={styles.scopeBadge}>
                      <Text style={styles.scopeBadgeText}>
                        {t('routine.exercisePicker.scopeUser')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.exerciseMeta}>
                  {item.muscle_group ?? t('session.fullBody')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={(event) => {
                  event.stopPropagation()
                  const nextIsFav = !isFav
                  setLocalFavoriteIds((prev) => {
                    const next = new Set(prev)
                    if (nextIsFav) {
                      next.add(item.id)
                    } else {
                      next.delete(item.id)
                    }
                    return next
                  })
                  onToggleFavorite?.(item.id, nextIsFav)
                }}
                accessibilityLabel={isFav ? t('common.unstar') : t('common.star')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.starButton}
              >
                <Ionicons
                  name={isFav ? 'star' : 'star-outline'}
                  size={18}
                  color={isFav ? colors.semantic.warning : colors.text.muted}
                />
              </TouchableOpacity>
              <Text style={styles.addButton}>+</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    )
  }

  const renderMenuChip = (label: string, onPress: () => void, isActive = false) => {
    return (
      <TouchableOpacity
        key={label}
        style={[styles.menuChip, isActive && styles.menuChipActive]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={isActive ? { selected: true } : undefined}
      >
        <Text style={[styles.menuChipText, isActive && styles.menuChipTextActive]}>{label}</Text>
      </TouchableOpacity>
    )
  }

  const listTitle = (() => {
    if (step === 'type') return t('routine.exercisePicker.stepType')
    if (step === 'focus') return t('routine.exercisePicker.stepFocus')
    return t('routine.exercisePicker.stepExercise')
  })()

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{listTitle}</Text>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      {step !== 'type' ? (
        <View style={styles.backRow}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Text style={styles.backButtonText}>{t('routine.exercisePicker.back')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {step === 'type' ? (
        <View style={styles.menuGrid}>
          {pickerTypeStepOptions.map((option) =>
            renderMenuChip(t(option.labelKey), () => handleSelectCategory(option.value)),
          )}
        </View>
      ) : null}

      {step === 'focus' ? (
        <View style={styles.menuGrid}>
          {focusOptions.map((target) =>
            renderMenuChip(t(pickerTargetLabelKeyByValue[target]), () => handleSelectFocus(target)),
          )}
        </View>
      ) : null}

      {step === 'list' ? (
        <>
          <Text style={styles.scopeText}>
            {[
              selectedTypeLabelKey ? t(selectedTypeLabelKey) : '',
              selectedFocusLabelKey ? t(selectedFocusLabelKey) : '',
            ]
              .filter((value) => value.length > 0)
              .join(' · ')}
          </Text>
          <TextInput
            style={styles.searchInput}
            placeholder={t('routine.exercisePicker.searchPlaceholder')}
            placeholderTextColor={colors.text.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />

          {queryError ? <Text style={styles.errorText}>{queryError}</Text> : null}

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent.primary} />
            </View>
          ) : (
            <ScrollView
              style={styles.results}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            >
              {renderSection(t('lists.section.favorites'), groupedResults.favorites)}
              {renderSection(t('routine.exercisePicker.sectionRecent'), groupedResults.recent)}
              {renderSection(t('routine.exercisePicker.sectionMy'), groupedResults.mine)}
              {renderSection(t('routine.exercisePicker.sectionSystem'), groupedResults.system)}

              {exercises.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>{t('routine.exercisePicker.emptyResults')}</Text>
                </View>
              ) : null}
            </ScrollView>
          )}
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg.elevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: colors.text.secondary,
  },
  backRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    marginBottom: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  backButtonText: {
    ...typography.labelSm,
    color: colors.text.secondary,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  menuChip: {
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  menuChipActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.primaryMuted,
  },
  menuChipText: {
    ...typography.labelSm,
    color: colors.text.secondary,
  },
  menuChipTextActive: {
    color: colors.accent.primary,
  },
  scopeText: {
    ...typography.bodySm,
    color: colors.text.muted,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  searchInput: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
    padding: 16,
    backgroundColor: colors.bg.input,
    borderRadius: radius.md,
    ...typography.body,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  results: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    ...typography.labelSm,
    color: colors.text.muted,
    marginBottom: 8,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exerciseName: {
    ...typography.label,
    color: colors.text.primary,
  },
  exerciseMeta: {
    ...typography.bodySm,
    color: colors.text.secondary,
    marginTop: 4,
  },
  scopeBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.accent.primaryMuted,
  },
  scopeBadgeText: {
    ...typography.micro,
    color: colors.accent.primary,
  },
  categoryIcon: {
    marginRight: 10,
  },
  starButton: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    fontSize: 24,
    color: colors.accent.primary,
    marginLeft: 8,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.text.muted,
  },
  errorText: {
    ...typography.bodySm,
    color: colors.semantic.error,
    marginHorizontal: 20,
    marginBottom: 8,
  },
})
