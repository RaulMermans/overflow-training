// ============================================================
// Insight Copy — Phase 4
// ============================================================
//
// Central store for all insight text. No insight strings appear
// anywhere else in the engine or rules.
//
// COPY RULES:
//   • No causality claims ("because you…", "this caused…")
//   • Reference periods as "this period" / "vs last period"
//   • Short enough for a single mobile line (< 80 chars preferred)
//   • Coach tone: concise, direct, never chatty or congratulatory
//   • Never imply injury diagnosis or user goals unless explicit
// ============================================================

/**
 * Loose translator function type. Defined here so analytics modules
 * can reference it without importing React-context i18n infrastructure.
 *
 * Matches the signature of the `t` returned by useI18n, but accepts
 * `string` (not `TranslationKey`) so pure engine modules stay decoupled
 * from the TranslationKey union type.
 */
export type TFn = (key: string, params?: Record<string, string | number>) => string

// ── Neutral unlock ─────────────────────────────────────────────────

/** Returned when no rule fires due to insufficient data */
export function UNLOCK_MESSAGE(t: TFn): string {
  return t('progress.v2.insight.unlock')
}

// ── Overview (OV) ──────────────────────────────────────────────────

export type CopyWithDetails = {
  message: string
  details: string[]
  nextStep?: string
}

/**
 * OV-01: Consistency slipped.
 * Applies when workouts/week dropped >= DROP_WARNING_PCT vs previous period.
 */
export function OV_01_CONSISTENCY_SLIPPED(t: TFn): CopyWithDetails {
  return {
    message: t('progress.v2.insight.ov01.message'),
    details: [t('progress.v2.insight.ov01.detail0'), t('progress.v2.insight.ov01.detail1')],
    nextStep: t('progress.v2.insight.ov01.nextStep'),
  }
}

/**
 * OV-02: Density improved.
 * Applies when volume rose >= SIGNIFICANT_PCT_CHANGE while session count stayed flat.
 */
export function OV_02_DENSITY_IMPROVED(t: TFn): CopyWithDetails {
  return {
    message: t('progress.v2.insight.ov02.message'),
    details: [t('progress.v2.insight.ov02.detail0'), t('progress.v2.insight.ov02.detail1')],
  }
}

/**
 * OV-03: More sessions, similar output.
 * Applies when workouts rose >= SIGNIFICANT_PCT_CHANGE while volume stayed flat.
 */
export function OV_03_WORKOUTS_UP_VOLUME_FLAT(t: TFn): CopyWithDetails {
  return {
    message: t('progress.v2.insight.ov03.message'),
    details: [t('progress.v2.insight.ov03.detail0'), t('progress.v2.insight.ov03.detail1')],
  }
}

/**
 * OV-04: New momentum.
 * Applies when the previous period had zero workouts and the current does not.
 */
export function OV_04_NEW_MOMENTUM(t: TFn): CopyWithDetails {
  return {
    message: t('progress.v2.insight.ov04.message'),
    details: [t('progress.v2.insight.ov04.detail0'), t('progress.v2.insight.ov04.detail1')],
    nextStep: t('progress.v2.insight.ov04.nextStep'),
  }
}

// ── Strength (ST) ──────────────────────────────────────────────────

/**
 * ST-01: Selected lift trending up.
 * Applies when e1RM increased >= LIFT_TREND_UP_PCT over the period.
 */
export function ST_01_LIFT_TRENDING_UP(t: TFn): CopyWithDetails {
  return {
    message: t('progress.v2.insight.st01.message'),
    details: [t('progress.v2.insight.st01.detail0'), t('progress.v2.insight.st01.detail1')],
    nextStep: t('progress.v2.insight.st01.nextStep'),
  }
}

/**
 * ST-02: Plateau signal.
 * Applies when the e1RM slope is approximately zero over the period.
 */
export function ST_02_PLATEAU_SIGNAL(t: TFn): CopyWithDetails {
  return {
    message: t('progress.v2.insight.st02.message'),
    details: [t('progress.v2.insight.st02.detail0'), t('progress.v2.insight.st02.detail1')],
    nextStep: t('progress.v2.insight.st02.nextStep'),
  }
}

// ── Balance (BL) ───────────────────────────────────────────────────

/**
 * BL-01: Neglected major area.
 * Applies when a major muscle group is absent from the distribution.
 * @param muscleKey - Raw muscle key (e.g. 'chest'); translated internally.
 */
export function BL_01_NEGLECTED_AREA(t: TFn, muscleKey: string): CopyWithDetails {
  const muscle = t(`progress.v2.muscle.${muscleKey}`)
  return {
    message: t('progress.v2.insight.bl01.message', { muscle }),
    details: [
      t('progress.v2.insight.bl01.detail0', { muscle }),
      t('progress.v2.insight.bl01.detail1'),
    ],
    nextStep: t('progress.v2.insight.bl01.nextStep', { muscle }),
  }
}

/**
 * BL-02: Over-concentration.
 * Applies when the top muscle group exceeds TOP1_CONCENTRATION_THRESHOLD of volume.
 * @param muscleKey - Raw muscle key (e.g. 'chest'); translated internally.
 */
export function BL_02_OVER_CONCENTRATION(t: TFn, muscleKey: string, pct: number): CopyWithDetails {
  const muscle = t(`progress.v2.muscle.${muscleKey}`)
  const pctStr = `${Math.round(pct)}%`
  return {
    message: t('progress.v2.insight.bl02.message'),
    details: [
      t('progress.v2.insight.bl02.detail0', { muscle, pct: pctStr }),
      t('progress.v2.insight.bl02.detail1'),
    ],
  }
}

// ── Body (BD) — scaffolded, not yet active ─────────────────────────
//
// Body/check-in data layer does not exist in Phase 4.
// These copy functions are ready for when that layer ships.
// @deferred TODO: Activate when a check-in analytics hook is available.

/**
 * BD-01: Bodyweight trend.
 * Applies when >= 3 check-in entries exist and absolute change >= threshold.
 */
export function BD_01_WEIGHT_CHANGED(
  t: TFn,
  direction: 'up' | 'down',
  kgChange: number,
): CopyWithDetails {
  return {
    message: t('progress.v2.insight.bd01.message', { direction }),
    details: [
      t('progress.v2.insight.bd01.detail0', { kg: Math.abs(kgChange).toFixed(1) }),
      t('progress.v2.insight.bd01.detail1'),
    ],
  }
}

/**
 * BD-02: Check-in cadence.
 * Applies when no check-in has been logged in over 30 days.
 */
export function BD_02_CHECKIN_CADENCE(t: TFn): CopyWithDetails {
  return {
    message: t('progress.v2.insight.bd02.message'),
    details: [t('progress.v2.insight.bd02.detail0')],
    nextStep: t('progress.v2.insight.bd02.nextStep'),
  }
}
