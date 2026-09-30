jest.mock('../src/lib/supabaseClient', () => ({
  requireSupabase: jest.fn(),
  normalizeDbResult: <T>(r: { data: T | null; error: unknown }) => ({
    data: r.data,
    error: r.error instanceof Error ? r.error : null,
  }),
}))

import { requireSupabase } from '../src/lib/supabaseClient'
import { updateWorkoutSessionDate } from '../src/db/workouts'

const requireSupabaseMock = requireSupabase as jest.Mock

function mockWorkoutsChain() {
  const updateMock = jest.fn()
  const eqMock = jest.fn()
  const selectMock = jest.fn()
  const singleMock = jest.fn().mockResolvedValue({ data: {}, error: null })

  updateMock.mockReturnValue({ eq: eqMock })
  eqMock.mockReturnValue({ select: selectMock })
  selectMock.mockReturnValue({ single: singleMock })

  return {
    update: updateMock,
    _single: singleMock,
    _update: updateMock,
  }
}

function asSupabaseClient(workoutsChain: ReturnType<typeof mockWorkoutsChain>) {
  return {
    from: () => workoutsChain,
  }
}

describe('updateWorkoutSessionDate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('preserves duration when both started_at and ended_at exist', async () => {
    const workoutsChain = mockWorkoutsChain()
    requireSupabaseMock.mockReturnValue(asSupabaseClient(workoutsChain))

    const updateCall = workoutsChain.update as jest.Mock
    const singleResolve = workoutsChain._single as jest.Mock
    singleResolve.mockResolvedValue({
      data: {
        id: 'w1',
        started_at: '2026-02-15T18:00:00.000Z',
        ended_at: '2026-02-15T19:00:00.000Z',
      },
      error: null,
    })

    await updateWorkoutSessionDate({
      workoutId: 'w1',
      newDateISO: '2026-02-14T18:00:00.000Z',
      currentStartedAt: '2026-02-15T18:00:00.000Z',
      currentEndedAt: '2026-02-15T19:00:00.000Z',
    })

    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        started_at: '2026-02-14T18:00:00.000Z',
        ended_at: '2026-02-14T19:00:00.000Z',
      }),
    )
  })

  it('falls back to same value when only one timestamp exists', async () => {
    const workoutsChain = mockWorkoutsChain()
    requireSupabaseMock.mockReturnValue(asSupabaseClient(workoutsChain))

    const updateCall = workoutsChain.update as jest.Mock

    await updateWorkoutSessionDate({
      workoutId: 'w1',
      newDateISO: '2026-02-14T12:00:00.000Z',
      currentStartedAt: null,
      currentEndedAt: '2026-02-15T19:00:00.000Z',
    })

    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        started_at: '2026-02-14T12:00:00.000Z',
        ended_at: '2026-02-14T12:00:00.000Z',
      }),
    )
  })

  it('handles invalid end < start by using same value', async () => {
    const workoutsChain = mockWorkoutsChain()
    requireSupabaseMock.mockReturnValue(asSupabaseClient(workoutsChain))

    const updateCall = workoutsChain.update as jest.Mock

    await updateWorkoutSessionDate({
      workoutId: 'w1',
      newDateISO: '2026-02-14T12:00:00.000Z',
      currentStartedAt: '2026-02-15T19:00:00.000Z',
      currentEndedAt: '2026-02-15T18:00:00.000Z',
    })

    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        started_at: '2026-02-14T12:00:00.000Z',
        ended_at: '2026-02-14T12:00:00.000Z',
      }),
    )
  })
})
