/**
 * Phase 4: fetchScheduledRoutinesForDateRange builds Record<dateKey, PlannedDay> from Supabase.
 */
import { requireSupabase } from '../src/lib/supabaseClient'
import { fetchScheduledRoutinesForDateRange } from '../src/db/scheduledRoutines'

jest.mock('../src/lib/supabaseClient', () => {
  const actual = jest.requireActual('../src/lib/supabaseClient')
  return {
    ...actual,
    requireSupabase: jest.fn(),
  }
})

const requireSupabaseMock = requireSupabase as jest.MockedFunction<typeof requireSupabase>

function asSupabaseClient(from: (table: string) => { select: () => unknown }) {
  return { from } as unknown as ReturnType<typeof requireSupabase>
}

describe('fetchScheduledRoutinesForDateRange', () => {
  it('returns empty object when userId is empty', async () => {
    const result = await fetchScheduledRoutinesForDateRange('', '2026-02-01', '2026-02-28')
    expect(result).toEqual({})
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('returns empty object when date range is invalid', async () => {
    const result = await fetchScheduledRoutinesForDateRange('user-1', '2026-02-30', '2026-02-01')
    expect(result).toEqual({})
  })

  it('builds Record<dateKey, PlannedDay> from rows', async () => {
    const lte = jest.fn().mockResolvedValue({
      data: [
        { date: '2026-02-01', routine_id: 'routine-a' },
        { date: '2026-02-15', routine_id: 'routine-b' },
      ],
      error: null,
    })
    const gte = jest.fn().mockReturnValue({ lte })
    const eq = jest.fn().mockReturnValue({ gte })
    const select = jest.fn().mockReturnValue({ eq })
    const from = jest.fn(() => ({ select }))
    requireSupabaseMock.mockReturnValue(
      asSupabaseClient(from as (table: string) => { select: () => unknown }),
    )

    const result = await fetchScheduledRoutinesForDateRange('user-1', '2026-02-01', '2026-02-28')

    expect(result).toEqual({
      '2026-02-01': { date: '2026-02-01', routineId: 'routine-a' },
      '2026-02-15': { date: '2026-02-15', routineId: 'routine-b' },
    })
    expect(from).toHaveBeenCalledWith('scheduled_routines')
    expect(select).toHaveBeenCalledWith('date, routine_id')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(gte).toHaveBeenCalledWith('date', '2026-02-01')
    expect(lte).toHaveBeenCalledWith('date', '2026-02-28')
  })

  it('returns empty object on Supabase error', async () => {
    const lte = jest.fn().mockResolvedValue({
      data: null,
      error: new Error('network error'),
    })
    const gte = jest.fn().mockReturnValue({ lte })
    const eq = jest.fn().mockReturnValue({ gte })
    const select = jest.fn().mockReturnValue({ eq })
    const from = jest.fn(() => ({ select }))
    requireSupabaseMock.mockReturnValue(
      asSupabaseClient(from as (table: string) => { select: () => unknown }),
    )

    const result = await fetchScheduledRoutinesForDateRange('user-1', '2026-02-01', '2026-02-28')

    expect(result).toEqual({})
  })
})
