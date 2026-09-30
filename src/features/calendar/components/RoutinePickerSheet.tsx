import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  Box,
  Button,
  EmptyState,
  Input,
  LoadingState,
  Pressable,
  Text,
} from '../../../components/ui'
import { useI18n } from '../../../i18n/useI18n'
import type { Routine } from '../../../lib/routines'
import { colors, spacing } from '../../../theme'
import type { RoutinePickerSection, RoutinePickerSectionKey } from '../routinePickerModel'

interface RoutinePickerSheetProps {
  targetDateKey: string
  sections: RoutinePickerSection<Routine>[]
  selectedRoutineId: string | null
  isScheduling: boolean
  bottomInset?: number
  isLoadingRoutines?: boolean
  errorMessage?: string | null
  query: string
  onQueryChange: (value: string) => void
  formatCalendarDate: (dateKey: string) => string
  onSelectRoutine: (routineId: string) => void
  onScheduleRoutine: (routineId: string, targetDateKey: string) => void | Promise<void>
  onRetryLoad: () => void
  onCreateRoutine: () => void
  onBack: () => void
  onClose: () => void
}

export function RoutinePickerSheet({
  targetDateKey,
  sections,
  selectedRoutineId,
  isScheduling,
  bottomInset = 0,
  isLoadingRoutines,
  errorMessage,
  query,
  onQueryChange,
  formatCalendarDate,
  onSelectRoutine,
  onScheduleRoutine,
  onRetryLoad,
  onCreateRoutine,
  onBack,
  onClose,
}: RoutinePickerSheetProps) {
  const { t } = useI18n()
  const hasSelection = selectedRoutineId !== null
  const primaryCtaTitle = hasSelection
    ? t('calendar.scheduleRoutineCta')
    : t('calendar.selectRoutineCta')
  const hasRoutines = sections.some((s) => s.data.length > 0)
  const availableSections = useMemo(
    () => sections.filter((section) => section.data.length > 0),
    [sections],
  )
  const [activeSectionKey, setActiveSectionKey] = useState<RoutinePickerSectionKey | null>(
    availableSections[0]?.key ?? null,
  )

  useEffect(() => {
    if (availableSections.length === 0) {
      setActiveSectionKey(null)
      return
    }

    if (
      activeSectionKey === null ||
      !availableSections.some((section) => section.key === activeSectionKey)
    ) {
      setActiveSectionKey(availableSections[0]?.key ?? null)
    }
  }, [activeSectionKey, availableSections])

  const visibleSection = useMemo(() => {
    if (availableSections.length === 0) return null
    return (
      availableSections.find((section) => section.key === activeSectionKey) ?? availableSections[0]
    )
  }, [activeSectionKey, availableSections])

  return (
    <Box flex={1} style={styles.container}>
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="flex-start"
        marginBottom="lg"
        gap="md"
      >
        <Box flex={1}>
          <Text variant="h2" style={styles.sheetTitle}>
            {t('calendar.routineSelectionTitle')}
          </Text>
          <Text marginTop="xs" variant="bodySm" color="textMuted">
            {t('calendar.planFor', { date: formatCalendarDate(targetDateKey) })}
          </Text>
        </Box>
        <Pressable
          onPress={onClose}
          width={32}
          height={32}
          borderRadius="full"
          backgroundColor="backgroundSecondary"
          borderWidth={1}
          borderColor="borderSubtle"
          alignItems="center"
          justifyContent="center"
        >
          <Ionicons name="close" size={20} color={colors.text.primary} />
        </Pressable>
      </Box>

      <Box marginBottom="lg">
        <Box
          flexDirection="row"
          alignItems="center"
          backgroundColor="backgroundSecondary"
          borderRadius="xl"
          borderWidth={1}
          borderColor="borderSubtle"
          paddingHorizontal="md"
          height={52}
        >
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <Input
            value={query}
            onChangeText={onQueryChange}
            placeholder={t('calendar.searchRoutines')}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              borderWidth: 0,
              height: '100%',
              paddingHorizontal: spacing[2],
            }}
          />
        </Box>
      </Box>

      {availableSections.length > 1 ? (
        <Box style={styles.tabRow}>
          {availableSections.map((section) => {
            const isActive = section.key === activeSectionKey
            return (
              <Pressable
                key={section.key}
                onPress={() => setActiveSectionKey(section.key)}
                flex={1}
                paddingVertical="sm"
                paddingHorizontal="sm"
                borderRadius="full"
                backgroundColor={isActive ? 'surface' : undefined}
                borderWidth={isActive ? 1 : 0}
                borderColor={isActive ? 'borderSubtle' : undefined}
                alignItems="center"
                justifyContent="center"
              >
                <Text variant="labelSm" color={isActive ? 'textPrimary' : 'textMuted'}>
                  {section.title}
                </Text>
              </Pressable>
            )
          })}
        </Box>
      ) : null}

      <Box flex={1} style={styles.contentArea}>
        {isLoadingRoutines ? (
          <LoadingState message={t('calendar.loadingRoutines')} />
        ) : errorMessage ? (
          <EmptyState
            title={t('calendar.routineLoadFailedTitle')}
            body={errorMessage}
            ctaLabel={t('common.tryAgain')}
            onCtaPress={onRetryLoad}
            testID="calendar:routinePicker:errorState"
            ctaTestID="calendar:routinePicker:retryButton"
          />
        ) : !hasRoutines && query.trim() ? (
          <Box alignItems="center" justifyContent="center" paddingVertical="xl" flex={1}>
            <Text
              variant="bodySm"
              color="textMuted"
              testID="calendar:routinePicker:noSearchResults"
            >
              {t('calendar.noRoutineMatches')}
            </Text>
          </Box>
        ) : !hasRoutines ? (
          <EmptyState
            title={t('calendar.noRoutinesTitle')}
            body={t('calendar.noRoutinesBody')}
            ctaLabel={t('calendar.createRoutine')}
            onCtaPress={onCreateRoutine}
            testID="calendar:routinePicker:emptyState"
          />
        ) : (
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {visibleSection ? (
              <Box gap="sm">
                {availableSections.length === 1 ? (
                  <Text variant="micro" color="textMuted" style={styles.sectionLabel}>
                    {visibleSection.title}
                  </Text>
                ) : null}
                {visibleSection.data.map((routine) => {
                  const isSelected = selectedRoutineId === routine.id
                  return (
                    <Pressable
                      key={routine.id}
                      testID="calendar:routineRow"
                      onPress={() => onSelectRoutine(routine.id)}
                      padding="lg"
                      borderRadius="xl"
                      backgroundColor={isSelected ? 'surface' : 'backgroundSecondary'}
                      borderWidth={1}
                      borderColor={isSelected ? 'accent' : 'borderSubtle'}
                    >
                      <Box
                        testID={`calendar:routineRow:${routine.id}`}
                        flexDirection="row"
                        justifyContent="space-between"
                        alignItems="center"
                        gap="md"
                      >
                        <Box flex={1}>
                          <Text variant="label" color="textPrimary" style={styles.routineName}>
                            {routine.name}
                          </Text>
                          <Box marginTop="xs" flexDirection="row" alignItems="center" gap="sm">
                            <Box flexDirection="row" alignItems="center" gap="xs">
                              <Ionicons
                                name="fitness-outline"
                                size={12}
                                color={colors.text.muted}
                              />
                              <Text variant="bodySm" color="textMuted">
                                {t('calendar.exerciseCount', { count: routine.items.length })}
                              </Text>
                            </Box>
                            <Box flexDirection="row" alignItems="center" gap="xs">
                              <Ionicons name="time-outline" size={12} color={colors.text.muted} />
                              <Text variant="bodySm" color="textMuted">
                                {`${routine.items.length * 5} min`}
                              </Text>
                            </Box>
                          </Box>
                        </Box>
                        <Box
                          width={24}
                          height={24}
                          borderRadius="full"
                          borderWidth={1}
                          borderColor={isSelected ? 'accent' : 'borderSubtle'}
                          backgroundColor={isSelected ? 'accentPrimaryMuted' : 'surface'}
                          alignItems="center"
                          justifyContent="center"
                        >
                          <Ionicons
                            name={isSelected ? 'checkmark' : 'ellipse-outline'}
                            size={14}
                            color={isSelected ? colors.accent.primary : colors.text.disabled}
                          />
                        </Box>
                      </Box>
                    </Pressable>
                  )
                })}
              </Box>
            ) : null}
          </ScrollView>
        )}
      </Box>

      <Box style={[styles.footer, { paddingBottom: spacing[2] + bottomInset }]}>
        <Button
          testID="calendar:scheduleRoutineButton"
          loading={isScheduling}
          disabled={!hasSelection || isScheduling}
          onPress={() => {
            if (!selectedRoutineId) return
            void onScheduleRoutine(selectedRoutineId, targetDateKey)
          }}
          title={primaryCtaTitle}
          rightAccessory={<Ionicons name="arrow-forward" size={16} color={colors.text.inverse} />}
        />

        <Box flexDirection="row" gap="sm" marginTop="md">
          <Button
            title={t('routines.newRoutine')}
            variant="secondary"
            onPress={onCreateRoutine}
            flex={1}
          />
          <Button title={t('common.back')} variant="ghost" onPress={onBack} flex={1} />
        </Box>
      </Box>
    </Box>
  )
}

const styles = StyleSheet.create({
  container: {
    minHeight: 0,
  },
  contentArea: {
    minHeight: 0,
  },
  sheetTitle: {
    letterSpacing: -0.6,
  },
  sectionLabel: {
    letterSpacing: 1,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginBottom: spacing[4],
    padding: spacing[1],
    borderRadius: 999,
    backgroundColor: colors.bg.secondary,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing[3],
  },
  routineName: {
    letterSpacing: -0.2,
  },
  footer: {
    marginTop: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
  },
})
