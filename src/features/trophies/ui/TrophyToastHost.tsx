import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { colors } from '../../../theme/tokens'
import { getTrophy } from '../catalog'
import type { TrophyTier } from '../catalog'
import { useI18n } from '../../../i18n/useI18n'
import type { TranslationKey } from '../../../i18n'

// ── Context ───────────────────────────────────────────────────────────────────

interface TrophyToastContextValue {
  enqueueToast: (trophyId: string) => void
}

const TrophyToastContext = createContext<TrophyToastContextValue>({
  enqueueToast: () => {},
})

// ── Provider ──────────────────────────────────────────────────────────────────

export function TrophyToastProvider({ children }: PropsWithChildren): React.JSX.Element {
  const queueRef = useRef<string[]>([])
  const animatingRef = useRef(false)

  const [currentToastId, setCurrentToastId] = useState<string | null>(null)
  const slideY = useRef(new Animated.Value(80)).current
  const fadeOpacity = useRef(new Animated.Value(0)).current

  const drain = useCallback(() => {
    if (animatingRef.current) return
    const next = queueRef.current.shift()
    if (!next) return

    animatingRef.current = true
    slideY.setValue(80)
    fadeOpacity.setValue(0)
    setCurrentToastId(next)

    // Slide + fade IN
    Animated.parallel([
      Animated.timing(slideY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Hold for 3200ms then slide + fade OUT
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(slideY, {
            toValue: 80,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(fadeOpacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setCurrentToastId(null)
          animatingRef.current = false
          drain()
        })
      }, 3200)
    })
  }, [fadeOpacity, slideY])

  const enqueueToast = useCallback(
    (trophyId: string) => {
      queueRef.current.push(trophyId)
      drain()
    },
    [drain],
  )

  return (
    <TrophyToastContext.Provider value={{ enqueueToast }}>
      {children}
      <_TrophyToastOverlay
        currentToastId={currentToastId}
        slideY={slideY}
        fadeOpacity={fadeOpacity}
      />
    </TrophyToastContext.Provider>
  )
}

export function useTrophyToasts(): TrophyToastContextValue {
  return useContext(TrophyToastContext)
}

// ── Overlay (inside provider, has router access) ──────────────────────────────

interface OverlayProps {
  currentToastId: string | null
  slideY: Animated.Value
  fadeOpacity: Animated.Value
}

function _TrophyToastOverlay({
  currentToastId,
  slideY,
  fadeOpacity,
}: OverlayProps): React.JSX.Element | null {
  const router = useRouter()
  const { t } = useI18n()

  if (!currentToastId) return null

  const def = getTrophy(currentToastId)
  if (!def) return null

  const title = t(`trophies.${currentToastId}.title` as TranslationKey)
  const desc = t(`trophies.${currentToastId}.desc` as TranslationKey)

  const handlePress = () => {
    router.push(`/(app)/trophies?highlight=${currentToastId}`)
  }

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Animated.View
        style={[styles.container, { transform: [{ translateY: slideY }], opacity: fadeOpacity }]}
      >
        <Pressable onPress={handlePress} style={styles.card}>
          <TierBadge tier={def.tier} />
          <View style={styles.textBlock}>
            <_ToastLabel>{t('trophies.toast.unlocked')}</_ToastLabel>
            <_ToastTitle>{title}</_ToastTitle>
            <_ToastDesc>{desc}</_ToastDesc>
          </View>
          <_ViewLink>{t('trophies.toast.view')}</_ViewLink>
        </Pressable>
      </Animated.View>
    </View>
  )
}

// ── TierBadge ─────────────────────────────────────────────────────────────────

interface TierBadgeProps {
  tier: TrophyTier
}

const TIER_COLORS: Record<
  TrophyTier,
  { text: string; bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  bronze: { text: colors.tier.bronze, bg: colors.tier.bronzeMuted, icon: 'trophy' },
  silver: { text: colors.tier.silver, bg: colors.tier.silverMuted, icon: 'trophy' },
  gold: { text: colors.tier.gold, bg: colors.tier.goldMuted, icon: 'trophy' },
  diamond: { text: colors.tier.diamond, bg: colors.tier.diamondMuted, icon: 'diamond' },
}

function TierBadge({ tier }: TierBadgeProps): React.JSX.Element {
  const { text, bg, icon } = TIER_COLORS[tier]
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={18} color={text} />
    </View>
  )
}

// ── Inline text primitives (avoid Restyle import here) ───────────────────────

function _ToastLabel({ children }: PropsWithChildren): React.JSX.Element {
  return <Text style={styles.labelText}>{children}</Text>
}

function _ToastTitle({ children }: PropsWithChildren): React.JSX.Element {
  return <Text style={styles.titleText}>{children}</Text>
}

function _ToastDesc({ children }: PropsWithChildren): React.JSX.Element {
  return <Text style={styles.descText}>{children}</Text>
}

function _ViewLink({ children }: PropsWithChildren): React.JSX.Element {
  return <Text style={styles.viewText}>{children}</Text>
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  container: {
    // animation target
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.primary,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 1,
  },
  labelText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  titleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  descText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  viewText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent.secondary,
    flexShrink: 0,
  },
})
