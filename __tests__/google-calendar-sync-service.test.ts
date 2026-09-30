/**
 * Tests for Google Calendar sync service.
 * Mocks the Google Calendar client and DB layer so no real HTTP or DB calls occur.
 */

const mockFetchConnection = jest.fn()
const mockUpsertConnection = jest.fn()
const mockFetchLink = jest.fn()
const mockUpsertLink = jest.fn()
const mockDeleteLink = jest.fn()
const mockFetchFutureLinks = jest.fn()
const mockCreateEvent = jest.fn()
const mockUpdateEvent = jest.fn()
const mockDeleteEvent = jest.fn()

jest.mock('../src/db/googleCalendarConnections', () => ({
  fetchConnection: (...args: unknown[]) => mockFetchConnection(...args),
  upsertConnection: (...args: unknown[]) => mockUpsertConnection(...args),
}))

jest.mock('../src/db/scheduledWorkoutCalendarLinks', () => ({
  fetchLink: (...args: unknown[]) => mockFetchLink(...args),
  upsertLink: (...args: unknown[]) => mockUpsertLink(...args),
  deleteLink: (...args: unknown[]) => mockDeleteLink(...args),
  fetchFutureLinks: (...args: unknown[]) => mockFetchFutureLinks(...args),
}))

jest.mock('../src/features/googleCalendar/googleCalendarClient', () => ({
  createEvent: (...args: unknown[]) => mockCreateEvent(...args),
  updateEvent: (...args: unknown[]) => mockUpdateEvent(...args),
  deleteEvent: (...args: unknown[]) => mockDeleteEvent(...args),
}))

// Mock the Supabase client used by syncService to fetch scheduled_routines.
// Uses a universal chain object so any combination of .eq/.gte/.order/.single works.
const mockSupabaseSingle = jest.fn()
const mockSupabaseOrder = jest.fn(async () => ({ data: [], error: null }))

function makeChain(): Record<string, jest.Mock> {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    gte: jest.fn(() => chain),
    order: jest.fn(() => mockSupabaseOrder()),
    single: jest.fn(() => mockSupabaseSingle()),
  }
  return chain
}

let mockSupabaseChain = makeChain()

jest.mock('../src/lib/supabaseClient', () => ({
  requireSupabase: () => ({
    from: () => mockSupabaseChain,
    auth: { getUser: jest.fn() },
  }),
}))

import {
  syncCalendarEventForDate,
  deleteCalendarEventForDate,
  backfillFutureScheduledRoutines,
  repairAllFutureLinks,
} from '../src/features/googleCalendar/syncService'

const connectedConnection = {
  id: 'conn-1',
  userId: 'user-1',
  selectedCalendarId: 'primary',
  selectedCalendarSummary: 'My Calendar',
  syncEnabled: true,
  status: 'connected' as const,
  connectedAt: '2026-03-18T00:00:00Z',
  updatedAt: '2026-03-18T00:00:00Z',
  lastError: null,
}

const scheduledRoutineRow = {
  id: 'sr-1',
  date: '2026-03-20',
  status: 'scheduled',
  routines: { name: 'Push Day' },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSupabaseChain = makeChain()
  mockFetchConnection.mockResolvedValue(connectedConnection)
  mockSupabaseSingle.mockResolvedValue({ data: scheduledRoutineRow, error: null })
  mockSupabaseOrder.mockResolvedValue({ data: [], error: null })
  mockFetchLink.mockResolvedValue(null)
  mockCreateEvent.mockResolvedValue({ id: 'gcal-event-1' })
  mockUpsertLink.mockResolvedValue({})
  mockUpdateEvent.mockResolvedValue(undefined)
  mockDeleteEvent.mockResolvedValue(undefined)
  mockDeleteLink.mockResolvedValue(undefined)
})

describe('syncCalendarEventForDate', () => {
  it('creates a new event when no link exists', async () => {
    mockFetchLink.mockResolvedValue(null)
    await syncCalendarEventForDate('user-1', '2026-03-20')
    expect(mockCreateEvent).toHaveBeenCalledWith(
      'user-1',
      'primary',
      expect.objectContaining({
        summary: 'Workout — Push Day',
        start: { date: '2026-03-20' },
      }),
    )
    expect(mockUpsertLink).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        externalEventId: 'gcal-event-1',
        syncStatus: 'synced',
      }),
    )
  })

  it('updates existing event when link exists', async () => {
    mockFetchLink.mockResolvedValue({
      externalCalendarId: 'primary',
      externalEventId: 'gcal-event-existing',
      syncStatus: 'synced',
    })
    await syncCalendarEventForDate('user-1', '2026-03-20')
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      'user-1',
      'primary',
      'gcal-event-existing',
      expect.objectContaining({ summary: 'Workout — Push Day' }),
    )
    expect(mockCreateEvent).not.toHaveBeenCalled()
  })

  it('no-ops when sync is disabled', async () => {
    mockFetchConnection.mockResolvedValue({ ...connectedConnection, syncEnabled: false })
    await syncCalendarEventForDate('user-1', '2026-03-20')
    expect(mockCreateEvent).not.toHaveBeenCalled()
  })

  it('no-ops when not connected', async () => {
    mockFetchConnection.mockResolvedValue({ ...connectedConnection, status: 'disconnected' })
    await syncCalendarEventForDate('user-1', '2026-03-20')
    expect(mockCreateEvent).not.toHaveBeenCalled()
  })

  it('no-ops when connection is null', async () => {
    mockFetchConnection.mockResolvedValue(null)
    await syncCalendarEventForDate('user-1', '2026-03-20')
    expect(mockCreateEvent).not.toHaveBeenCalled()
  })

  it('no-ops when scheduled routine not found', async () => {
    mockSupabaseSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    await syncCalendarEventForDate('user-1', '2026-03-20')
    expect(mockCreateEvent).not.toHaveBeenCalled()
  })

  it('no-ops when the scheduled workout is already completed', async () => {
    mockSupabaseSingle.mockResolvedValue({
      data: { ...scheduledRoutineRow, status: 'completed' },
      error: null,
    })

    await syncCalendarEventForDate('user-1', '2026-03-20')

    expect(mockCreateEvent).not.toHaveBeenCalled()
    expect(mockUpdateEvent).not.toHaveBeenCalled()
  })

  it('no-ops when the scheduled workout was skipped', async () => {
    mockSupabaseSingle.mockResolvedValue({
      data: { ...scheduledRoutineRow, status: 'skipped' },
      error: null,
    })

    await syncCalendarEventForDate('user-1', '2026-03-20')

    expect(mockCreateEvent).not.toHaveBeenCalled()
    expect(mockUpdateEvent).not.toHaveBeenCalled()
  })
})

describe('deleteCalendarEventForDate', () => {
  it('deletes event and link when link exists', async () => {
    mockSupabaseSingle.mockResolvedValue({ data: { id: 'sr-1' }, error: null })
    mockFetchLink.mockResolvedValue({
      scheduledRoutineId: 'sr-1',
      externalCalendarId: 'primary',
      externalEventId: 'gcal-event-1',
    })
    await deleteCalendarEventForDate('user-1', '2026-03-20')
    expect(mockDeleteEvent).toHaveBeenCalledWith('user-1', 'primary', 'gcal-event-1')
    expect(mockDeleteLink).toHaveBeenCalledWith('user-1', 'sr-1')
  })

  it('no-ops when no link exists', async () => {
    mockSupabaseSingle.mockResolvedValue({ data: { id: 'sr-1' }, error: null })
    mockFetchLink.mockResolvedValue(null)
    await deleteCalendarEventForDate('user-1', '2026-03-20')
    expect(mockDeleteEvent).not.toHaveBeenCalled()
  })

  it('no-ops when not connected', async () => {
    mockFetchConnection.mockResolvedValue({ ...connectedConnection, status: 'disconnected' })
    await deleteCalendarEventForDate('user-1', '2026-03-20')
    expect(mockDeleteEvent).not.toHaveBeenCalled()
  })

  it('no-ops when scheduled routine not found', async () => {
    mockSupabaseSingle.mockResolvedValue({ data: null, error: null })
    await deleteCalendarEventForDate('user-1', '2026-03-20')
    expect(mockDeleteEvent).not.toHaveBeenCalled()
  })
})

describe('backfillFutureScheduledRoutines', () => {
  it('creates events for unlinked future routines', async () => {
    const futureRoutines = [
      { id: 'sr-1', date: '2026-03-20', status: 'scheduled', routines: { name: 'Legs' } },
      { id: 'sr-2', date: '2026-03-22', status: 'started', routines: { name: 'Pull Day' } },
    ]
    mockSupabaseOrder.mockResolvedValue({ data: futureRoutines, error: null })
    mockFetchLink.mockResolvedValue(null)

    await backfillFutureScheduledRoutines('user-1')

    expect(mockCreateEvent).toHaveBeenCalledTimes(2)
    expect(mockUpsertLink).toHaveBeenCalledTimes(2)
  })

  it('skips already-linked routines', async () => {
    const futureRoutines = [
      { id: 'sr-1', date: '2026-03-20', status: 'scheduled', routines: { name: 'Legs' } },
    ]
    mockSupabaseOrder.mockResolvedValue({ data: futureRoutines, error: null })
    mockFetchLink.mockResolvedValue({ externalEventId: 'existing', syncStatus: 'synced' })

    await backfillFutureScheduledRoutines('user-1')

    expect(mockCreateEvent).not.toHaveBeenCalled()
  })

  it('records error on link when individual event creation fails', async () => {
    const futureRoutines = [
      { id: 'sr-1', date: '2026-03-20', status: 'scheduled', routines: { name: 'Legs' } },
    ]
    mockSupabaseOrder.mockResolvedValue({ data: futureRoutines, error: null })
    mockFetchLink.mockResolvedValue(null)
    mockCreateEvent.mockRejectedValue(new Error('API quota exceeded'))

    await backfillFutureScheduledRoutines('user-1')

    expect(mockUpsertLink).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        syncStatus: 'error',
        lastError: 'API quota exceeded',
      }),
    )
  })

  it('no-ops when sync is disabled', async () => {
    mockFetchConnection.mockResolvedValue({ ...connectedConnection, syncEnabled: false })
    await backfillFutureScheduledRoutines('user-1')
    expect(mockCreateEvent).not.toHaveBeenCalled()
  })

  it('skips completed and skipped future rows during bounded backfill', async () => {
    const futureRoutines = [
      { id: 'sr-1', date: '2026-03-20', status: 'scheduled', routines: { name: 'Legs' } },
      { id: 'sr-2', date: '2026-03-22', status: 'completed', routines: { name: 'Push Day' } },
      { id: 'sr-3', date: '2026-03-24', status: 'skipped', routines: { name: 'Pull Day' } },
    ]

    mockSupabaseOrder.mockResolvedValue({ data: futureRoutines, error: null })
    mockFetchLink.mockResolvedValue(null)

    await backfillFutureScheduledRoutines('user-1')

    expect(mockCreateEvent).toHaveBeenCalledTimes(1)
    expect(mockCreateEvent).toHaveBeenCalledWith(
      'user-1',
      'primary',
      expect.objectContaining({ summary: 'Workout — Legs' }),
    )
  })
})

describe('repairAllFutureLinks', () => {
  it('deletes existing future events and recreates current future workouts', async () => {
    mockFetchFutureLinks.mockResolvedValue([
      {
        scheduledRoutineId: 'sr-old',
        externalCalendarId: 'primary',
        externalEventId: 'gcal-old',
      },
    ])
    mockSupabaseOrder.mockResolvedValue({
      data: [
        { id: 'sr-new', date: '2026-03-22', status: 'scheduled', routines: { name: 'Pull Day' } },
      ],
      error: null,
    })
    mockFetchLink.mockResolvedValue(null)

    await repairAllFutureLinks('user-1')

    expect(mockDeleteEvent).toHaveBeenCalledWith('user-1', 'primary', 'gcal-old')
    expect(mockDeleteLink).toHaveBeenCalledWith('user-1', 'sr-old')
    expect(mockCreateEvent).toHaveBeenCalledWith(
      'user-1',
      'primary',
      expect.objectContaining({ summary: 'Workout — Pull Day' }),
    )
    expect(mockUpsertLink).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        scheduledRoutineId: 'sr-new',
        syncStatus: 'synced',
      }),
    )
  })
})
