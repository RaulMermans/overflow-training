import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Modal } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import ExerciseSearch from '../../src/components/ui/ExerciseSearch'
import { useAuth } from '../../src/auth/useAuth'
import { searchExerciseDefinitions, type ExerciseDefinitionRow } from '../../src/db/workouts'
import { toCloudRoutinePayload } from '../../src/db/routineCloudPayload'
import { upsertCloudRoutineWithItems } from '../../src/db/routinesPlans'
import {
  Box,
  Button,
  Card,
  Input,
  Pressable,
  SegmentedControl,
  Text,
} from '../../src/components/ui'
import { upsertRoutine, type Routine } from '../../src/lib/routines'
import { setOnboardingCompleted } from '../../src/lib/onboarding'
import {
  saveOnboardingProfile,
  type Equipment,
  type Intention,
  VALID_EQUIPMENT,
} from '../../src/lib/onboardingProfile'
import { generateUuid } from '../../src/lib/ids'
import {
  loadProfilePreferences,
  saveProfilePreferences,
  type UnitsPreference,
} from '../../src/lib/profilePreferences'
import { sanitizeErrorMessage } from '../../src/utils/errorMessages'
import { getTimeBasedGreeting, formatGreetingWithName } from '../../src/features/today/compute'
import { getDailyQuote } from '../../src/utils/motivation'
import { useI18n } from '../../src/i18n/useI18n'
import type { TranslationKey } from '../../src/i18n'
import { getLocalizedExerciseName } from '../../src/i18n/exerciseNames'
import {
  canAdvanceOnboardingStep,
  canSkipOnboardingStep,
  EQUIPMENT_STEP_INDEX,
  FIRST_ROUTINE_STEP_INDEX,
  IDENTITY_STEP_INDEX,
  getNextOnboardingStep,
  ONBOARDING_STEP_COUNT,
  type FirstRoutineValidationErrorKey,
  validateFirstRoutineDraft,
} from '../../src/features/onboarding/flow'
import { OnboardingScaffold } from '../../src/features/onboarding/OnboardingScaffold'
import { ArchetypeIcon } from '../../src/components/ui/ArchetypeIcon'
import { ARCHETYPES } from '../../src/features/identity/archetypes'

type StartMode = 'template' | 'custom'

const TEMPLATE_KEYS = ['fullBody', 'upperLower', 'pushPullLegs'] as const

type TemplateKey = (typeof TEMPLATE_KEYS)[number]

const TEMPLATE_I18N_KEYS: Record<TemplateKey, TranslationKey> = {
  fullBody: 'onboarding.template.fullBody',
  upperLower: 'onboarding.template.upperLower',
  pushPullLegs: 'onboarding.template.pushPullLegs',
}

const TEMPLATE_PRESET_EXERCISES: Record<TemplateKey, string[]> = {
  fullBody: ['Squat', 'Bench Press', 'Bent Over Row'],
  upperLower: ['Squat', 'Romanian Deadlift', 'Bench Press', 'Barbell Row'],
  pushPullLegs: ['Bench Press', 'Barbell Row', 'Squat', 'Overhead Press', 'Romanian Deadlift'],
}

const INTENTIONS: Intention[] = [
  'strength',
  'conditioning',
  'mobility',
  'consistency',
  'rehab',
  'other',
]

const RHYTHM_OPTIONS = [2, 3, 4, 5, 6]
const LANGUAGE_OPTIONS = [
  { value: 'es', label: 'ES' },
  { value: 'en', label: 'EN' },
]

function isNetworkCloudError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('offline') ||
    lower.includes('load failed')
  )
}

export default function OnboardingScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { t, language, setLanguage } = useI18n()

  const [stepIndex, setStepIndex] = useState(0)
  const [intention, setIntention] = useState<Intention | null>(null)
  const [weeklyGoal, setWeeklyGoal] = useState<number | null>(null)
  const [units, setUnitsState] = useState<UnitsPreference>('kg')
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment[]>([])
  const [isCompleting, setIsCompleting] = useState(false)

  const [firstRoutineName, setFirstRoutineName] = useState('')
  const [firstRoutineExercises, setFirstRoutineExercises] = useState<ExerciseDefinitionRow[]>([])
  const [isExercisePickerVisible, setIsExercisePickerVisible] = useState(false)
  const [isSavingRoutine, setIsSavingRoutine] = useState(false)
  const [hasSavedFirstRoutine, setHasSavedFirstRoutine] = useState(false)
  const [firstRoutineValidationError, setFirstRoutineValidationError] =
    useState<FirstRoutineValidationErrorKey | null>(null)
  const [startMode, setStartMode] = useState<StartMode | null>(null)
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<TemplateKey | null>(null)
  const [isAddingPreset, setIsAddingPreset] = useState(false)
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (user?.id) {
      void loadProfilePreferences(user.id).then((prefs) => setUnitsState(prefs.units))
    }
  }, [user?.id])

  const handleSetUnits = async (nextUnits: UnitsPreference) => {
    setUnitsState(nextUnits)
    if (user?.id) {
      const current = await loadProfilePreferences(user.id)
      await saveProfilePreferences(user.id, { ...current, units: nextUnits })
    }
  }

  const now = useMemo(() => new Date(), [])
  const displayName =
    typeof user?.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name.trim()
      : ''
  const greetingTitle = useMemo(
    () => formatGreetingWithName(getTimeBasedGreeting(now, language), displayName, user?.email),
    [now, language, displayName, user?.email],
  )
  const motivationLine = useMemo(() => {
    const quote = getDailyQuote({ userId: user?.id, date: now, locale: language })
    return quote.text[language] ?? quote.text.en
  }, [now, user?.id, language])

  if (!user) {
    return <Redirect href="/(auth)/login" />
  }

  const canContinue = canAdvanceOnboardingStep({
    stepIndex,
    hasIntention: intention !== null,
    hasWeeklyGoal: weeklyGoal !== null,
    hasSavedFirstRoutine,
  })
  const isIdentityStep = stepIndex === IDENTITY_STEP_INDEX
  const isRoutineStep = stepIndex === FIRST_ROUTINE_STEP_INDEX

  const handleComplete = async () => {
    if (isCompleting) return
    setIsCompleting(true)
    await setOnboardingCompleted(user.id)
    router.replace('/(app)/(tabs)/workout')
  }

  const handleSelectIntention = async (value: Intention) => {
    setIntention(value)
    await saveOnboardingProfile(user.id, { intention: value })
  }

  const handleSelectRhythm = async (value: number) => {
    setWeeklyGoal(value)
    await saveOnboardingProfile(user.id, { weeklyGoal: value })
  }

  const handleToggleEquipment = async (item: Equipment) => {
    const next = selectedEquipment.includes(item)
      ? selectedEquipment.filter((e) => e !== item)
      : [...selectedEquipment, item]
    setSelectedEquipment(next)
    await saveOnboardingProfile(user.id, { equipment: next })
  }

  const handleContinue = () => {
    setStepIndex((current) => getNextOnboardingStep(current))
  }

  const handleBack = () => {
    setStepIndex((prev) => Math.max(0, prev - 1))
  }

  const handleSelectExercise = (exercise: ExerciseDefinitionRow) => {
    setFirstRoutineExercises((current) => {
      if (current.some((item) => item.id === exercise.id)) return current
      return [...current, exercise]
    })
    setFirstRoutineValidationError(null)
    setIsExercisePickerVisible(false)
  }

  const handleRemoveExercise = (exerciseId: string) => {
    if (hasSavedFirstRoutine) return
    setFirstRoutineExercises((current) => current.filter((exercise) => exercise.id !== exerciseId))
  }

  const handleAddPresetExercises = useCallback(async () => {
    if (!selectedTemplateKey || isAddingPreset || hasSavedFirstRoutine) return
    const names = TEMPLATE_PRESET_EXERCISES[selectedTemplateKey]
    if (!names.length) return
    setIsAddingPreset(true)
    setFirstRoutineValidationError(null)
    try {
      const added: ExerciseDefinitionRow[] = []
      for (const name of names) {
        const { data } = await searchExerciseDefinitions(name, {
          category: 'strength',
          limit: 1,
        })
        const def = data?.[0]
        if (def && !added.some((e) => e.id === def.id)) {
          added.push(def)
        }
      }
      setFirstRoutineExercises((current) => {
        const ids = new Set(current.map((e) => e.id))
        const newOnes = added.filter((e) => !ids.has(e.id))
        return [...current, ...newOnes]
      })
    } catch {
      Alert.alert(t('common.error'), t('onboarding.step3.saveErrorBody'))
    } finally {
      setIsAddingPreset(false)
    }
  }, [selectedTemplateKey, isAddingPreset, hasSavedFirstRoutine, t])

  const handleSaveFirstRoutine = async () => {
    if (isSavingRoutine || hasSavedFirstRoutine) return

    const validationError = validateFirstRoutineDraft({
      name: firstRoutineName,
      exerciseCount: firstRoutineExercises.length,
    })
    if (validationError) {
      setFirstRoutineValidationError(validationError)
      return
    }

    setIsSavingRoutine(true)
    setFirstRoutineValidationError(null)

    const routineName = firstRoutineName.trim()
    const nowIso = new Date().toISOString()
    const routine: Routine = {
      id: generateUuid(),
      name: routineName,
      createdAt: nowIso,
      updatedAt: nowIso,
      items: firstRoutineExercises.map((exercise, index) => ({
        exerciseDefinitionId: exercise.id,
        orderIndex: index,
        section: 'main',
        defaultSets: null,
        defaultReps: null,
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
        const errorMessage = cloudResult.error.message ?? ''
        if (isNetworkCloudError(errorMessage)) {
          Alert.alert(t('common.error'), t('onboarding.step3.savedLocalWarning'))
        } else {
          Alert.alert(t('common.error'), sanitizeErrorMessage(errorMessage))
        }
      }

      setHasSavedFirstRoutine(true)
    } catch (saveError) {
      Alert.alert(
        t('common.error'),
        sanitizeErrorMessage(
          saveError instanceof Error ? saveError.message : t('onboarding.step3.saveErrorBody'),
        ),
      )
    } finally {
      setIsSavingRoutine(false)
    }
  }

  const primaryActionLabel =
    stepIndex < FIRST_ROUTINE_STEP_INDEX
      ? t('common.continue')
      : hasSavedFirstRoutine
        ? t('onboarding.finishCta')
        : isSavingRoutine
          ? t('common.saving')
          : t('onboarding.step3.saveCta')

  const isPrimaryActionDisabled =
    stepIndex < FIRST_ROUTINE_STEP_INDEX
      ? !canContinue || isCompleting || isSavingRoutine
      : hasSavedFirstRoutine
        ? isCompleting || isSavingRoutine
        : isSavingRoutine || isCompleting

  const isPrimaryActionLoading =
    stepIndex < FIRST_ROUTINE_STEP_INDEX
      ? false
      : hasSavedFirstRoutine
        ? isCompleting
        : isSavingRoutine

  const handlePrimaryAction = () => {
    if (stepIndex < FIRST_ROUTINE_STEP_INDEX) {
      handleContinue()
      return
    }

    if (hasSavedFirstRoutine) {
      void handleComplete()
      return
    }

    void handleSaveFirstRoutine()
  }

  return (
    <>
      <OnboardingScaffold
        stepIndex={stepIndex}
        stepCount={ONBOARDING_STEP_COUNT}
        stepLabel={t('onboarding.stepIndicator', {
          current: String(stepIndex + 1),
          total: String(ONBOARDING_STEP_COUNT),
        })}
        primaryAction={{
          label: primaryActionLabel,
          onPress: handlePrimaryAction,
          disabled: isPrimaryActionDisabled,
          loading: isPrimaryActionLoading,
        }}
        backAction={
          stepIndex > 0
            ? {
                label: t('common.back'),
                onPress: handleBack,
                disabled: isCompleting || isSavingRoutine,
              }
            : null
        }
        skipAction={
          canSkipOnboardingStep()
            ? {
                label: t('common.skip'),
                onPress: () => {
                  void handleComplete()
                },
                disabled: isCompleting || isSavingRoutine,
              }
            : null
        }
      >
        {stepIndex === 0 && (
          <Box gap="md">
            <Box flexDirection="row" justifyContent="flex-end" gap="lg">
              <Box width={104}>
                <Text variant="micro" color="textMuted" marginBottom="xs" textAlign="center">
                  {t('onboarding.units.label')}
                </Text>
                <SegmentedControl
                  options={[
                    { value: 'kg', label: 'KG' },
                    { value: 'lb', label: 'LB' },
                  ]}
                  value={units}
                  onChange={(v) => {
                    if (v === 'kg' || v === 'lb') void handleSetUnits(v)
                  }}
                />
              </Box>
              <Box width={104}>
                <Text variant="micro" color="textMuted" marginBottom="xs" textAlign="center">
                  {t('common.language')}
                </Text>
                <SegmentedControl
                  options={LANGUAGE_OPTIONS}
                  value={language}
                  onChange={(nextLanguage) => {
                    if (nextLanguage === 'en' || nextLanguage === 'es') {
                      void setLanguage(nextLanguage)
                    }
                  }}
                />
              </Box>
            </Box>
            <Text variant="h1">{greetingTitle}</Text>
            <Text variant="bodySm" color="textMuted">
              {motivationLine}
            </Text>
            <Card marginTop="md">
              <Text variant="bodySm" color="textMuted">
                {t('onboarding.step0.body')}
              </Text>
            </Card>
          </Box>
        )}

        {isIdentityStep && (
          <Box gap="xl">
            <Box>
              <Text variant="displayBold" marginBottom="sm">
                {t('onboarding.identity.title')}
              </Text>
              <Text variant="body" color="textSecondary">
                {t('onboarding.identity.helper')}
              </Text>
            </Box>
            <Box gap="md">
              {ARCHETYPES.map((archetype) => {
                const isSelected = archetype.id === selectedArchetypeId
                return (
                  <Pressable
                    key={archetype.id}
                    onPress={() => {
                      setSelectedArchetypeId(archetype.id)
                      if (user?.id) {
                        void loadProfilePreferences(user.id).then((prefs) =>
                          saveProfilePreferences(user.id, { ...prefs, archetypeId: archetype.id }),
                        )
                      }
                    }}
                    minHeight={64}
                    accessibilityRole="radio"
                    accessibilityLabel={t(archetype.nameKey)}
                    accessibilityState={{ selected: isSelected }}
                  >
                    {({ pressed }) => (
                      <Box
                        flexDirection="row"
                        alignItems="center"
                        gap="md"
                        borderWidth={1}
                        borderColor={isSelected ? 'accentSecondary' : 'borderSubtle'}
                        borderRadius="md"
                        backgroundColor={isSelected ? 'accentSecondaryMuted' : 'surface'}
                        opacity={pressed ? 0.8 : 1}
                        paddingVertical="md"
                        paddingHorizontal="lg"
                      >
                        <ArchetypeIcon archetypeId={archetype.id} size={44} selected={isSelected} />
                        <Box flex={1}>
                          <Text
                            variant="label"
                            color={isSelected ? 'accentSecondary' : 'textPrimary'}
                          >
                            {t(archetype.nameKey)}
                          </Text>
                          <Text variant="bodySm" color="textMuted" marginTop="xs">
                            {t(archetype.taglineKey)}
                          </Text>
                        </Box>
                        {isSelected ? (
                          <Box
                            width={12}
                            height={12}
                            borderRadius="full"
                            backgroundColor="accentSecondary"
                          />
                        ) : (
                          <Box
                            width={12}
                            height={12}
                            borderRadius="full"
                            borderWidth={1}
                            borderColor="borderDefault"
                          />
                        )}
                      </Box>
                    )}
                  </Pressable>
                )
              })}
            </Box>
          </Box>
        )}

        {stepIndex === 2 && (
          <Box gap="xl">
            <Box>
              <Text variant="displayBold" marginBottom="sm">
                {t('onboarding.step1.title')}
              </Text>
              <Text variant="body" color="textSecondary">
                {t('onboarding.step1.helper')}
              </Text>
            </Box>
            <Box gap="md" marginTop="lg">
              {INTENTIONS.map((item) => {
                const isSelected = intention === item
                return (
                  <Pressable
                    key={item}
                    onPress={() => {
                      void handleSelectIntention(item)
                    }}
                    minHeight={64}
                    accessibilityRole="radio"
                    accessibilityLabel={t(`onboarding.intention.${item}` as TranslationKey)}
                    accessibilityState={{ selected: isSelected }}
                  >
                    {({ pressed }) => (
                      <Box
                        borderWidth={1}
                        borderColor={isSelected ? 'accentSecondary' : 'borderSubtle'}
                        borderRadius="md"
                        backgroundColor={isSelected ? 'accentSecondaryMuted' : 'surface'}
                        opacity={pressed ? 0.8 : 1}
                        flexDirection="row"
                        alignItems="center"
                        justifyContent="space-between"
                        paddingVertical="lg"
                        paddingHorizontal="xl"
                      >
                        <Box>
                          <Text
                            variant="label"
                            color={isSelected ? 'accentSecondary' : 'textPrimary'}
                          >
                            {t(`onboarding.intention.${item}` as TranslationKey)}
                          </Text>
                          <Text variant="bodySm" color="textMuted" marginTop="xs">
                            {t(`onboarding.intention.${item}.desc` as TranslationKey)}
                          </Text>
                        </Box>
                        {isSelected ? (
                          <Box
                            width={12}
                            height={12}
                            borderRadius="full"
                            backgroundColor="accentSecondary"
                          />
                        ) : (
                          <Box
                            width={12}
                            height={12}
                            borderRadius="full"
                            borderWidth={1}
                            borderColor="borderDefault"
                          />
                        )}
                      </Box>
                    )}
                  </Pressable>
                )
              })}
            </Box>
          </Box>
        )}

        {stepIndex === 3 && (
          <Box gap="xl">
            <Box>
              <Text variant="displayBold" marginBottom="sm">
                {t('onboarding.step2.title')}
              </Text>
              <Text variant="body" color="textSecondary">
                {t('onboarding.step2.helper')}
              </Text>
            </Box>
            <Box flexDirection="row" gap="md" marginTop="lg" flexWrap="wrap">
              {RHYTHM_OPTIONS.map((count) => {
                const isSelected = weeklyGoal === count
                return (
                  <Pressable
                    key={count}
                    onPress={() => {
                      void handleSelectRhythm(count)
                    }}
                    minHeight={64}
                    style={{ width: '47%' }}
                    accessibilityRole="radio"
                    accessibilityLabel={`${count} ${t('onboarding.rhythm.unit')}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    {({ pressed }) => (
                      <Box
                        borderWidth={1}
                        borderColor={isSelected ? 'accentSecondary' : 'borderSubtle'}
                        borderRadius="md"
                        backgroundColor={isSelected ? 'accentSecondaryMuted' : 'surface'}
                        opacity={pressed ? 0.8 : 1}
                        paddingVertical="lg"
                        paddingHorizontal="xl"
                        alignItems="center"
                        justifyContent="center"
                        flex={1}
                      >
                        <Text
                          variant="h2"
                          color={isSelected ? 'accentSecondary' : 'textPrimary'}
                          fontWeight={isSelected ? '700' : '400'}
                        >
                          {count}
                        </Text>
                        <Text
                          variant="micro"
                          color={isSelected ? 'accentSecondary' : 'textMuted'}
                          marginTop="xs"
                        >
                          {t('onboarding.rhythm.unit')}
                        </Text>
                      </Box>
                    )}
                  </Pressable>
                )
              })}
            </Box>
          </Box>
        )}

        {stepIndex === EQUIPMENT_STEP_INDEX && (
          <Box gap="xl">
            <Box>
              <Text variant="displayBold" marginBottom="sm">
                {t('onboarding.step3.equipment.title')}
              </Text>
              <Text variant="body" color="textSecondary">
                {t('onboarding.step3.equipment.helper')}
              </Text>
            </Box>
            <Box gap="md" marginTop="lg" flexDirection="row" flexWrap="wrap">
              {VALID_EQUIPMENT.map((item) => {
                const isSelected = selectedEquipment.includes(item)
                return (
                  <Pressable
                    key={item}
                    onPress={() => {
                      void handleToggleEquipment(item)
                    }}
                    minHeight={48}
                    style={{ width: '47%' }}
                    accessibilityRole="checkbox"
                    accessibilityLabel={t(`onboarding.equipment.${item}` as TranslationKey)}
                    accessibilityState={{ checked: isSelected }}
                  >
                    {({ pressed }) => (
                      <Box
                        borderWidth={1}
                        borderColor={isSelected ? 'accentSecondary' : 'borderSubtle'}
                        borderRadius="md"
                        backgroundColor={isSelected ? 'accentSecondaryMuted' : 'surface'}
                        opacity={pressed ? 0.8 : 1}
                        paddingVertical="md"
                        paddingHorizontal="lg"
                        alignItems="center"
                        justifyContent="center"
                        flex={1}
                      >
                        <Text
                          variant="label"
                          color={isSelected ? 'accentSecondary' : 'textPrimary'}
                        >
                          {t(`onboarding.equipment.${item}` as TranslationKey)}
                        </Text>
                      </Box>
                    )}
                  </Pressable>
                )
              })}
            </Box>
          </Box>
        )}

        {isRoutineStep && (
          <Box gap="md">
            <Text variant="h2">{t('onboarding.step3.title')}</Text>
            <Text variant="bodySm" color="textMuted">
              {t('onboarding.step3.helper')}
            </Text>

            {/* Starter choice: template vs custom */}
            <Box flexDirection="row" gap="sm">
              <Pressable
                flex={1}
                minHeight={52}
                onPress={() => setStartMode('template')}
                disabled={hasSavedFirstRoutine}
                accessibilityRole="radio"
                accessibilityLabel={t('onboarding.step3.useTemplate')}
                accessibilityState={{ selected: startMode === 'template' }}
              >
                {({ pressed }) => (
                  <Box
                    flex={1}
                    borderWidth={1}
                    borderColor={startMode === 'template' ? 'accentSecondary' : 'borderSubtle'}
                    borderRadius="md"
                    backgroundColor={startMode === 'template' ? 'accentSecondaryMuted' : 'surface'}
                    opacity={pressed ? 0.8 : 1}
                    alignItems="center"
                    justifyContent="center"
                    paddingVertical="md"
                  >
                    <Text
                      variant="label"
                      color={startMode === 'template' ? 'accentSecondary' : 'textPrimary'}
                    >
                      {t('onboarding.step3.useTemplate')}
                    </Text>
                  </Box>
                )}
              </Pressable>
              <Pressable
                flex={1}
                minHeight={52}
                onPress={() => setStartMode('custom')}
                disabled={hasSavedFirstRoutine}
                accessibilityRole="radio"
                accessibilityLabel={t('onboarding.step3.createOwn')}
                accessibilityState={{ selected: startMode === 'custom' }}
              >
                {({ pressed }) => (
                  <Box
                    flex={1}
                    borderWidth={1}
                    borderColor={startMode === 'custom' ? 'accentSecondary' : 'borderSubtle'}
                    borderRadius="md"
                    backgroundColor={startMode === 'custom' ? 'accentSecondaryMuted' : 'surface'}
                    opacity={pressed ? 0.8 : 1}
                    alignItems="center"
                    justifyContent="center"
                    paddingVertical="md"
                  >
                    <Text
                      variant="label"
                      color={startMode === 'custom' ? 'accentSecondary' : 'textPrimary'}
                    >
                      {t('onboarding.step3.createOwn')}
                    </Text>
                  </Box>
                )}
              </Pressable>
            </Box>

            {startMode === 'template' && (
              <Box gap="sm">
                {TEMPLATE_KEYS.map((key) => {
                  const name = t(TEMPLATE_I18N_KEYS[key])
                  const isSelected = selectedTemplateKey === key
                  return (
                    <Pressable
                      key={key}
                      onPress={() => {
                        setFirstRoutineName(name)
                        setSelectedTemplateKey(key)
                      }}
                      minHeight={48}
                      disabled={hasSavedFirstRoutine}
                      accessibilityRole="radio"
                      accessibilityLabel={name}
                      accessibilityState={{ selected: isSelected }}
                    >
                      {({ pressed }) => (
                        <Box
                          borderWidth={1}
                          borderColor={isSelected ? 'accentSecondary' : 'borderSubtle'}
                          borderRadius="md"
                          backgroundColor={isSelected ? 'accentSecondaryMuted' : 'surface'}
                          opacity={pressed ? 0.8 : 1}
                          flexDirection="row"
                          alignItems="center"
                          justifyContent="space-between"
                          paddingVertical="md"
                          paddingHorizontal="lg"
                        >
                          <Text
                            variant="body"
                            color={isSelected ? 'accentSecondary' : 'textPrimary'}
                            fontWeight={isSelected ? '600' : '400'}
                          >
                            {name}
                          </Text>
                          {isSelected && (
                            <Box
                              width={10}
                              height={10}
                              borderRadius="full"
                              backgroundColor="accentSecondary"
                            />
                          )}
                        </Box>
                      )}
                    </Pressable>
                  )
                })}
                {selectedTemplateKey && !hasSavedFirstRoutine && (
                  <Button
                    title={t('onboarding.step3.addPresetCta')}
                    variant="secondary"
                    onPress={() => void handleAddPresetExercises()}
                    disabled={isAddingPreset}
                    loading={isAddingPreset}
                  />
                )}
              </Box>
            )}

            <Card borderColor="accentSecondary" borderWidth={1}>
              <Text variant="label">{t('onboarding.step3.guideTitle')}</Text>
              <Text variant="bodySm" color="textMuted" marginTop="xs">
                {t('onboarding.step3.guideStep1')}
              </Text>
              <Text variant="bodySm" color="textMuted" marginTop="xs">
                {t('onboarding.step3.guideStep2')}
              </Text>
              <Text variant="bodySm" color="textMuted" marginTop="xs">
                {t('onboarding.step3.guideStep3')}
              </Text>
            </Card>

            <Card>
              <Text variant="label" marginBottom="sm">
                {t('onboarding.step3.nameLabel')}
              </Text>
              <Input
                value={firstRoutineName}
                onChangeText={setFirstRoutineName}
                placeholder={t('onboarding.step3.namePlaceholder')}
                autoCapitalize="words"
                returnKeyType="done"
                editable={!hasSavedFirstRoutine && !isSavingRoutine}
              />
            </Card>

            <Card>
              <Box
                flexDirection="row"
                alignItems="center"
                justifyContent="space-between"
                marginBottom="sm"
              >
                <Text variant="label">{t('onboarding.step3.exercisesTitle')}</Text>
                <Button
                  title={t('onboarding.step3.addExercise')}
                  variant="secondary"
                  onPress={() => setIsExercisePickerVisible(true)}
                  disabled={hasSavedFirstRoutine || isSavingRoutine}
                />
              </Box>

              {firstRoutineExercises.length === 0 ? (
                <Text variant="bodySm" color="textMuted">
                  {t('onboarding.step3.exercisesEmpty')}
                </Text>
              ) : (
                <Box>
                  {firstRoutineExercises.map((exercise, index) => (
                    <Box
                      key={exercise.id}
                      flexDirection="row"
                      alignItems="center"
                      justifyContent="space-between"
                      paddingVertical="sm"
                      borderBottomWidth={index === firstRoutineExercises.length - 1 ? 0 : 1}
                      borderBottomColor="borderSubtle"
                    >
                      <Text variant="body">
                        {getLocalizedExerciseName(exercise.slug, language, exercise.name)}
                      </Text>
                      <Pressable
                        onPress={() => handleRemoveExercise(exercise.id)}
                        disabled={hasSavedFirstRoutine || isSavingRoutine}
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
                  ))}
                </Box>
              )}
            </Card>

            {firstRoutineValidationError ? (
              <Text variant="bodySm" color="error">
                {t(firstRoutineValidationError)}
              </Text>
            ) : null}

            {hasSavedFirstRoutine ? (
              <Text variant="bodySm" color="success">
                {t('onboarding.step3.success')}
              </Text>
            ) : null}
          </Box>
        )}
      </OnboardingScaffold>

      <Modal
        visible={isExercisePickerVisible}
        animationType="slide"
        onRequestClose={() => setIsExercisePickerVisible(false)}
      >
        <ExerciseSearch
          onSelectExercise={handleSelectExercise}
          onClose={() => setIsExercisePickerVisible(false)}
          userId={user.id}
          initialCategory="strength"
          recentExercises={firstRoutineExercises}
        />
      </Modal>
    </>
  )
}
