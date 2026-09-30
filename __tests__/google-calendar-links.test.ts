/**
 * Tests for the scheduled_workout_calendar_links DB operations.
 * All Supabase calls are mocked.
 */

const mockFrom = jest.fn()
const mockSingle = jest.fn()
const mockUpsert = jest.fn()

jest.mock('../src/lib/supabaseClient', () => ({
  requireSupabase: () => ({
    from: mockFrom,
  }),
}))

import {
  fetchFutureLinks,
  fetchLink,
  upsertLink,
  deleteLink,
} from '../src/db/scheduledWorkoutCalendarLinks'

const linkRow = {
  id: 'link-1',
  user_id: 'user-1',
  scheduled_routine_id: 'sr-1',
  external_calendar_id: 'primary',
  external_event_id: 'gcal-1',
  sync_status: 'synced',
  last_synced_at: '2026-03-18T12:00:00Z',
  last_error: null,
  created_at: '2026-03-18T12:00:00Z',
  updated_at: '2026-03-18T12:00:00Z',
}

function buildFetchLinkChain() {
  const chain: Record<string, jest.Mock> = {}
  chain['select'] = jest.fn(() => chain)
  chain['eq'] = jest.fn(() => chain)
  chain['single'] = mockSingle
  return chain
}

function buildUpsertChain() {
  return {
    upsert: mockUpsert,
  }
}

function buildDeleteChain(result: { error: null | { message: string } }) {
  const secondEq = jest.fn().mockResolvedValue(result)
  const firstEq = jest.fn().mockReturnValue({ eq: secondEq })
  return {
    delete: jest.fn().mockReturnValue({ eq: firstEq }),
  }
}

function buildRoutineIdsChain(result: { data: Array<{ id: string }> | null; error: unknown }) {
  const selectChain: Record<string, jest.Mock> = {}
  selectChain['eq'] = jest.fn(() => selectChain)
  selectChain['gte'] = jest.fn().mockResolvedValue(result)
  return {
    select: jest.fn(() => selectChain),
  }
}

function buildFutureLinksChain(result: { data: Record<string, unknown>[] | null; error: unknown }) {
  const selectChain: Record<string, jest.Mock> = {}
  selectChain['eq'] = jest.fn(() => ({
    in: jest.fn().mockResolvedValue(result),
  }))
  return {
    select: jest.fn(() => selectChain),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFrom.mockImplementation((table: string) => {
    if (table === 'scheduled_workout_calendar_links') {
      const chain = buildFetchLinkChain()
      return {
        ...chain,
        ...buildUpsertChain(),
      }
    }

    return {}
  })
  mockUpsert.mockReturnValue({ select: jest.fn().mockReturnValue({ single: mockSingle }) })
})

describe('fetchLink', () => {
  it('returns mapped link when found', async () => {
    mockSingle.mockResolvedValue({ data: linkRow, error: null })

    const result = await fetchLink('user-1', 'sr-1')

    expect(result).not.toBeNull()
    expect(result?.externalEventId).toBe('gcal-1')
    expect(result?.syncStatus).toBe('synced')
    expect(result?.scheduledRoutineId).toBe('sr-1')
  })

  it('returns null when not found', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const result = await fetchLink('user-1', 'sr-99')

    expect(result).toBeNull()
  })
})

describe('upsertLink', () => {
  it('calls upsert with correct column names', async () => {
    mockSingle.mockResolvedValue({ data: linkRow, error: null })

    await upsertLink('user-1', {
      scheduledRoutineId: 'sr-1',
      externalCalendarId: 'primary',
      externalEventId: 'gcal-1',
      syncStatus: 'synced',
      lastSyncedAt: '2026-03-18T12:00:00Z',
      lastError: null,
    })

    expect(mockFrom).toHaveBeenCalledWith('scheduled_workout_calendar_links')
    const upsertCall = mockUpsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(upsertCall['user_id']).toBe('user-1')
    expect(upsertCall['scheduled_routine_id']).toBe('sr-1')
    expect(upsertCall['external_event_id']).toBe('gcal-1')
    expect(upsertCall['sync_status']).toBe('synced')
  })

  it('uses correct onConflict key', async () => {
    mockSingle.mockResolvedValue({ data: linkRow, error: null })

    await upsertLink('user-1', {
      scheduledRoutineId: 'sr-1',
      externalCalendarId: 'primary',
      externalEventId: 'gcal-1',
      syncStatus: 'synced',
      lastSyncedAt: null,
      lastError: null,
    })

    const upsertOptions = mockUpsert.mock.calls[0]?.[1] as { onConflict?: string }
    expect(upsertOptions?.onConflict).toBe('user_id,scheduled_routine_id')
  })

  it('throws when DB returns error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'constraint violation' } })

    await expect(
      upsertLink('user-1', {
        scheduledRoutineId: 'sr-1',
        externalCalendarId: 'primary',
        externalEventId: 'gcal-1',
        syncStatus: 'synced',
        lastSyncedAt: null,
        lastError: null,
      }),
    ).rejects.toThrow('constraint violation')
  })
})

describe('deleteLink', () => {
  it('calls delete on the correct table', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'scheduled_workout_calendar_links') {
        return buildDeleteChain({ error: null })
      }
      return {}
    })

    await deleteLink('user-1', 'sr-1')

    expect(mockFrom).toHaveBeenCalledWith('scheduled_workout_calendar_links')
  })
})

describe('fetchFutureLinks', () => {
  it('returns mapped links for future scheduled workouts', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'scheduled_routines') {
        return buildRoutineIdsChain({
          data: [{ id: 'sr-1' }, { id: 'sr-2' }],
          error: null,
        })
      }

      if (table === 'scheduled_workout_calendar_links') {
        return buildFutureLinksChain({
          data: [
            linkRow,
            {
              ...linkRow,
              id: 'link-2',
              scheduled_routine_id: 'sr-2',
              external_event_id: 'gcal-2',
            },
          ],
          error: null,
        })
      }

      return {}
    })

    const result = await fetchFutureLinks('user-1', '2026-03-20')

    expect(result).toHaveLength(2)
    expect(result.map((link) => link.scheduledRoutineId)).toEqual(['sr-1', 'sr-2'])
    expect(result.map((link) => link.externalEventId)).toEqual(['gcal-1', 'gcal-2'])
  })

  it('returns an empty list when there are no future scheduled routines', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'scheduled_routines') {
        return buildRoutineIdsChain({ data: [], error: null })
      }
      return {}
    })

    const result = await fetchFutureLinks('user-1', '2026-03-20')

    expect(result).toEqual([])
  })
})
