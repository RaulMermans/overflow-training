import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet } from 'react-native'
import { colors, radii, space } from '../../../theme/tokens'

// ── Pulse animation ─────────────────────────────────────────────────

function usePulse() {
  const opacity = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [opacity])
  return opacity
}

// ── Base block ──────────────────────────────────────────────────────

type BlockProps = { width?: number | string; height?: number; radius?: number; style?: object }

function Block({ width = '100%', height = 16, radius = 8, style }: BlockProps) {
  const opacity = usePulse()
  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius: radius,
          backgroundColor: colors.border.subtle,
          opacity,
        },
        style,
      ]}
    />
  )
}

// ── Hero card skeleton (2x2 grid) ────────────────────────────────────

export function HeroSkeleton() {
  return (
    <Animated.View style={styles.heroGrid}>
      {[0, 1, 2, 3].map((i) => (
        <Animated.View key={i} style={styles.heroCell}>
          <Block height={22} width="60%" radius={6} style={styles.mb8} />
          <Block height={13} width="80%" radius={4} style={styles.mb6} />
          <Block height={11} width="40%" radius={4} />
        </Animated.View>
      ))}
    </Animated.View>
  )
}

// ── Trend card skeleton ──────────────────────────────────────────────

export function TrendSkeleton() {
  return (
    <Animated.View style={styles.card}>
      <Block height={14} width="50%" radius={4} style={styles.mb12} />
      <Block height={80} radius={8} />
    </Animated.View>
  )
}

// ── Module section skeleton ──────────────────────────────────────────

export function ModuleSkeleton() {
  return (
    <Animated.View style={[styles.card, { gap: space[3] }]}>
      <Block height={14} width="40%" radius={4} style={styles.mb8} />
      {[0, 1, 2].map((i) => (
        <Animated.View key={i} style={styles.row}>
          <Block height={12} width="30%" radius={4} />
          <Block height={12} width="50%" radius={4} />
        </Animated.View>
      ))}
    </Animated.View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  heroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: space[4],
    gap: space[3],
  },
  heroCell: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.bg.surface,
    borderRadius: radii.md,
    padding: space[4],
    minHeight: 96,
  },
  card: {
    marginHorizontal: space[4],
    backgroundColor: colors.bg.surface,
    borderRadius: radii.md,
    padding: space[4],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space[3],
  },
  mb6: { marginBottom: 6 },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
})
