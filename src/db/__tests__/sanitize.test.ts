import { sanitizeRow, sanitizeRows } from '../sanitize'

describe('sanitize', () => {
  it('drops set_type and rir from workout_sets row', () => {
    const row = {
      id: 'set-1',
      workout_exercise_id: 'ex-1',
      client_uuid: 'cuuid-1',
      set_index: 0,
      reps: 10,
      weight: 100,
      weight_kg: 45.36,
      duration_seconds: null,
      distance_m: null,
      is_weight_canonical: true,
      is_completed: true,
      created_at: '2024-01-01T00:00:00Z',
      set_type: 'normal',
      rir: 2,
    }
    const out = sanitizeRow('workout_sets', row)
    expect(Object.keys(out)).not.toContain('set_type')
    expect(Object.keys(out)).not.toContain('rir')
    expect((out as Record<string, unknown>).id).toBe('set-1')
    expect((out as Record<string, unknown>).reps).toBe(10)
  })

  it('drops superset_group_id and superset_order from workout_exercises row', () => {
    const row = {
      id: 'ex-1',
      workout_id: 'w-1',
      client_uuid: 'cuuid-1',
      exercise_definition_id: 'def-1',
      order_index: 0,
      notes: null,
      created_at: '2024-01-01T00:00:00Z',
      superset_group_id: 'sg-1',
      superset_order: 1,
    }
    const out = sanitizeRow('workout_exercises', row)
    expect(Object.keys(out)).not.toContain('superset_group_id')
    expect(Object.keys(out)).not.toContain('superset_order')
    expect((out as Record<string, unknown>).order_index).toBe(0)
  })

  it('sanitizeRows processes multiple rows', () => {
    const rows = [
      { id: '1', set_type: 'warmup', rir: 0, set_index: 0 },
      { id: '2', set_type: 'drop', rir: 1, set_index: 1 },
    ]
    const out = sanitizeRows('workout_sets', rows)
    expect(out).toHaveLength(2)
    expect(Object.keys(out[0])).not.toContain('set_type')
    expect(Object.keys(out[0])).not.toContain('rir')
    expect(Object.keys(out[1])).not.toContain('set_type')
    expect(Object.keys(out[1])).not.toContain('rir')
  })

  it('preserves allowed keys', () => {
    const row = {
      id: 'w-1',
      user_id: 'u-1',
      client_uuid: 'cuuid-1',
      started_at: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
    }
    const out = sanitizeRow('workouts', row)
    expect(out).toEqual(row)
  })
})
