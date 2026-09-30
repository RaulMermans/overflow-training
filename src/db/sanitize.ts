/**
 * Schema-contract sanitization for Supabase writes.
 * Ensures payloads never include keys not present in the live DB schema.
 * Prevents "column does not exist" sync failures from legacy/noise fields.
 *
 * Allowlists match live DB. Excluded per ground truth:
 * - workout_sets: set_type, rir
 * - workout_exercises: superset_group_id, superset_order
 */

export type SanitizableTable =
  | 'workouts'
  | 'workout_exercises'
  | 'workout_sets'
  | 'routines'
  | 'routine_items'
  | 'scheduled_routines'

const ALLOWLIST: Record<SanitizableTable, readonly string[]> = {
  workouts: [
    'id',
    'user_id',
    'client_uuid',
    'started_at',
    'ended_at',
    'status',
    'notes',
    'effort_rating',
    'session_note',
    'created_at',
    'updated_at',
  ],
  workout_exercises: [
    'id',
    'workout_id',
    'client_uuid',
    'exercise_definition_id',
    'order_index',
    'notes',
    'created_at',
    'updated_at',
  ],
  workout_sets: [
    'id',
    'workout_exercise_id',
    'client_uuid',
    'set_index',
    'reps',
    'weight',
    'weight_kg',
    'duration_seconds',
    'distance_m',
    'is_weight_canonical',
    'is_completed',
    'created_at',
    'updated_at',
  ],
  routines: [
    'id',
    'user_id',
    'client_uuid',
    'name',
    'description',
    'color',
    'pinned',
    'created_at',
    'updated_at',
  ],
  routine_items: [
    'id',
    'routine_id',
    'client_uuid',
    'order',
    'exercise_id',
    'sets',
    'reps',
    'rest',
    'notes',
    'created_at',
    'updated_at',
  ],
  scheduled_routines: [
    'id',
    'user_id',
    'date',
    'routine_id',
    'status',
    'workout_id',
    'created_at',
    'updated_at',
  ],
} as const

function pickAllowed<T extends Record<string, unknown>>(
  table: SanitizableTable,
  row: T,
): Record<string, unknown> {
  const allowed = new Set(ALLOWLIST[table])
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (allowed.has(key)) {
      out[key] = value
    }
  }
  return out
}

/**
 * Sanitize a single row for a given table. Drops keys not in the allowlist.
 */
export function sanitizeRow<T extends Record<string, unknown>>(
  table: SanitizableTable,
  row: T,
): Record<string, unknown> {
  return pickAllowed(table, row)
}

/**
 * Sanitize multiple rows for a given table.
 */
export function sanitizeRows<T extends Record<string, unknown>>(
  table: SanitizableTable,
  rows: T[],
): Record<string, unknown>[] {
  return rows.map((row) => pickAllowed(table, row))
}
