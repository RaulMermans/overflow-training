// ============================================================
// Insight Engine — Phase 4
// ============================================================
//
// buildModuleInsight<T>:
//   1. Collects all rules that apply to the given input.
//   2. Sorts by score() descending; ties break by id (lexicographic asc).
//   3. Returns the top rule's build() output.
//   4. If no rule applies → returns a neutral "unlock" Insight.
//
// buildProgressInsights:
//   Drives all four modules (overview, strength, balance, body).
//   - overview: always returns an Insight (data or unlock placeholder)
//   - strength / balance / body: return null when input is unavailable
//
// CONFIDENCE POLICY:
//   Low-confidence rules are blocked inside applies() — they never
//   reach the engine's candidate set. If no rule remains, the engine
//   returns the unlock insight so the UI always has a stable row.
// ============================================================

import { UNLOCK_MESSAGE, type TFn } from './insightCopy'
import type {
  BalanceInsightInput,
  BodyInsightInput,
  Insight,
  InsightRule,
  OverviewInsightInput,
  StrengthInsightInput,
} from './insightTypes'
import { BALANCE_RULES, BODY_RULES, OVERVIEW_RULES, STRENGTH_RULES } from './insightRules'

// ── Unlock insight factory ─────────────────────────────────────────

/**
 * Neutral placeholder returned when no rule fires for a module.
 * Uses a stable id keyed to the module so React keys remain consistent.
 */
function buildUnlockInsight(
  modulePrefix: string,
  basedOn: { rangeDays: number; generatedAt: string },
  t: TFn,
): Insight {
  return {
    id: `UNLOCK-${modulePrefix}`,
    tone: 'neutral',
    message: UNLOCK_MESSAGE(t),
    confidence: 'low',
    basedOn,
  }
}

// ── Core selection logic ───────────────────────────────────────────

/**
 * Selects the highest-scoring applicable rule and builds an Insight.
 *
 * When no rule applies, returns a neutral unlock insight so the UI
 * always has a consistent placeholder (never throws / returns undefined).
 *
 * Sorting guarantee:
 *   Primary:   score() descending  (higher = more urgent)
 *   Secondary: id ascending        (lexicographic; e.g. "OV-01" < "OV-02")
 *
 * @param rules       - Rule set for this module
 * @param input       - Typed module input
 * @param modulePrefix - Short prefix used in the unlock insight id (e.g. "OV")
 * @param basedOn     - Metadata attached to every produced Insight
 * @param t           - Translator function threaded from the React layer
 */
export function buildModuleInsight<Input>(
  rules: ReadonlyArray<InsightRule<Input>>,
  input: Input,
  modulePrefix: string,
  basedOn: { rangeDays: number; generatedAt: string },
  t: TFn,
): Insight {
  const candidates = rules.filter((r) => r.applies(input))

  if (candidates.length === 0) {
    return buildUnlockInsight(modulePrefix, basedOn, t)
  }

  // Stable sort: score desc → id asc
  const sorted = [...candidates].sort((a, b) => {
    const diff = b.score(input) - a.score(input)
    if (diff !== 0) return diff
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  return sorted[0].build(input, basedOn, t)
}

// ── Public types ───────────────────────────────────────────────────

export type ProgressInsightInputs = {
  rangeDays: number
  generatedAt: string
  overviewInput: OverviewInsightInput | null
  strengthInput: StrengthInsightInput | null
  balanceInput: BalanceInsightInput | null
  bodyInput: BodyInsightInput | null
}

export type ProgressInsights = {
  /** Always present: either a real insight or the unlock placeholder */
  overview: Insight
  /** null when no exercise is selected or trend data is unavailable */
  strength: Insight | null
  /** null when muscle balance data is unavailable */
  balance: Insight | null
  /** null — body data layer not yet available in Phase 4 */
  body: Insight | null
}

// ── Full progress build ────────────────────────────────────────────

/**
 * Runs the insight engine for all four modules in a single call.
 * The caller is responsible for deriving and passing typed inputs;
 * this function has no knowledge of React Query or network I/O.
 *
 * @param params - All module inputs and metadata
 * @param t      - Translator function threaded from the React layer
 */
export function buildProgressInsights(params: ProgressInsightInputs, t: TFn): ProgressInsights {
  const { rangeDays, generatedAt, overviewInput, strengthInput, balanceInput, bodyInput } = params
  const basedOn = { rangeDays, generatedAt }

  const overview: Insight = overviewInput
    ? buildModuleInsight(OVERVIEW_RULES, overviewInput, 'OV', basedOn, t)
    : buildUnlockInsight('OV', basedOn, t)

  const strength: Insight | null = strengthInput
    ? buildModuleInsight(STRENGTH_RULES, strengthInput, 'ST', basedOn, t)
    : null

  const balance: Insight | null = balanceInput
    ? buildModuleInsight(BALANCE_RULES, balanceInput, 'BL', basedOn, t)
    : null

  // Body rules are empty in Phase 4; always returns null
  const body: Insight | null =
    bodyInput !== null && BODY_RULES.length > 0
      ? buildModuleInsight(BODY_RULES, bodyInput, 'BD', basedOn, t)
      : null

  return { overview, strength, balance, body }
}
