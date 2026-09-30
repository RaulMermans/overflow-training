import { requireSupabase } from '../src/lib/supabaseClient'
import { captureException } from '../src/lib/observability/crash'
import { clearScheduledRoutineForDate, scheduleRoutineForDate } from '../src/db/scheduledRoutines'

const mockSyncCalendarEventForDate = jest.fn()
const mockDeleteCalendarEventForDate = jest.fn()

jest.mock('../src/features/googleCalendar/syncService', () => ({
  syncCalendarEventForDate: (...args: unknown[]) => mockSyncCalendarEventForDate(...args),
  deleteCalendarEventForDate: (...args: unknown[]) => mockDeleteCalendarEventForDate(...args),
}))

jest.mock('../src/lib/supabaseClient', () => {
  const actual = jest.requireActual('../src/lib/supabaseClient')
  return {
    ...actual,
    requireSupabase: jest.fn(),
  }
})

jest.mock('../src/lib/observability/crash', () => ({
  captureException: jest.fn(),
}))

const requireSupabaseMock = requireSupabase as jest.MockedFunction<typeof requireSupabase>
const captureExceptionMock = captureException as jest.MockedFunction<typeof captureException>

function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('scheduled routines Google Calendar wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('triggers Google Calendar sync after a successful schedule mutation', async () => {
    const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null })
    const mockGetUser = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })

    requireSupabaseMock.mockReturnValue({
      rpc: mockRpc,
      auth: { getUser: mockGetUser },
      from: jest.fn(),
    } as unknown as ReturnType<typeof requireSupabase>)

    mockSyncCalendarEventForDate.mockResolvedValue(undefined)

    const result = await scheduleRoutineForDate('2026-03-21', 'routine-1')

    expect(result).toEqual({ ok: true, error: null })
    await flushAsyncWork()

    expect(mockRpc).toHaveBeenCalledWith('schedule_routine_for_date', {
      p_date: '2026-03-21',
      p_routine_id: 'routine-1',
    })
    expect(mockSyncCalendarEventForDate).toHaveBeenCalledWith('user-1', '2026-03-21')
  })

  it('captures Google Calendar sync failures without failing the schedule mutation', async () => {
    const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null })
    const mockGetUser = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })

    requireSupabaseMock.mockReturnValue({
      rpc: mockRpc,
      auth: { getUser: mockGetUser },
      from: jest.fn(),
    } as unknown as ReturnType<typeof requireSupabase>)

    const syncError = new Error('calendar sync failed')
    mockSyncCalendarEventForDate.mockRejectedValue(syncError)

    const result = await scheduleRoutineForDate('2026-03-21', 'routine-1')

    expect(result).toEqual({ ok: true, error: null })
    await flushAsyncWork()

    expect(captureExceptionMock).toHaveBeenCalledWith(syncError, {
      context: 'googleCalendar.scheduleSync',
    })
  })

  it('deletes the Google Calendar event before removing the scheduled row', async () => {
    const callOrder: string[] = []
    const deleteEqFinal = jest.fn().mockResolvedValue({ error: null })
    const deleteEqFirst = jest.fn().mockReturnValue({ eq: deleteEqFinal })
    const mockDelete = jest.fn().mockImplementation(() => {
      callOrder.push('dbDelete')
      return { eq: deleteEqFirst }
    })
    const mockFrom = jest.fn().mockReturnValue({ delete: mockDelete })

    requireSupabaseMock.mockReturnValue({
      rpc: jest.fn(),
      auth: { getUser: jest.fn() },
      from: mockFrom,
    } as unknown as ReturnType<typeof requireSupabase>)

    mockDeleteCalendarEventForDate.mockImplementation(async () => {
      callOrder.push('calendarDelete')
    })

    const result = await clearScheduledRoutineForDate('user-1', '2026-03-21')

    expect(result).toEqual({ error: null })
    expect(mockDeleteCalendarEventForDate).toHaveBeenCalledWith('user-1', '2026-03-21')
    expect(mockFrom).toHaveBeenCalledWith('scheduled_routines')
    expect(mockDelete).toHaveBeenCalled()
    expect(callOrder).toEqual(['calendarDelete', 'dbDelete'])
  })
})
