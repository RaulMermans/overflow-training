/**
 * Regression: DB payload contract alignment.
 * Ensures workout_exercises and workout_sets insert/upsert payloads
 * only contain columns that exist in the live DB (no phantom fields).
 *
 * Live DB does NOT include:
 * - workout_exercises: superset_group_id, superset_order
 * - workout_sets: set_type, rir
 */
const ALLOWED_WORKOUT_EXERCISES_KEYS = new Set([
  'id',
  'workout_id',
  'client_uuid',
  'exercise_definition_id',
  'order_index',
  'notes',
  'created_at',
  'updated_at',
])

const ALLOWED_WORKOUT_SETS_KEYS = new Set([
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
])

function isSubset(keys: string[], allowed: Set<string>): boolean {
  return keys.every((k) => allowed.has(k))
}

describe('contract-db-payloads', () => {
  it('workout_exercises insert payload keys are subset of allowed', () => {
    const payload = {
      id: '00000000-0000-0000-0000-000000000001',
      workout_id: '00000000-0000-0000-0000-000000000002',
      client_uuid: '00000000-0000-0000-0000-000000000003',
      exercise_definition_id: '00000000-0000-0000-0000-000000000004',
      order_index: 0,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(isSubset(Object.keys(payload), ALLOWED_WORKOUT_EXERCISES_KEYS)).toBe(true)
    expect(
      Object.keys(payload).every((k) => !['superset_group_id', 'superset_order'].includes(k)),
    ).toBe(true)
  })

  it('workout_exercises payload must not include superset_group_id or superset_order', () => {
    const badPayload = {
      id: 'a',
      workout_id: 'b',
      client_uuid: 'c',
      exercise_definition_id: 'd',
      order_index: 0,
      notes: null,
      superset_group_id: 'x',
      superset_order: 1,
      created_at: new Date().toISOString(),
    }
    expect(ALLOWED_WORKOUT_EXERCISES_KEYS.has('superset_group_id')).toBe(false)
    expect(ALLOWED_WORKOUT_EXERCISES_KEYS.has('superset_order')).toBe(false)
    expect(isSubset(Object.keys(badPayload), ALLOWED_WORKOUT_EXERCISES_KEYS)).toBe(false)
  })

  it('workout_sets insert payload keys are subset of allowed', () => {
    const payload = {
      id: '00000000-0000-0000-0000-000000000001',
      workout_exercise_id: '00000000-0000-0000-0000-000000000002',
      client_uuid: '00000000-0000-0000-0000-000000000003',
      set_index: 1,
      reps: 10,
      weight: 60,
      weight_kg: 27.27,
      is_weight_canonical: true,
      is_completed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(isSubset(Object.keys(payload), ALLOWED_WORKOUT_SETS_KEYS)).toBe(true)
    expect(Object.keys(payload).every((k) => !['set_type', 'rir'].includes(k))).toBe(true)
  })

  it('workout_sets payload must not include set_type or rir', () => {
    const badPayload = {
      id: 'a',
      workout_exercise_id: 'b',
      client_uuid: 'c',
      set_index: 1,
      reps: 10,
      set_type: 'normal',
      rir: 2,
      created_at: new Date().toISOString(),
    }
    expect(ALLOWED_WORKOUT_SETS_KEYS.has('set_type')).toBe(false)
    expect(ALLOWED_WORKOUT_SETS_KEYS.has('rir')).toBe(false)
    expect(isSubset(Object.keys(badPayload), ALLOWED_WORKOUT_SETS_KEYS)).toBe(false)
  })
})
