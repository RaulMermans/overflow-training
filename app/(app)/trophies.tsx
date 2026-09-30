import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { AppHeader, Box, Pressable, Screen } from '../../src/components/ui'
import { EmptyState } from '../../src/components/ui/EmptyState'
import FilterPill from '../../src/components/ui/FilterPill'
import ProgressBar from '../../src/components/ui/ProgressBar'
import { useAuth } from '../../src/auth/useAuth'
import { useI18n } from '../../src/i18n/useI18n'
import type { TranslationKey } from '../../src/i18n'
import { TROPHY_CATALOG } from '../../src/features/trophies/catalog'
import type { TrophyDefinition, TrophyTier } from '../../src/features/trophies/catalog'
import { loadTrophyState } from '../../src/features/trophies/storage'
import type { TrophyState } from '../../src/features/trophies/storage'
import {
  getTrophyPresentationState,
  type TrophyFilterOption,
} from '../../src/features/trophies/presentation'
import { colors } from '../../src/theme/tokens'

type FilterOption = TrophyFilterOption

type TierTheme = {
  badge: {
    text: string
    bg: string
    icon: keyof typeof Ionicons.glyphMap
  }
  row: {
    focusedBg: string
    focusedBorder: string
    subtleBg: string
    subtleBorder: string
    lockedFocusedBg: string
    lockedSubtleBg: string
    hiddenLockedBg: string
    hiddenLockedBorder: string
    completedGlow: string
    highlightFlash: string
  }
  hero: {
    badgeBg: string
    badgeBorder: string
    badgeText: string
    glowTop: string
    glowBottom: string
    border: string
    background: string
  }
  progressColor: string
  completion: {
    chipBg: string
    chipBorder: string
    chipText: string
  }
}

const TIER_THEME: Record<TrophyTier, TierTheme> = {
  bronze: {
    badge: { text: colors.tier.bronze, bg: colors.tier.bronzeMuted, icon: 'trophy' },
    row: {
      focusedBg: 'rgba(169, 113, 66, 0.18)',
      focusedBorder: 'rgba(169, 113, 66, 0.42)',
      subtleBg: 'rgba(169, 113, 66, 0.10)',
      subtleBorder: 'rgba(169, 113, 66, 0.22)',
      lockedFocusedBg: 'rgba(169, 113, 66, 0.10)',
      lockedSubtleBg: 'rgba(169, 113, 66, 0.06)',
      hiddenLockedBg: 'rgba(97, 46, 44, 0.06)',
      hiddenLockedBorder: colors.border.subtle,
      completedGlow: 'rgba(169, 113, 66, 0.24)',
      highlightFlash: 'rgba(169, 113, 66, 0.34)',
    },
    hero: {
      badgeBg: 'rgba(169, 113, 66, 0.16)',
      badgeBorder: 'rgba(169, 113, 66, 0.35)',
      badgeText: colors.tier.bronze,
      glowTop: 'rgba(169, 113, 66, 0.28)',
      glowBottom: 'rgba(97, 46, 44, 0.14)',
      border: 'rgba(169, 113, 66, 0.35)',
      background: 'rgba(169, 113, 66, 0.12)',
    },
    progressColor: colors.tier.bronze,
    completion: {
      chipBg: 'rgba(169, 113, 66, 0.18)',
      chipBorder: 'rgba(169, 113, 66, 0.38)',
      chipText: colors.tier.bronze,
    },
  },
  silver: {
    badge: { text: colors.tier.silver, bg: colors.tier.silverMuted, icon: 'trophy' },
    row: {
      focusedBg: 'rgba(118, 118, 118, 0.16)',
      focusedBorder: 'rgba(118, 118, 118, 0.40)',
      subtleBg: 'rgba(118, 118, 118, 0.10)',
      subtleBorder: 'rgba(118, 118, 118, 0.22)',
      lockedFocusedBg: 'rgba(118, 118, 118, 0.10)',
      lockedSubtleBg: 'rgba(118, 118, 118, 0.06)',
      hiddenLockedBg: 'rgba(97, 46, 44, 0.06)',
      hiddenLockedBorder: colors.border.subtle,
      completedGlow: 'rgba(118, 118, 118, 0.20)',
      highlightFlash: 'rgba(118, 118, 118, 0.30)',
    },
    hero: {
      badgeBg: 'rgba(118, 118, 118, 0.14)',
      badgeBorder: 'rgba(118, 118, 118, 0.32)',
      badgeText: colors.tier.silver,
      glowTop: 'rgba(118, 118, 118, 0.25)',
      glowBottom: 'rgba(97, 46, 44, 0.14)',
      border: 'rgba(118, 118, 118, 0.32)',
      background: 'rgba(118, 118, 118, 0.10)',
    },
    progressColor: colors.tier.silver,
    completion: {
      chipBg: 'rgba(118, 118, 118, 0.16)',
      chipBorder: 'rgba(118, 118, 118, 0.36)',
      chipText: colors.tier.silver,
    },
  },
  gold: {
    badge: { text: colors.tier.gold, bg: colors.tier.goldMuted, icon: 'trophy' },
    row: {
      focusedBg: 'rgba(215, 154, 93, 0.22)',
      focusedBorder: 'rgba(215, 154, 93, 0.45)',
      subtleBg: 'rgba(215, 154, 93, 0.12)',
      subtleBorder: 'rgba(215, 154, 93, 0.24)',
      lockedFocusedBg: 'rgba(215, 154, 93, 0.12)',
      lockedSubtleBg: 'rgba(215, 154, 93, 0.07)',
      hiddenLockedBg: 'rgba(97, 46, 44, 0.06)',
      hiddenLockedBorder: colors.border.subtle,
      completedGlow: 'rgba(215, 154, 93, 0.26)',
      highlightFlash: 'rgba(215, 154, 93, 0.34)',
    },
    hero: {
      badgeBg: 'rgba(215, 154, 93, 0.18)',
      badgeBorder: 'rgba(215, 154, 93, 0.38)',
      badgeText: colors.tier.gold,
      glowTop: 'rgba(215, 154, 93, 0.30)',
      glowBottom: 'rgba(129, 62, 58, 0.16)',
      border: 'rgba(215, 154, 93, 0.36)',
      background: 'rgba(215, 154, 93, 0.14)',
    },
    progressColor: colors.tier.gold,
    completion: {
      chipBg: 'rgba(215, 154, 93, 0.20)',
      chipBorder: 'rgba(215, 154, 93, 0.40)',
      chipText: colors.tier.gold,
    },
  },
  diamond: {
    badge: { text: colors.tier.diamond, bg: colors.tier.diamondMuted, icon: 'diamond' },
    row: {
      focusedBg: 'rgba(129, 62, 58, 0.22)',
      focusedBorder: 'rgba(215, 154, 93, 0.46)',
      subtleBg: 'rgba(129, 62, 58, 0.12)',
      subtleBorder: 'rgba(129, 62, 58, 0.26)',
      lockedFocusedBg: 'rgba(129, 62, 58, 0.14)',
      lockedSubtleBg: 'rgba(129, 62, 58, 0.08)',
      hiddenLockedBg: colors.accent.primaryMuted,
      hiddenLockedBorder: 'rgba(215, 154, 93, 0.38)',
      completedGlow: 'rgba(215, 154, 93, 0.24)',
      highlightFlash: 'rgba(215, 154, 93, 0.34)',
    },
    hero: {
      badgeBg: colors.bg.primary,
      badgeBorder: colors.border.subtle,
      badgeText: colors.accent.primary,
      glowTop: 'rgba(215, 154, 93, 0.23)',
      glowBottom: 'rgba(129, 62, 58, 0.17)',
      border: colors.accent.secondaryMuted,
      background: colors.bg.secondary,
    },
    progressColor: colors.accent.secondary,
    completion: {
      chipBg: 'rgba(215, 154, 93, 0.20)',
      chipBorder: 'rgba(215, 154, 93, 0.40)',
      chipText: colors.accent.secondary,
    },
  },
}

function TierBadge({
  tier,
  muted,
}: {
  tier: TrophyTier | null
  muted?: boolean
}): React.JSX.Element {
  if (!tier) {
    return (
      <View style={[styles.badge, { backgroundColor: colors.bg.elevated }]}>
        <Text style={[styles.badgeText, { color: colors.text.muted }]}>?</Text>
      </View>
    )
  }

  const tierTheme = TIER_THEME[tier]
  const textColor = muted ? colors.text.muted : tierTheme.badge.text
  const bgColor = muted ? colors.bg.elevated : tierTheme.badge.bg

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Ionicons name={tierTheme.badge.icon} size={18} color={textColor} />
    </View>
  )
}

interface TrophyRowProps {
  def: TrophyDefinition
  trophyState: TrophyState | null
  highlight: boolean
  activeFilter: FilterOption
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

function TrophyRow({
  def,
  trophyState,
  highlight,
  activeFilter,
  t,
}: TrophyRowProps): React.JSX.Element {
  const presentation = getTrophyPresentationState(def, trophyState, activeFilter)
  const tierTheme = TIER_THEME[def.tier]

  const highlightAnim = useRef(new Animated.Value(highlight ? 1 : 0)).current
  const unlockPulseAnim = useRef(new Animated.Value(0)).current
  const hasPlayedUnlockPulse = useRef(false)

  const unlockedEntry = trophyState?.unlocked[def.id]

  useEffect(() => {
    if (!highlight) return

    Animated.sequence([
      Animated.delay(320),
      Animated.timing(highlightAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(highlightAnim, {
        toValue: 0,
        duration: 1600,
        useNativeDriver: true,
      }),
    ]).start()
  }, [highlight, highlightAnim])

  useEffect(() => {
    if (!presentation.isUnlocked || !presentation.isFocusedTier) return
    if (hasPlayedUnlockPulse.current) return

    hasPlayedUnlockPulse.current = true
    Animated.sequence([
      Animated.timing(unlockPulseAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(unlockPulseAnim, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start()
  }, [presentation.isFocusedTier, presentation.isUnlocked, unlockPulseAnim])

  const title = presentation.isHiddenLocked
    ? t('trophies.secret.title')
    : t(`trophies.${def.id}.title` as TranslationKey)

  const desc = presentation.isHiddenLocked
    ? t('trophies.secret.howTo')
    : presentation.isUnlocked && unlockedEntry
      ? t('trophies.unlockedOn', { date: formatDate(unlockedEntry.unlockedAt) })
      : t(`trophies.${def.id}.howTo` as TranslationKey)

  let progressPct = 0
  let progressCurrent: number | null = null
  let progressTotal: number | null = null

  if (
    !presentation.isUnlocked &&
    !presentation.isHiddenLocked &&
    def.thresholdMetric &&
    typeof def.thresholdValue === 'number' &&
    trophyState
  ) {
    const counterValue = trophyState.counters[def.thresholdMetric]
    if (typeof counterValue === 'number') {
      progressCurrent = counterValue
      progressTotal = def.thresholdValue
      progressPct = Math.min((counterValue / def.thresholdValue) * 100, 99)
    }
  }

  const showProgress = progressCurrent !== null && progressTotal !== null && progressPct > 0

  const rowBackground = presentation.isHiddenLocked
    ? tierTheme.row.hiddenLockedBg
    : presentation.isUnlocked
      ? presentation.isFocusedTier
        ? tierTheme.row.focusedBg
        : tierTheme.row.subtleBg
      : presentation.useSubtleTierAccents
        ? tierTheme.row.lockedSubtleBg
        : tierTheme.row.lockedFocusedBg

  const rowBorderColor = presentation.isHiddenLocked
    ? tierTheme.row.hiddenLockedBorder
    : presentation.isUnlocked
      ? presentation.isFocusedTier
        ? tierTheme.row.focusedBorder
        : tierTheme.row.subtleBorder
      : presentation.useSubtleTierAccents
        ? tierTheme.row.subtleBorder
        : tierTheme.row.focusedBorder

  const flashOpacity = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.28],
  })

  const rowScale = unlockPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.01],
  })

  const completionGlowOpacity = unlockPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.24],
  })

  return (
    <Animated.View
      style={[
        styles.rowContainer,
        {
          backgroundColor: rowBackground,
          borderColor: rowBorderColor,
          transform: [{ scale: rowScale }],
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.rowFlash,
          {
            backgroundColor: tierTheme.row.highlightFlash,
            opacity: flashOpacity,
          },
        ]}
      />

      {presentation.isUnlocked ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rowUnlockGlow,
            {
              backgroundColor: tierTheme.row.completedGlow,
              opacity: completionGlowOpacity,
            },
          ]}
        />
      ) : null}

      {presentation.isUnlocked ? (
        <View
          pointerEvents="none"
          style={[styles.rowUnlockOrb, { backgroundColor: tierTheme.row.completedGlow }]}
        />
      ) : null}

      {presentation.isHiddenLocked ? (
        <>
          <View pointerEvents="none" style={styles.hiddenLockedGlowTop} />
          <View pointerEvents="none" style={styles.hiddenLockedGlowBottom} />
        </>
      ) : null}

      <TierBadge
        tier={presentation.isHiddenLocked ? null : def.tier}
        muted={!presentation.isUnlocked && !presentation.isHiddenLocked}
      />

      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, !presentation.isUnlocked && styles.rowTitleMuted]}>
          {title}
        </Text>

        {presentation.showCompletionChip ? (
          <View
            style={[
              styles.completedChip,
              {
                backgroundColor: tierTheme.completion.chipBg,
                borderColor: tierTheme.completion.chipBorder,
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={12} color={tierTheme.completion.chipText} />
            <Text style={[styles.completedChipText, { color: tierTheme.completion.chipText }]}>
              {t('trophies.completedBadge')}
            </Text>
          </View>
        ) : presentation.isHiddenLocked ? (
          <View style={styles.secretChip}>
            <Ionicons name="sparkles" size={12} color={colors.accent.secondary} />
            <Text style={styles.secretChipText}>{t('trophies.secret.badge')}</Text>
          </View>
        ) : null}

        <Text style={styles.rowDesc}>{desc}</Text>

        {showProgress ? (
          <View style={styles.progressWrapper}>
            <ProgressBar
              value={progressPct}
              height={4}
              color={tierTheme.progressColor}
              animated={false}
            />
            <Text style={styles.progressLabel}>
              {t('trophies.progress', {
                current: String(Math.max(0, Math.floor(progressCurrent ?? 0))),
                total: String(progressTotal ?? 0),
              })}
            </Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

const FILTERS: FilterOption[] = ['all', 'bronze', 'silver', 'gold', 'diamond']

function getHeroCopy(
  tier: TrophyTier,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  if (tier === 'diamond') {
    return {
      label: t('trophies.diamod.label'),
      title: t('trophies.diamod.title'),
      body: t('trophies.diamod.body'),
    }
  }

  return {
    label: t(`trophies.filter.${tier}` as TranslationKey),
    title: t(`trophies.hero.${tier}.title` as TranslationKey),
    body: t(`trophies.hero.${tier}.body` as TranslationKey),
  }
}

export default function TrophiesScreen(): React.JSX.Element {
  const router = useRouter()
  const { user } = useAuth()
  const { t } = useI18n()
  const { highlight } = useLocalSearchParams<{ highlight?: string }>()

  const [trophyState, setTrophyState] = useState<TrophyState | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all')
  const flatListRef = useRef<FlatList<TrophyDefinition>>(null)
  const heroAnim = useRef(new Animated.Value(0)).current

  const loadState = useCallback(async () => {
    if (!user?.id) return
    const state = await loadTrophyState(user.id)
    setTrophyState(state)
  }, [user?.id])

  useFocusEffect(
    useCallback(() => {
      void loadState()
    }, [loadState]),
  )

  useEffect(() => {
    if (activeFilter === 'all') {
      Animated.timing(heroAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start()
      return
    }

    heroAnim.setValue(0)
    Animated.parallel([
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start()
  }, [activeFilter, heroAnim])

  const handleCloseWithFallback = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }

    router.replace('/(app)/(tabs)/profile')
  }, [router])

  const displayData = useMemo((): TrophyDefinition[] => {
    const filtered =
      activeFilter === 'all'
        ? TROPHY_CATALOG.slice()
        : TROPHY_CATALOG.filter((definition) => definition.tier === activeFilter)

    return [...filtered].sort((left, right) => {
      const leftUnlocked = trophyState?.unlocked[left.id]?.unlockedAt
      const rightUnlocked = trophyState?.unlocked[right.id]?.unlockedAt

      if (leftUnlocked && rightUnlocked) {
        return rightUnlocked < leftUnlocked ? -1 : rightUnlocked > leftUnlocked ? 1 : 0
      }
      if (leftUnlocked) return -1
      if (rightUnlocked) return 1

      if (!left.hidden && right.hidden) return -1
      if (left.hidden && !right.hidden) return 1
      return 0
    })
  }, [activeFilter, trophyState])

  useEffect(() => {
    if (!highlight || displayData.length === 0) return

    const index = displayData.findIndex((definition) => definition.id === highlight)
    if (index < 0) return

    const timer = setTimeout(() => {
      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.3,
      })
    }, 400)

    return () => {
      clearTimeout(timer)
    }
  }, [displayData, highlight])

  const renderItem = useCallback(
    ({ item }: { item: TrophyDefinition }) => (
      <TrophyRow
        def={item}
        trophyState={trophyState}
        highlight={item.id === highlight}
        activeFilter={activeFilter}
        t={t}
      />
    ),
    [activeFilter, highlight, t, trophyState],
  )

  const keyExtractor = useCallback((item: TrophyDefinition) => item.id, [])

  const activeHeroTier = activeFilter === 'all' ? null : activeFilter
  const activeHeroTheme = activeHeroTier ? TIER_THEME[activeHeroTier] : null
  const heroCopy = activeHeroTier ? getHeroCopy(activeHeroTier, t) : null
  const heroIconName: keyof typeof Ionicons.glyphMap =
    activeHeroTier === 'diamond' ? 'diamond' : 'trophy'

  return (
    <Screen scroll={false} horizontalPadding="none" bottomPadding="none">
      <Stack.Screen options={{ headerShown: false, headerBackVisible: false }} />

      <Box paddingHorizontal="xl" paddingTop="xl">
        <Pressable
          onPress={handleCloseWithFallback}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          minHeight={44}
          minWidth={44}
          alignItems="center"
          justifyContent="center"
          alignSelf="flex-start"
          borderRadius="full"
          borderWidth={1}
          borderColor="borderSubtle"
          backgroundColor="surface"
        >
          {({ pressed }) => (
            <Ionicons
              name="close"
              size={22}
              color={colors.text.secondary}
              style={{ opacity: pressed ? 0.8 : 1 }}
            />
          )}
        </Pressable>

        <AppHeader
          title={t('trophies.title')}
          subtitle={t('trophies.subtitle')}
          variant="compact"
        />
      </Box>

      {activeHeroTier && activeHeroTheme && heroCopy ? (
        <Animated.View
          style={[
            styles.hero,
            {
              backgroundColor: activeHeroTheme.hero.background,
              borderColor: activeHeroTheme.hero.border,
              opacity: heroAnim,
              transform: [
                {
                  translateY: heroAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [6, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[styles.heroGlowTop, { backgroundColor: activeHeroTheme.hero.glowTop }]}
          />
          <View
            pointerEvents="none"
            style={[styles.heroGlowBottom, { backgroundColor: activeHeroTheme.hero.glowBottom }]}
          />

          <View
            style={[
              styles.heroBadge,
              {
                backgroundColor: activeHeroTheme.hero.badgeBg,
                borderColor: activeHeroTheme.hero.badgeBorder,
              },
            ]}
          >
            <Ionicons name={heroIconName} size={16} color={activeHeroTheme.hero.badgeText} />
            <Text style={[styles.heroBadgeText, { color: activeHeroTheme.hero.badgeText }]}>
              {heroCopy.label}
            </Text>
          </View>

          <Text style={styles.heroTitle}>{heroCopy.title}</Text>
          <Text style={styles.heroBody}>{heroCopy.body}</Text>
        </Animated.View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {FILTERS.map((filter) => (
          <FilterPill
            key={filter}
            label={t(`trophies.filter.${filter}` as TranslationKey)}
            isActive={activeFilter === filter}
            onPress={() => setActiveFilter(filter)}
          />
        ))}
      </ScrollView>

      <FlatList
        ref={flatListRef}
        data={displayData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState title={t('trophies.emptyFilter')} message={t('trophies.emptyFilterBody')} />
        }
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          flatListRef.current?.scrollToOffset({
            offset: index * averageItemLength,
            animated: true,
          })
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  hero: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    gap: 8,
  },
  heroGlowTop: {
    position: 'absolute',
    top: -22,
    right: -20,
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  heroGlowBottom: {
    position: 'absolute',
    bottom: -20,
    left: -16,
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
    color: colors.text.primary,
  },
  heroBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.secondary,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginLeft: 52,
  },
  rowContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 10,
    overflow: 'hidden',
    borderWidth: 1,
  },
  rowFlash: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
  },
  rowUnlockGlow: {
    position: 'absolute',
    top: -26,
    right: -12,
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  rowUnlockOrb: {
    position: 'absolute',
    bottom: -24,
    left: -4,
    width: 74,
    height: 74,
    borderRadius: 37,
    opacity: 0.5,
  },
  hiddenLockedGlowTop: {
    position: 'absolute',
    top: -24,
    right: -14,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(215, 154, 93, 0.20)',
  },
  hiddenLockedGlowBottom: {
    position: 'absolute',
    bottom: -28,
    left: -6,
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(129, 62, 58, 0.14)',
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  rowContent: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 20,
  },
  rowTitleMuted: {
    color: colors.text.muted,
    fontWeight: '500',
  },
  rowDesc: {
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 18,
  },
  progressWrapper: {
    marginTop: 8,
    gap: 4,
  },
  progressLabel: {
    fontSize: 11,
    color: colors.text.muted,
    letterSpacing: 0.2,
  },
  completedChip: {
    marginTop: 4,
    marginBottom: 2,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  completedChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  secretChip: {
    marginTop: 4,
    marginBottom: 2,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(215, 154, 93, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(215, 154, 93, 0.36)',
  },
  secretChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: colors.accent.primary,
    textTransform: 'uppercase',
  },
})
