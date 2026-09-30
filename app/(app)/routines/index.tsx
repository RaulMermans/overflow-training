import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, Animated, Pressable } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Redirect, Stack, useRouter } from 'expo-router'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { AppHeader, Box, Button, Card, ErrorCard, Screen, Text } from '../../../src/components/ui'
import { useAuth } from '../../../src/auth/useAuth'
import {
  loadRoutineUsage,
  loadRoutines,
  type Routine,
  type RoutineUsageMap,
} from '../../../src/lib/routines'
import { listRoutineFavorites, toggleRoutineFavorite } from '../../../src/db/favorites'
import { buildActionableErrorState } from '../../../src/utils/errorMessages'
import { SyncStatusPill } from '../../../src/components/sync/SyncStatusPill'
import { useSyncStatus } from '../../../src/features/sync/useSyncStatus'
import { useI18n } from '../../../src/i18n/useI18n'
import { colors, motion } from '../../../src/theme'
import { hapticSelection } from '../../../src/lib/feedback'
import { shouldAnimate, useReducedMotion } from '../../../src/lib/motion'

function StarButton({
  isFavorite,
  onToggle,
  reducedMotion,
  accessibilityLabel,
}: {
  isFavorite: boolean
  onToggle: () => void
  reducedMotion: boolean
  accessibilityLabel: string
}) {
  const scale = useRef(new Animated.Value(1)).current
  const handlePress = () => {
    hapticSelection(reducedMotion)
    if (shouldAnimate(reducedMotion)) {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.35,
          duration: motion.duration.fast,
          easing: motion.easing.spring,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: motion.duration.fast,
          easing: motion.easing.easeOut,
          useNativeDriver: true,
        }),
      ]).start()
    }
    onToggle()
  }
  return (
    <Pressable
      onPress={handlePress}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={isFavorite ? 'star' : 'star-outline'}
          size={18}
          color={isFavorite ? colors.semantic.warning : colors.text.muted}
        />
      </Animated.View>
    </Pressable>
  )
}

function routineSortValue(
  routine: Routine,
  usage: RoutineUsageMap,
): {
  pinned: number
  usedCount: number
  lastUsedAt: string
  updatedAt: string
} {
  const usageEntry = usage[routine.id]

  return {
    pinned: routine.pinned ? 1 : 0,
    usedCount: usageEntry?.usedCount ?? 0,
    lastUsedAt: usageEntry?.lastUsedAt ?? '',
    updatedAt: routine.updatedAt,
  }
}

export default function RoutinesIndexScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const sync = useSyncStatus()
  const { t } = useI18n()
  const reducedMotion = useReducedMotion()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [usage, setUsage] = useState<RoutineUsageMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown | null>(null)
  const [favoritedRoutineIds, setFavoritedRoutineIds] = useState<Set<string>>(new Set())

  const loadAllRoutines = useCallback(async () => {
    if (!user) {
      setRoutines([])
      setUsage({})
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const [loadedRoutines, loadedUsage, favData] = await Promise.all([
        loadRoutines(user.id),
        loadRoutineUsage(user.id),
        listRoutineFavorites(user.id),
      ])
      setRoutines(loadedRoutines)
      setUsage(loadedUsage)
      setFavoritedRoutineIds(favData.data ?? new Set())
    } catch (loadError) {
      setRoutines([])
      setUsage({})
      setError(loadError instanceof Error ? loadError.message : t('routines.errorLoad'))
    }

    setIsLoading(false)
  }, [t, user])

  useFocusEffect(
    useCallback(() => {
      void loadAllRoutines()
    }, [loadAllRoutines]),
  )

  const sortedRoutines = useMemo(() => {
    return [...routines].sort((a, b) => {
      const aMeta = routineSortValue(a, usage)
      const bMeta = routineSortValue(b, usage)

      if (aMeta.pinned !== bMeta.pinned) return bMeta.pinned - aMeta.pinned
      if (aMeta.usedCount !== bMeta.usedCount) return bMeta.usedCount - aMeta.usedCount
      if (aMeta.lastUsedAt !== bMeta.lastUsedAt)
        return bMeta.lastUsedAt.localeCompare(aMeta.lastUsedAt)
      return bMeta.updatedAt.localeCompare(aMeta.updatedAt)
    })
  }, [routines, usage])

  const { favoriteRoutines, otherRoutines } = useMemo(
    () => ({
      favoriteRoutines: sortedRoutines.filter((r) => favoritedRoutineIds.has(r.id)),
      otherRoutines: sortedRoutines.filter((r) => !favoritedRoutineIds.has(r.id)),
    }),
    [sortedRoutines, favoritedRoutineIds],
  )
  const errorState = useMemo(() => {
    if (!error) return null
    return buildActionableErrorState(error)
  }, [error])
  const formatLastUsed = useCallback(
    (routineId: string) => {
      const usageEntry = usage[routineId]
      if (!usageEntry?.lastUsedAt) return t('routines.notStartedYet')

      return t('routines.lastUsed', {
        date: new Date(usageEntry.lastUsedAt).toLocaleDateString(),
      })
    },
    [t, usage],
  )
  const handleCreateRoutine = useCallback(() => {
    router.push('/(app)/routines/new')
  }, [router])

  if (!user) {
    return <Redirect href="/(auth)/login" />
  }

  const handleToggleFavorite = async (routineId: string) => {
    const isFav = favoritedRoutineIds.has(routineId)
    setFavoritedRoutineIds((prev) => {
      const next = new Set(prev)
      if (isFav) {
        next.delete(routineId)
      } else {
        next.add(routineId)
      }
      return next
    })
    const { error: favError } = await toggleRoutineFavorite(user.id, routineId, !isFav)
    if (favError) {
      setFavoritedRoutineIds((prev) => {
        const next = new Set(prev)
        if (isFav) {
          next.add(routineId)
        } else {
          next.delete(routineId)
        }
        return next
      })
      Alert.alert(t('common.error'), t('routines.favoriteError'))
    }
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerRight: () => (
            <Pressable
              testID="routines:headerCreateRoutine"
              accessibilityRole="button"
              accessibilityLabel={t('routines.newRoutine')}
              onPress={handleCreateRoutine}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={24} color={colors.accent.primary} />
            </Pressable>
          ),
        }}
      />
      <AppHeader title={t('routines.title')} subtitle={t('routines.subtitle')} />
      <SyncStatusPill />
      {sync.migrationRunning ? (
        <Card marginBottom="md">
          <Text variant="bodySm" color="textMuted">
            {t('sync.migratingRoutines')}
          </Text>
        </Card>
      ) : null}

      {errorState ? (
        <ErrorCard
          title={
            errorState.kind === 'offline'
              ? t('errors.offline.title')
              : errorState.kind === 'sync'
                ? t('errors.sync.title')
                : t('errors.generic.title')
          }
          message={
            errorState.kind === 'offline'
              ? t('errors.offline.message')
              : errorState.kind === 'sync'
                ? t('errors.sync.message')
                : t('errors.generic.message')
          }
          primaryActionLabel={
            errorState.primaryAction === 'check_connection'
              ? t('errors.action.checkConnection')
              : t('common.tryAgain')
          }
          onPrimaryAction={() => void loadAllRoutines()}
          detailsLabel={t('errors.action.details')}
          detailsTitle={t('errors.detailsTitle')}
          details={errorState.rawMessage}
          closeLabel={t('common.close')}
        />
      ) : null}

      <Box flex={1}>
        {isLoading ? (
          <Box gap="sm" paddingBottom="4xl" marginBottom="4xl">
            {[0, 1, 2, 3, 4].map((index) => (
              <Card key={`routine-skeleton-${index}`}>
                <Box
                  flexDirection="row"
                  justifyContent="space-between"
                  alignItems="center"
                  gap="sm"
                >
                  <Box flex={1} gap="xs">
                    <Box
                      height={14}
                      width="60%"
                      borderRadius="sm"
                      backgroundColor="backgroundSecondary"
                    />
                    <Box
                      height={12}
                      width="44%"
                      borderRadius="sm"
                      backgroundColor="backgroundSecondary"
                    />
                    <Box
                      height={12}
                      width="38%"
                      borderRadius="sm"
                      backgroundColor="backgroundSecondary"
                    />
                  </Box>
                  <Box
                    width={88}
                    height={36}
                    borderRadius="md"
                    backgroundColor="backgroundSecondary"
                  />
                </Box>
              </Card>
            ))}
          </Box>
        ) : sortedRoutines.length === 0 ? (
          <Card testID="routines:emptyState" marginTop="sm">
            <Box gap="md">
              <Box gap="xs">
                <Text variant="h3">{t('routines.emptyTitle')}</Text>
                <Text variant="bodySm" color="textMuted">
                  {t('routines.emptyBody')}
                </Text>
              </Box>
              <Button
                testID="routines:emptyCreateRoutine"
                title={t('routines.newRoutine')}
                onPress={handleCreateRoutine}
                leftAccessory={<Ionicons name="add" size={18} color={colors.text.inverse} />}
              />
            </Box>
          </Card>
        ) : (
          <Box gap="sm" paddingBottom="4xl" marginBottom="4xl">
            {favoriteRoutines.length > 0 ? (
              <Text variant="label" color="textMuted" marginBottom="xs">
                {t('lists.section.favorites')}
              </Text>
            ) : null}
            {[...favoriteRoutines, ...otherRoutines].map((routine, index) => {
              const isFav = favoritedRoutineIds.has(routine.id)
              return (
                <Card
                  key={routine.id}
                  testID={`routines:routineRow:${routine.id}`}
                  animateOnMount
                  animateDelay={Math.min(index, 5) * 60}
                >
                  <Box
                    flexDirection="row"
                    justifyContent="space-between"
                    alignItems="center"
                    gap="sm"
                  >
                    <Box flexDirection="row" alignItems="center" gap="sm" flex={1}>
                      <MaterialCommunityIcons
                        name="clipboard-list-outline"
                        size={18}
                        color={colors.text.muted}
                      />
                      <Box flex={1}>
                        <Text variant="label">{routine.name}</Text>
                        <Text marginTop="xs" variant="bodySm" color="textMuted">
                          {routine.pinned ? `${t('routines.pinned')} · ` : ''}
                          {formatLastUsed(routine.id)}
                        </Text>
                        <Text marginTop="xs" variant="bodySm" color="textMuted">
                          {t('routines.exerciseCount', {
                            count: String(routine.items.length),
                            plural: routine.items.length === 1 ? '' : 's',
                          })}
                        </Text>
                      </Box>
                    </Box>
                    <Box flexDirection="row" alignItems="center" gap="xs">
                      <StarButton
                        isFavorite={isFav}
                        onToggle={() => void handleToggleFavorite(routine.id)}
                        reducedMotion={reducedMotion}
                        accessibilityLabel={isFav ? t('common.unstar') : t('common.star')}
                      />
                    </Box>
                  </Box>

                  <Box marginTop="sm">
                    <Button
                      title={t('routines.open')}
                      variant="ghost"
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/routines/[id]',
                          params: { id: routine.id },
                        })
                      }
                    />
                  </Box>
                </Card>
              )
            })}
          </Box>
        )}
      </Box>

      <Box
        position="absolute"
        left={0}
        right={0}
        bottom={0}
        paddingTop="sm"
        paddingBottom="xl"
        paddingHorizontal="lg"
        backgroundColor="background"
        borderTopWidth={1}
        borderTopColor="borderSubtle"
      >
        <Button
          testID="routines:stickyCreateRoutine"
          title={t('routines.newRoutine')}
          onPress={handleCreateRoutine}
          leftAccessory={<Ionicons name="add" size={18} color={colors.text.inverse} />}
        />
      </Box>
    </Screen>
  )
}
