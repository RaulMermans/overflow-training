jest.mock('../src/lib/supabaseClient', () => {
  const actual = jest.requireActual('../src/lib/supabaseClient')
  return {
    ...actual,
    requireSupabase: jest.fn(),
  }
})

import { requireSupabase } from '../src/lib/supabaseClient'
import { upsertWorkoutExerciseFromClient } from '../src/db/workouts'

describe('upsertWorkoutExerciseFromClient contract alignment', () => {
  const requireSupabaseMock = requireSupabase as jest.Mock

  beforeEach(() => {
    requireSupabaseMock.mockReset()
  })

  it('omits superset fields from DB payload (live DB has no superset columns)', async () => {
    const single = jest.fn(async () => ({ data: { id: 'exercise-1' }, error: null }))
    const select = jest.fn(() => ({ single }))
    const upsert = jest.fn(() => ({ select }))
    const from = jest.fn(() => ({ upsert }))

    requireSupabaseMock.mockReturnValue({ from })

    const result = await upsertWorkoutExerciseFromClient({
      id: 'exercise-1',
      workout_id: 'workout-1',
      client_uuid: 'client-1',
      exercise_definition_id: 'definition-1',
      order_index: 0,
      notes: null,
      created_at: new Date().toISOString(),
    })

    expect(requireSupabaseMock).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('workout_exercises')

    const [upsertPayload, upsertOptions] = upsert.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]

    expect(Object.keys(upsertPayload)).not.toContain('superset_group_id')
    expect(Object.keys(upsertPayload)).not.toContain('superset_order')
    expect(upsertOptions.onConflict).toBe('workout_id,client_uuid')
    expect(result.error).toBeNull()
  })
})
