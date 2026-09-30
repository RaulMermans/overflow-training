jest.mock('../src/lib/supabaseClient', () => {
  const actual = jest.requireActual('../src/lib/supabaseClient')
  return {
    ...actual,
    requireSupabase: jest.fn(),
  }
})

import { requireSupabase } from '../src/lib/supabaseClient'
import { upsertWorkoutSetFromClient } from '../src/db/workouts'

describe('upsertWorkoutSetFromClient metric guard', () => {
  const requireSupabaseMock = requireSupabase as jest.Mock

  beforeEach(() => {
    requireSupabaseMock.mockReset()
  })

  it('returns a recoverable error when all set metrics are missing', async () => {
    const result = await upsertWorkoutSetFromClient({
      id: 'set-1',
      workout_exercise_id: 'exercise-1',
      client_uuid: 'client-1',
      set_index: 0,
      reps: null,
      duration_seconds: null,
      distance_m: null,
      created_at: new Date().toISOString(),
    })

    expect(requireSupabaseMock).not.toHaveBeenCalled()
    expect(result.data).toBeNull()
    expect(result.error?.message).toContain('Set requires reps, duration, or distance.')
  })

  it('allows writes when at least one metric is present', async () => {
    const single = jest.fn(async () => ({ data: { id: 'set-2' }, error: null }))
    const select = jest.fn(() => ({ single }))
    const upsert = jest.fn(() => ({ select }))
    const from = jest.fn(() => ({ upsert }))

    requireSupabaseMock.mockReturnValue({ from })

    const result = await upsertWorkoutSetFromClient({
      id: 'set-2',
      workout_exercise_id: 'exercise-1',
      client_uuid: 'client-2',
      set_index: 1,
      reps: 8,
      duration_seconds: null,
      distance_m: null,
      created_at: new Date().toISOString(),
    })

    expect(requireSupabaseMock).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('workout_sets')
    const [upsertPayload, upsertOptions] = upsert.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(Object.keys(upsertPayload)).not.toContain('set_type')
    expect(Object.keys(upsertPayload)).not.toContain('rir')
    expect(upsertOptions.onConflict).toBe('workout_exercise_id,client_uuid')
    expect(result.error).toBeNull()
  })
})
