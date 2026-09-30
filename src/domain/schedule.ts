/**
 * Shared schedule domain type. Used by db layer, sync, and schedule/calendar/today features.
 * Lives in src/domain so db and cross-feature code do not depend on features/schedule.
 */
export type PlannedDay = {
  date: string
  routineId: string
  note?: string | null
  clientUuid?: string
  updatedAt?: string
}
