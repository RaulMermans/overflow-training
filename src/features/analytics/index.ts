// Analytics module — public surface
// Import from this barrel instead of individual files

export * from './analyticsTypes'
export * from './analyticsCache'
export {
  deriveLoadState,
  computeDelta,
  normalizeWeekSeries,
  normalizeWeekSeriesNullable,
  shapeProgressOverview,
  shapeWeeklyWorkouts,
  shapeWeeklyStrengthVolume,
  shapeMuscleBalance,
  shapeExerciseTrend,
  fromWeightKg,
} from './analyticsService'
export {
  fetchProgressOverview,
  fetchWeeklyWorkouts,
  fetchWeeklyStrengthVolume,
  fetchMuscleBalance,
  fetchExerciseE1RMTrend,
  computeStartWeekMonday,
  AnalyticsClientError,
} from './analyticsClient'
export { useProgressOverview } from './hooks/useProgressOverview'
export { useWeeklyWorkouts } from './hooks/useWeeklyWorkouts'
export { useWeeklyStrengthVolume } from './hooks/useWeeklyStrengthVolume'
export { useMuscleBalance } from './hooks/useMuscleBalance'
export { useExerciseTrend } from './hooks/useExerciseTrend'
