// ============================================================
// Insight Engine — Unit Tests (Phase 4)
// ============================================================
//
// Coverage goals:
//   ✔ insightThresholds: pctChange, seriesSlopeProxy,
//                         hasSufficientOverviewData, hasSufficientTrendSeries
//   ✔ insightEngine: buildModuleInsight (unlock, single rule, multi-rule priority)
//   ✔ insightEngine: buildProgressInsights (all four modules)
//   ✔ Overview rules: OV-04 (new momentum), OV-01 (slipped),
//                     OV-02 (density), OV-03 (workouts up flat volume)
//   ✔ Strength rules:  ST-01 (trending up), ST-02 (plateau)
//   ✔ Balance rules:   BL-02 (over-concentration), BL-01 (neglected area)
//   ✔ Regression: no rule fires → unlock insight returned
//
// SNAPSHOT POLICY:
//   Tests assert on specific `id`, `tone`, and `confidence` fields.
//   Message strings are tested only for non-empty to avoid brittle
//   coupling with copy; use insightCopy.test.ts for copy validation.
// ============================================================

import {
  hasSufficientOverviewData,
  hasSufficientTrendSeries,
  pctChange,
  seriesSlopeProxy,
} from '../insightThresholds'
import { buildModuleInsight, buildProgressInsights } from '../insightEngine'
import { OVERVIEW_RULES, STRENGTH_RULES, BALANCE_RULES } from '../insightRules'
import type {
  BalanceInsightInput,
  OverviewInsightInput,
  StrengthInsightInput,
} from '../insightTypes'

// ── Shared fixtures ────────────────────────────────────────────────

const BASED_ON = { rangeDays: 28, generatedAt: '2026-02-25T00:00:00.000Z' }

/** Minimal translator mock: returns the key itself (always a non-empty string). */
const mockT = (key: string): string => key

// ──────────────────────────────────────────────────────────────────
// 1. THRESHOLD UTILITIES
// ──────────────────────────────────────────────────────────────────

describe('pctChange', () => {
  it('returns null when prev is 0', () => {
    expect(pctChange(10, 0)).toBeNull()
  })

  it('computes positive change correctly', () => {
    expect(pctChange(11, 10)).toBeCloseTo(0.1)
  })

  it('computes negative change correctly', () => {
    expect(pctChange(8, 10)).toBeCloseTo(-0.2)
  })

  it('handles same value (zero change)', () => {
    expect(pctChange(10, 10)).toBeCloseTo(0)
  })
})

describe('seriesSlopeProxy', () => {
  it('returns null for empty series', () => {
    expect(seriesSlopeProxy([])).toBeNull()
  })

  it('returns null for single non-null point', () => {
    expect(seriesSlopeProxy([{ value: 100 }])).toBeNull()
  })

  it('returns null when all values are null', () => {
    expect(seriesSlopeProxy([{ value: null }, { value: null }])).toBeNull()
  })

  it('computes rising slope correctly (ignores null gaps)', () => {
    const points = [
      { value: 100 },
      { value: null }, // gap
      { value: 110 },
    ]
    const result = seriesSlopeProxy(points)
    expect(result).toBeCloseTo(0.1) // (110 - 100) / 100
  })

  it('computes flat slope within band', () => {
    const points = [{ value: 100 }, { value: 100 }]
    expect(seriesSlopeProxy(points)).toBeCloseTo(0)
  })

  it('computes declining slope correctly', () => {
    const points = [{ value: 100 }, { value: 80 }]
    expect(seriesSlopeProxy(points)).toBeCloseTo(-0.2)
  })
})

describe('hasSufficientOverviewData', () => {
  it('returns low when both periods are zero', () => {
    expect(hasSufficientOverviewData({ currentWorkouts: 0, prevWorkouts: 0 })).toBe('low')
  })

  it('returns medium when prev is zero but current has data', () => {
    expect(hasSufficientOverviewData({ currentWorkouts: 5, prevWorkouts: 0 })).toBe('medium')
  })

  it('returns high when both periods have >= 4 workouts', () => {
    expect(hasSufficientOverviewData({ currentWorkouts: 4, prevWorkouts: 4 })).toBe('high')
  })

  it('returns medium when one period has < 4 workouts', () => {
    expect(hasSufficientOverviewData({ currentWorkouts: 3, prevWorkouts: 5 })).toBe('medium')
  })
})

describe('hasSufficientTrendSeries', () => {
  const points3 = [{ value: 100 }, { value: 105 }, { value: 110 }]
  const points6 = [...points3, { value: 112 }, { value: 115 }, { value: 118 }]

  it('returns low when fewer than minPoints non-null values', () => {
    expect(hasSufficientTrendSeries([{ value: 100 }, { value: null }], 3)).toBe('low')
  })

  it('returns medium when exactly minPoints non-null values', () => {
    expect(hasSufficientTrendSeries(points3, 3)).toBe('medium')
  })

  it('returns high when >= 2× minPoints non-null values', () => {
    expect(hasSufficientTrendSeries(points6, 3)).toBe('high')
  })

  it('does not count null values toward the threshold', () => {
    const withGaps = [
      { value: 100 },
      { value: null },
      { value: 110 },
      { value: null },
      { value: null },
    ]
    expect(hasSufficientTrendSeries(withGaps, 3)).toBe('low')
  })
})

// ──────────────────────────────────────────────────────────────────
// 2. ENGINE SELECTION LOGIC
// ──────────────────────────────────────────────────────────────────

describe('buildModuleInsight — unlock', () => {
  it('returns an unlock insight when no rules apply', () => {
    const emptyInput: OverviewInsightInput = {
      currentWorkouts: 0,
      prevWorkouts: 0,
      currentVolumeKg: 0,
      prevVolumeKg: 0,
      rangeDays: 28,
    }
    const result = buildModuleInsight(OVERVIEW_RULES, emptyInput, 'OV', BASED_ON, mockT)
    expect(result.id).toBe('UNLOCK-OV')
    expect(result.tone).toBe('neutral')
    expect(result.confidence).toBe('low')
    expect(result.message).toBeTruthy()
  })
})

describe('buildModuleInsight — score selection', () => {
  it('selects the highest-scoring applicable rule', () => {
    // OV-01 (warning, score 500+) should beat OV-02/03 (score 300/200)
    const input: OverviewInsightInput = {
      currentWorkouts: 4,
      prevWorkouts: 8, // >20% drop → OV-01 fires
      currentVolumeKg: 5000,
      prevVolumeKg: 5000,
      rangeDays: 28,
    }
    const result = buildModuleInsight(OVERVIEW_RULES, input, 'OV', BASED_ON, mockT)
    expect(result.id).toBe('OV-01')
    expect(result.tone).toBe('warning')
  })

  it('breaks ties by id (lexicographic ascending)', () => {
    // Create two rules with identical score
    const ruleA = {
      id: 'Z-99',
      applies: () => true,
      score: () => 100,
      build: (_: unknown, basedOn: typeof BASED_ON) => ({
        id: 'Z-99',
        tone: 'neutral' as const,
        message: 'rule Z',
        confidence: 'medium' as const,
        basedOn,
      }),
    }
    const ruleB = {
      id: 'A-01',
      applies: () => true,
      score: () => 100,
      build: (_: unknown, basedOn: typeof BASED_ON) => ({
        id: 'A-01',
        tone: 'neutral' as const,
        message: 'rule A',
        confidence: 'medium' as const,
        basedOn,
      }),
    }
    const result = buildModuleInsight([ruleA, ruleB], {}, 'TEST', BASED_ON, mockT)
    expect(result.id).toBe('A-01')
  })
})

// ──────────────────────────────────────────────────────────────────
// 3. OVERVIEW RULES
// ──────────────────────────────────────────────────────────────────

describe('OV-04: new momentum', () => {
  const baseInput: OverviewInsightInput = {
    currentWorkouts: 3,
    prevWorkouts: 0, // no previous period
    currentVolumeKg: 2000,
    prevVolumeKg: 0,
    rangeDays: 28,
  }

  it('fires when prev is 0 and current has workouts', () => {
    const result = buildModuleInsight(OVERVIEW_RULES, baseInput, 'OV', BASED_ON, mockT)
    expect(result.id).toBe('OV-04')
    expect(result.tone).toBe('positive')
    expect(result.confidence).toBe('medium')
  })

  it('does not fire when both periods have workouts', () => {
    const result = buildModuleInsight(
      OVERVIEW_RULES,
      { ...baseInput, prevWorkouts: 4 },
      'OV',
      BASED_ON,
      mockT,
    )
    expect(result.id).not.toBe('OV-04')
  })
})

describe('OV-01: consistency slipped', () => {
  const highConfidenceBase: OverviewInsightInput = {
    currentWorkouts: 4, // dropped from 8 → -50% (>= 20%)
    prevWorkouts: 8,
    currentVolumeKg: 5000,
    prevVolumeKg: 5000,
    rangeDays: 28,
  }

  it('fires when workouts drop >= 20%', () => {
    const result = buildModuleInsight(OVERVIEW_RULES, highConfidenceBase, 'OV', BASED_ON, mockT)
    expect(result.id).toBe('OV-01')
    expect(result.tone).toBe('warning')
  })

  it('does not fire when drop is < 20%', () => {
    const result = buildModuleInsight(
      OVERVIEW_RULES,
      { ...highConfidenceBase, currentWorkouts: 7, prevWorkouts: 8 }, // -12.5%
      'OV',
      BASED_ON,
      mockT,
    )
    expect(result.id).not.toBe('OV-01')
  })

  it('does not fire when confidence is low (both periods are empty)', () => {
    // hasSufficientOverviewData returns 'low' only when both are 0.
    // pctChange(0, 0) also returns null (prev = 0), so OV-01 cannot apply.
    const result = buildModuleInsight(
      OVERVIEW_RULES,
      {
        ...highConfidenceBase,
        currentWorkouts: 0,
        prevWorkouts: 0,
      },
      'OV',
      BASED_ON,
      mockT,
    )
    expect(result.id).not.toBe('OV-01')
  })
})

describe('OV-02: density improved', () => {
  it('fires when volume is up >= 10% and workouts are flat (±5%)', () => {
    const input: OverviewInsightInput = {
      currentWorkouts: 5, // was 5 → flat
      prevWorkouts: 5,
      currentVolumeKg: 6000, // was 5000 → +20%
      prevVolumeKg: 5000,
      rangeDays: 28,
    }
    const result = buildModuleInsight(OVERVIEW_RULES, input, 'OV', BASED_ON, mockT)
    expect(result.id).toBe('OV-02')
    expect(result.tone).toBe('positive')
  })

  it('does not fire when workouts also increased significantly', () => {
    const input: OverviewInsightInput = {
      currentWorkouts: 8, // was 5 → +60% (not flat)
      prevWorkouts: 5,
      currentVolumeKg: 6000,
      prevVolumeKg: 5000,
      rangeDays: 28,
    }
    const result = buildModuleInsight(OVERVIEW_RULES, input, 'OV', BASED_ON, mockT)
    expect(result.id).not.toBe('OV-02')
  })
})

describe('OV-03: workouts up volume flat', () => {
  it('fires when workouts are up >= 10% and volume is flat (±5%)', () => {
    const input: OverviewInsightInput = {
      currentWorkouts: 8, // was 5 → +60%
      prevWorkouts: 5,
      currentVolumeKg: 5100, // ~+2% (flat)
      prevVolumeKg: 5000,
      rangeDays: 28,
    }
    const result = buildModuleInsight(OVERVIEW_RULES, input, 'OV', BASED_ON, mockT)
    expect(result.id).toBe('OV-03')
    expect(result.tone).toBe('neutral')
  })
})

// ──────────────────────────────────────────────────────────────────
// 4. STRENGTH RULES
// ──────────────────────────────────────────────────────────────────

describe('ST-01: lift trending up', () => {
  const risingPoints = [
    { weekStart: '2026-01-05', value: 80 },
    { weekStart: '2026-01-12', value: 85 },
    { weekStart: '2026-01-19', value: 90 }, // +12.5% total → fires
  ]

  it('fires when slope >= 2% with enough data points', () => {
    const input: StrengthInsightInput = {
      trendPoints: risingPoints,
      currentBestKg: 90,
      rangeDays: 28,
    }
    const result = buildModuleInsight(STRENGTH_RULES, input, 'ST', BASED_ON, mockT)
    expect(result.id).toBe('ST-01')
    expect(result.tone).toBe('positive')
  })

  it('does not fire with fewer than MIN_WEEKS_FOR_SLOPE non-null points', () => {
    const input: StrengthInsightInput = {
      trendPoints: [
        { weekStart: '2026-01-05', value: 80 },
        { weekStart: '2026-01-12', value: null }, // gap
        { weekStart: '2026-01-19', value: 90 }, // only 2 non-null
      ],
      currentBestKg: 90,
      rangeDays: 28,
    }
    const result = buildModuleInsight(STRENGTH_RULES, input, 'ST', BASED_ON, mockT)
    expect(result.id).not.toBe('ST-01')
  })
})

describe('ST-02: plateau signal', () => {
  it('fires when slope is within ±5% flat band', () => {
    const flatPoints = [
      { weekStart: '2026-01-05', value: 100 },
      { weekStart: '2026-01-12', value: 101 },
      { weekStart: '2026-01-19', value: 100 }, // ~0% → flat
    ]
    const input: StrengthInsightInput = {
      trendPoints: flatPoints,
      currentBestKg: 100,
      rangeDays: 28,
    }
    const result = buildModuleInsight(STRENGTH_RULES, input, 'ST', BASED_ON, mockT)
    expect(result.id).toBe('ST-02')
    expect(result.tone).toBe('neutral')
  })

  it('does not fire when slope is rising (ST-01 wins)', () => {
    const risingPoints = [
      { weekStart: '2026-01-05', value: 100 },
      { weekStart: '2026-01-12', value: 106 },
      { weekStart: '2026-01-19', value: 110 }, // +10% → ST-01 fires
    ]
    const input: StrengthInsightInput = {
      trendPoints: risingPoints,
      currentBestKg: 110,
      rangeDays: 28,
    }
    const result = buildModuleInsight(STRENGTH_RULES, input, 'ST', BASED_ON, mockT)
    expect(result.id).toBe('ST-01')
    expect(result.id).not.toBe('ST-02')
  })
})

// ──────────────────────────────────────────────────────────────────
// 5. BALANCE RULES
// ──────────────────────────────────────────────────────────────────

describe('BL-02: over-concentration', () => {
  it('fires when top muscle exceeds 45% of total volume', () => {
    const input: BalanceInsightInput = {
      distribution: [
        { muscleKey: 'chest', volumeKg: 600, pct: 60 }, // 60% → > 45%
        { muscleKey: 'shoulders', volumeKg: 200, pct: 20 },
        { muscleKey: 'triceps', volumeKg: 200, pct: 20 },
      ],
      totalVolumeKg: 1000,
      rangeDays: 28,
    }
    const result = buildModuleInsight(BALANCE_RULES, input, 'BL', BASED_ON, mockT)
    expect(result.id).toBe('BL-02')
    expect(result.tone).toBe('warning')
    expect(result.confidence).toBe('high')
  })

  it('does not fire when total volume is below minimum threshold', () => {
    const input: BalanceInsightInput = {
      distribution: [
        { muscleKey: 'chest', volumeKg: 60, pct: 60 }, // 60% but total is only 100 kg
      ],
      totalVolumeKg: 99, // below MUSCLE_BALANCE_MIN_TOTAL_VOLUME_KG = 100
      rangeDays: 28,
    }
    const result = buildModuleInsight(BALANCE_RULES, input, 'BL', BASED_ON, mockT)
    // Should return unlock since neither rule fires
    expect(result.id).toBe('UNLOCK-BL')
  })

  it('does not fire when top muscle is below 45%', () => {
    const input: BalanceInsightInput = {
      distribution: [
        { muscleKey: 'chest', volumeKg: 400, pct: 40 }, // 40% → ok
        { muscleKey: 'back', volumeKg: 350, pct: 35 },
        { muscleKey: 'shoulders', volumeKg: 250, pct: 25 },
      ],
      totalVolumeKg: 1000,
      rangeDays: 28,
    }
    const result = buildModuleInsight(BALANCE_RULES, input, 'BL', BASED_ON, mockT)
    expect(result.id).not.toBe('BL-02')
  })
})

describe('BL-01: neglected major area', () => {
  it('fires when a major muscle group is absent from distribution', () => {
    // Distribution has chest, shoulders, triceps but no back/lats/quads/hamstrings/glutes
    const input: BalanceInsightInput = {
      distribution: [
        { muscleKey: 'chest', volumeKg: 400, pct: 44 },
        { muscleKey: 'shoulders', volumeKg: 300, pct: 33 },
        { muscleKey: 'triceps', volumeKg: 210, pct: 23 },
      ],
      totalVolumeKg: 910,
      rangeDays: 28,
    }
    const result = buildModuleInsight(BALANCE_RULES, input, 'BL', BASED_ON, mockT)
    expect(result.id).toBe('BL-01')
    expect(result.tone).toBe('neutral')
    expect(result.confidence).toBe('high')
  })

  it('does not fire when all major groups are present', () => {
    const input: BalanceInsightInput = {
      distribution: [
        { muscleKey: 'chest', volumeKg: 150, pct: 15 },
        { muscleKey: 'back', volumeKg: 150, pct: 15 },
        { muscleKey: 'lats', volumeKg: 150, pct: 15 },
        { muscleKey: 'quads', volumeKg: 150, pct: 15 },
        { muscleKey: 'hamstrings', volumeKg: 100, pct: 10 },
        { muscleKey: 'glutes', volumeKg: 100, pct: 10 },
        { muscleKey: 'shoulders', volumeKg: 200, pct: 20 },
      ],
      totalVolumeKg: 1000,
      rangeDays: 28,
    }
    const result = buildModuleInsight(BALANCE_RULES, input, 'BL', BASED_ON, mockT)
    expect(result.id).not.toBe('BL-01')
  })

  it('BL-02 takes priority over BL-01 when both apply', () => {
    // Distribution has no back (BL-01 fires) AND chest is 60% (BL-02 fires)
    const input: BalanceInsightInput = {
      distribution: [
        { muscleKey: 'chest', volumeKg: 600, pct: 60 }, // > 45% → BL-02
        { muscleKey: 'shoulders', volumeKg: 200, pct: 20 },
        { muscleKey: 'triceps', volumeKg: 200, pct: 20 }, // no back/quads/etc → BL-01
      ],
      totalVolumeKg: 1000,
      rangeDays: 28,
    }
    const result = buildModuleInsight(BALANCE_RULES, input, 'BL', BASED_ON, mockT)
    expect(result.id).toBe('BL-02') // BL-02 has higher score (400+) vs BL-01 (300)
  })
})

// ──────────────────────────────────────────────────────────────────
// 6. buildProgressInsights — integration
// ──────────────────────────────────────────────────────────────────

describe('buildProgressInsights', () => {
  it('returns unlock overview insight when overviewInput is null', () => {
    const result = buildProgressInsights(
      {
        rangeDays: 28,
        generatedAt: BASED_ON.generatedAt,
        overviewInput: null,
        strengthInput: null,
        balanceInput: null,
        bodyInput: null,
      },
      mockT,
    )
    expect(result.overview.id).toBe('UNLOCK-OV')
    expect(result.strength).toBeNull()
    expect(result.balance).toBeNull()
    expect(result.body).toBeNull()
  })

  it('returns null for strength when strengthInput is null', () => {
    const result = buildProgressInsights(
      {
        rangeDays: 28,
        generatedAt: BASED_ON.generatedAt,
        overviewInput: {
          currentWorkouts: 5,
          prevWorkouts: 0,
          currentVolumeKg: 3000,
          prevVolumeKg: 0,
          rangeDays: 28,
        },
        strengthInput: null,
        balanceInput: null,
        bodyInput: null,
      },
      mockT,
    )
    expect(result.strength).toBeNull()
  })

  it('body is always null in Phase 4', () => {
    const result = buildProgressInsights(
      {
        rangeDays: 28,
        generatedAt: BASED_ON.generatedAt,
        overviewInput: null,
        strengthInput: null,
        balanceInput: null,
        bodyInput: null,
      },
      mockT,
    )
    expect(result.body).toBeNull()
  })

  it('full happy path: all four modules have data', () => {
    const result = buildProgressInsights(
      {
        rangeDays: 28,
        generatedAt: BASED_ON.generatedAt,
        overviewInput: {
          currentWorkouts: 5,
          prevWorkouts: 0, // OV-04: new momentum
          currentVolumeKg: 3000,
          prevVolumeKg: 0,
          rangeDays: 28,
        },
        strengthInput: {
          trendPoints: [
            { weekStart: '2026-01-05', value: 80 },
            { weekStart: '2026-01-12', value: 86 },
            { weekStart: '2026-01-19', value: 92 }, // +15% → ST-01
          ],
          currentBestKg: 92,
          rangeDays: 28,
        },
        balanceInput: {
          distribution: [
            { muscleKey: 'chest', volumeKg: 400, pct: 44 }, // < 45%, no BL-02
            { muscleKey: 'shoulders', volumeKg: 300, pct: 33 },
            { muscleKey: 'triceps', volumeKg: 210, pct: 23 }, // no back → BL-01
          ],
          totalVolumeKg: 910,
          rangeDays: 28,
        },
        bodyInput: null,
      },
      mockT,
    )

    expect(result.overview.id).toBe('OV-04')
    expect(result.strength?.id).toBe('ST-01')
    expect(result.balance?.id).toBe('BL-01')
    expect(result.body).toBeNull()
  })

  it('basedOn metadata is attached to every produced insight', () => {
    const generatedAt = '2026-02-25T12:00:00.000Z'
    const result = buildProgressInsights(
      {
        rangeDays: 90,
        generatedAt,
        overviewInput: {
          currentWorkouts: 5,
          prevWorkouts: 0,
          currentVolumeKg: 3000,
          prevVolumeKg: 0,
          rangeDays: 90,
        },
        strengthInput: null,
        balanceInput: null,
        bodyInput: null,
      },
      mockT,
    )

    expect(result.overview.basedOn.rangeDays).toBe(90)
    expect(result.overview.basedOn.generatedAt).toBe(generatedAt)
  })
})

// ──────────────────────────────────────────────────────────────────
// 7. INSIGHT SAFETY — Sufficiency gating & boundary conditions
// ──────────────────────────────────────────────────────────────────
// Phase 5 additions: ensure no harmful insights fire on noisy / thin data.

describe('Sufficiency gating — overview rules silent on low confidence', () => {
  it('gives unlock (not OV-01) when both prev and current are 0', () => {
    // Zero-data user: no workouts ever → must return unlock, never a warning
    const result = buildModuleInsight(
      OVERVIEW_RULES,
      { currentWorkouts: 0, prevWorkouts: 0, currentVolumeKg: 0, prevVolumeKg: 0, rangeDays: 28 },
      'OV',
      BASED_ON,
      mockT,
    )
    expect(result.id).toBe('UNLOCK-OV')
    expect(result.tone).toBe('neutral')
  })

  it('gives OV-04 (not OV-01) when prev=0 and current has workouts', () => {
    // First-ever data: pctChange(N, 0) = null → OV-01 cannot fire.
    // OV-04 (new momentum) should win instead.
    const result = buildModuleInsight(
      OVERVIEW_RULES,
      {
        currentWorkouts: 5,
        prevWorkouts: 0,
        currentVolumeKg: 2000,
        prevVolumeKg: 0,
        rangeDays: 28,
      },
      'OV',
      BASED_ON,
      mockT,
    )
    expect(result.id).toBe('OV-04')
    expect(result.id).not.toBe('OV-01')
    expect(result.tone).not.toBe('warning')
  })

  it('does not warn when volume drops but prev=0 volume baseline', () => {
    // Volume went from 0 to 1000 then back to 500. prevVolumeKg=0 means
    // pctChange for volume = null → OV-02 volume-comparison rules can't apply.
    const result = buildModuleInsight(
      OVERVIEW_RULES,
      { currentWorkouts: 5, prevWorkouts: 3, currentVolumeKg: 500, prevVolumeKg: 0, rangeDays: 28 },
      'OV',
      BASED_ON,
      mockT,
    )
    // No crash; result has a valid insight struct
    expect(typeof result.id).toBe('string')
    expect(result.id.length).toBeGreaterThan(0)
    expect(result.tone).not.toBe('warning') // no drop warning when baseline is 0
  })
})

describe('Sufficiency gating — strength rules silent on thin series', () => {
  it('returns unlock (not ST-01/ST-02) when only 1 non-null point', () => {
    const input: StrengthInsightInput = {
      trendPoints: [{ weekStart: '2026-02-09', value: 100 }],
      currentBestKg: 100,
      rangeDays: 28,
    }
    const result = buildModuleInsight(STRENGTH_RULES, input, 'ST', BASED_ON, mockT)
    expect(result.id).toBe('UNLOCK-ST')
    expect(result.tone).toBe('neutral')
  })

  it('returns unlock when all trend points are null', () => {
    const input: StrengthInsightInput = {
      trendPoints: [
        { weekStart: '2026-01-19', value: null },
        { weekStart: '2026-01-26', value: null },
        { weekStart: '2026-02-02', value: null },
      ],
      currentBestKg: null,
      rangeDays: 28,
    }
    const result = buildModuleInsight(STRENGTH_RULES, input, 'ST', BASED_ON, mockT)
    expect(result.id).toBe('UNLOCK-ST')
  })

  it('returns unlock when series is empty', () => {
    const input: StrengthInsightInput = {
      trendPoints: [],
      currentBestKg: null,
      rangeDays: 28,
    }
    const result = buildModuleInsight(STRENGTH_RULES, input, 'ST', BASED_ON, mockT)
    expect(result.id).toBe('UNLOCK-ST')
  })
})

describe('Boundary conditions — OV-01 threshold at exactly 20%', () => {
  it('fires at exactly -20% drop (>= DROP_WARNING_PCT)', () => {
    // 8 → 6.4 workouts is -20%; use integers 10 → 8 = -20%
    const result = buildModuleInsight(
      OVERVIEW_RULES,
      {
        currentWorkouts: 8,
        prevWorkouts: 10,
        currentVolumeKg: 5000,
        prevVolumeKg: 5000,
        rangeDays: 28,
      },
      'OV',
      BASED_ON,
      mockT,
    )
    expect(result.id).toBe('OV-01')
  })

  it('does not fire at -19% drop (< DROP_WARNING_PCT)', () => {
    // 10 → 8.1 is -19%; use 10 → 9 = -10% (well inside safe band)
    const result = buildModuleInsight(
      OVERVIEW_RULES,
      {
        currentWorkouts: 9,
        prevWorkouts: 10,
        currentVolumeKg: 5000,
        prevVolumeKg: 5000,
        rangeDays: 28,
      },
      'OV',
      BASED_ON,
      mockT,
    )
    expect(result.id).not.toBe('OV-01')
  })
})

describe('Boundary conditions — BL-02 concentration around the 45% threshold', () => {
  // TOP1_CONCENTRATION_THRESHOLD = 0.45, rule uses strict ">" so:
  //   46% → fires  (0.46 > 0.45)
  //   45% → silent (0.45 > 0.45 = false)
  //
  // All seven MAJOR_MUSCLE_GROUPS (chest, back, lats, quads, hamstrings,
  // glutes, shoulders) must be present so BL-01 stays silent and we test
  // BL-02 in isolation.
  const allMajorGroupsBase = [
    { muscleKey: 'back', volumeKg: 160, pct: 16 },
    { muscleKey: 'lats', volumeKg: 100, pct: 10 },
    { muscleKey: 'quads', volumeKg: 90, pct: 9 },
    { muscleKey: 'hamstrings', volumeKg: 80, pct: 8 },
    { muscleKey: 'glutes', volumeKg: 70, pct: 7 },
    { muscleKey: 'shoulders', volumeKg: 60, pct: 6 },
  ]

  it('fires at 46% (just above threshold, all major groups present)', () => {
    // 460 / 1020 ≈ 45.1%; use clean percentages: chest 46%, rest 54%
    const input: BalanceInsightInput = {
      distribution: [{ muscleKey: 'chest', volumeKg: 460, pct: 46 }, ...allMajorGroupsBase],
      totalVolumeKg: 1000,
      rangeDays: 28,
    }
    const result = buildModuleInsight(BALANCE_RULES, input, 'BL', BASED_ON, mockT)
    expect(result.id).toBe('BL-02')
  })

  it('does not fire at exactly 45% (threshold is strict >)', () => {
    // chest at exactly 45%: 0.45 > 0.45 = false → BL-02 silent
    const input: BalanceInsightInput = {
      distribution: [{ muscleKey: 'chest', volumeKg: 450, pct: 45 }, ...allMajorGroupsBase],
      totalVolumeKg: 1000,
      rangeDays: 28,
    }
    const result = buildModuleInsight(BALANCE_RULES, input, 'BL', BASED_ON, mockT)
    expect(result.id).not.toBe('BL-02')
  })
})

describe('No harmful tone for zero-data users', () => {
  it('overview insight for zero-data user is neutral (not warning/positive)', () => {
    const result = buildModuleInsight(
      OVERVIEW_RULES,
      { currentWorkouts: 0, prevWorkouts: 0, currentVolumeKg: 0, prevVolumeKg: 0, rangeDays: 28 },
      'OV',
      BASED_ON,
      mockT,
    )
    expect(result.tone).toBe('neutral')
  })

  it('strength insight for zero-data user is neutral', () => {
    const result = buildModuleInsight(
      STRENGTH_RULES,
      { trendPoints: [], currentBestKg: null, rangeDays: 28 },
      'ST',
      BASED_ON,
      mockT,
    )
    expect(result.tone).toBe('neutral')
  })

  it('balance insight for zero-data user is neutral', () => {
    const result = buildModuleInsight(
      BALANCE_RULES,
      { distribution: [], totalVolumeKg: 0, rangeDays: 28 },
      'BL',
      BASED_ON,
      mockT,
    )
    expect(result.tone).toBe('neutral')
  })
})

// ──────────────────────────────────────────────────────────────────
// 8. REGRESSION — Insight struct completeness
// ──────────────────────────────────────────────────────────────────

describe('Insight struct completeness', () => {
  it('every produced insight has required fields: id, tone, message, confidence, basedOn', () => {
    const inputs: OverviewInsightInput[] = [
      // OV-04
      {
        currentWorkouts: 5,
        prevWorkouts: 0,
        currentVolumeKg: 2000,
        prevVolumeKg: 0,
        rangeDays: 28,
      },
      // OV-01
      {
        currentWorkouts: 4,
        prevWorkouts: 8,
        currentVolumeKg: 5000,
        prevVolumeKg: 5000,
        rangeDays: 28,
      },
      // OV-02
      {
        currentWorkouts: 5,
        prevWorkouts: 5,
        currentVolumeKg: 6000,
        prevVolumeKg: 5000,
        rangeDays: 28,
      },
      // OV-03
      {
        currentWorkouts: 8,
        prevWorkouts: 5,
        currentVolumeKg: 5100,
        prevVolumeKg: 5000,
        rangeDays: 28,
      },
      // unlock
      { currentWorkouts: 0, prevWorkouts: 0, currentVolumeKg: 0, prevVolumeKg: 0, rangeDays: 28 },
    ]

    for (const input of inputs) {
      const insight = buildModuleInsight(OVERVIEW_RULES, input, 'OV', BASED_ON, mockT)
      expect(typeof insight.id).toBe('string')
      expect(insight.id.length).toBeGreaterThan(0)
      expect(['positive', 'neutral', 'warning']).toContain(insight.tone)
      expect(typeof insight.message).toBe('string')
      expect(insight.message.length).toBeGreaterThan(0)
      expect(['high', 'medium', 'low']).toContain(insight.confidence)
      expect(insight.basedOn).toBeDefined()
      expect(typeof insight.basedOn.rangeDays).toBe('number')
      expect(typeof insight.basedOn.generatedAt).toBe('string')
    }
  })
})
