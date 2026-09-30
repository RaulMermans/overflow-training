import type { TrophyCounters } from './storage'

export type TrophyTier = 'bronze' | 'silver' | 'gold' | 'diamond'

export type TrophyEventType =
  | 'WORKOUT_COMPLETED'
  | 'CHECKIN_SAVED'
  | 'PR_ACHIEVED'
  | 'ROUTINE_CREATED'
  | 'FAVORITE_ADDED'
  | 'VOLUME_RECORDED'

export interface TrophyDefinition {
  id: string
  tier: TrophyTier
  hidden: boolean
  prerequisiteIds?: string[]
  thresholdMetric?: keyof TrophyCounters
  thresholdValue?: number
  triggerEvent?: TrophyEventType
  triggerEventPeriod?: string
}

// Ordered: non-prerequisite trophies first, prerequisite/diamond last
// so two-pass evaluation in the engine handles dependencies correctly.
export const TROPHY_CATALOG: readonly TrophyDefinition[] = [
  // ── Bronze (16) ─────────────────────────────────────────────────────
  {
    id: 'first_workout',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'totalWorkouts',
    thresholdValue: 1,
  },
  {
    id: 'workouts_3',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'totalWorkouts',
    thresholdValue: 3,
  },
  {
    id: 'workouts_10',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'totalWorkouts',
    thresholdValue: 10,
  },
  {
    id: 'workouts_25',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'totalWorkouts',
    thresholdValue: 25,
  },
  {
    id: 'workouts_50',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'totalWorkouts',
    thresholdValue: 50,
  },
  {
    id: 'workouts_100',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'totalWorkouts',
    thresholdValue: 100,
  },
  {
    id: 'active_7',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'activeDaysTotal',
    thresholdValue: 7,
  },
  {
    id: 'active_14',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'activeDaysTotal',
    thresholdValue: 14,
  },
  {
    id: 'active_30',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'activeDaysTotal',
    thresholdValue: 30,
  },
  {
    id: 'active_66',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'activeDaysTotal',
    thresholdValue: 66,
  },
  {
    id: 'streak_3',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'currentStreak',
    thresholdValue: 3,
  },
  {
    id: 'streak_7',
    tier: 'bronze',
    hidden: false,
    thresholdMetric: 'currentStreak',
    thresholdValue: 7,
  },
  {
    id: 'first_pr',
    tier: 'bronze',
    hidden: false,
    triggerEvent: 'PR_ACHIEVED',
  },
  {
    id: 'routine_created',
    tier: 'bronze',
    hidden: false,
    triggerEvent: 'ROUTINE_CREATED',
  },
  {
    id: 'favorite_added',
    tier: 'bronze',
    hidden: false,
    triggerEvent: 'FAVORITE_ADDED',
  },
  {
    id: 'checkin_day1',
    tier: 'bronze',
    hidden: false,
    triggerEvent: 'CHECKIN_SAVED',
    triggerEventPeriod: 'day1',
  },

  // ── Silver (10) ─────────────────────────────────────────────────────
  {
    id: 'workouts_200',
    tier: 'silver',
    hidden: false,
    thresholdMetric: 'totalWorkouts',
    thresholdValue: 200,
  },
  {
    id: 'active_100',
    tier: 'silver',
    hidden: false,
    thresholdMetric: 'activeDaysTotal',
    thresholdValue: 100,
  },
  {
    id: 'prs_5',
    tier: 'silver',
    hidden: false,
    thresholdMetric: 'totalPRs',
    thresholdValue: 5,
  },
  {
    id: 'prs_10',
    tier: 'silver',
    hidden: false,
    thresholdMetric: 'totalPRs',
    thresholdValue: 10,
  },
  {
    id: 'streak_14',
    tier: 'silver',
    hidden: false,
    thresholdMetric: 'currentStreak',
    thresholdValue: 14,
  },
  {
    id: 'streak_30',
    tier: 'silver',
    hidden: false,
    thresholdMetric: 'currentStreak',
    thresholdValue: 30,
  },
  {
    id: 'checkin_month1',
    tier: 'silver',
    hidden: false,
    triggerEvent: 'CHECKIN_SAVED',
    triggerEventPeriod: 'month1',
  },
  {
    id: 'checkin_month3',
    tier: 'silver',
    hidden: false,
    triggerEvent: 'CHECKIN_SAVED',
    triggerEventPeriod: 'month3',
  },
  {
    id: 'volume_1000kg',
    tier: 'silver',
    hidden: false,
    thresholdMetric: 'totalVolumeKg',
    thresholdValue: 1000,
  },
  {
    id: 'routines_3',
    tier: 'silver',
    hidden: false,
    thresholdMetric: 'totalRoutinesCreated',
    thresholdValue: 3,
  },

  // ── Gold (6) ────────────────────────────────────────────────────────
  {
    id: 'workouts_365',
    tier: 'gold',
    hidden: false,
    thresholdMetric: 'totalWorkouts',
    thresholdValue: 365,
  },
  {
    id: 'active_200',
    tier: 'gold',
    hidden: false,
    thresholdMetric: 'activeDaysTotal',
    thresholdValue: 200,
  },
  {
    id: 'streak_66',
    tier: 'gold',
    hidden: false,
    thresholdMetric: 'currentStreak',
    thresholdValue: 66,
  },
  {
    id: 'prs_25',
    tier: 'gold',
    hidden: false,
    thresholdMetric: 'totalPRs',
    thresholdValue: 25,
  },
  {
    id: 'checkin_month6',
    tier: 'gold',
    hidden: false,
    triggerEvent: 'CHECKIN_SAVED',
    triggerEventPeriod: 'month6',
  },
  {
    id: 'checkin_month12',
    tier: 'gold',
    hidden: false,
    triggerEvent: 'CHECKIN_SAVED',
    triggerEventPeriod: 'month12',
  },

  // ── Diamond / Hidden (8) ─────────────────────────────────────────────
  // These are listed last so the engine's two-pass approach can check prerequisites
  // that may have been unlocked in the same evaluation call.
  {
    id: 'workouts_500',
    tier: 'diamond',
    hidden: true,
    thresholdMetric: 'totalWorkouts',
    thresholdValue: 500,
  },
  {
    id: 'workouts_1000',
    tier: 'diamond',
    hidden: true,
    thresholdMetric: 'totalWorkouts',
    thresholdValue: 1000,
  },
  {
    id: 'streak_100',
    tier: 'diamond',
    hidden: true,
    thresholdMetric: 'currentStreak',
    thresholdValue: 100,
  },
  {
    id: 'active_365',
    tier: 'diamond',
    hidden: true,
    thresholdMetric: 'activeDaysTotal',
    thresholdValue: 365,
  },
  {
    id: 'prs_50',
    tier: 'diamond',
    hidden: true,
    thresholdMetric: 'totalPRs',
    thresholdValue: 50,
  },
  {
    id: 'prs_100',
    tier: 'diamond',
    hidden: true,
    thresholdMetric: 'totalPRs',
    thresholdValue: 100,
  },
  // time_capsule: requires both checkin_day1 and checkin_month12 unlocked
  {
    id: 'time_capsule',
    tier: 'diamond',
    hidden: true,
    prerequisiteIds: ['checkin_day1', 'checkin_month12'],
  },
  // first_year: special — evaluated on any event; checks firstWorkoutAt age
  {
    id: 'first_year',
    tier: 'diamond',
    hidden: true,
  },
]

export const TROPHY_MAP: Readonly<Record<string, TrophyDefinition>> = Object.fromEntries(
  TROPHY_CATALOG.map((t) => [t.id, t]),
)

export function getTrophy(id: string): TrophyDefinition | undefined {
  return TROPHY_MAP[id]
}
