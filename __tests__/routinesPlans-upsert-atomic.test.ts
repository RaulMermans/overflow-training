import { upsertCloudRoutineWithItems } from '../src/db/routinesPlans'
import { requireSupabase } from '../src/lib/supabaseClient'

jest.mock('../src/lib/supabaseClient', () => {
  const actual = jest.requireActual('../src/lib/supabaseClient')
  return {
    ...actual,
    requireSupabase: jest.fn(),
  }
})

jest.mock('../src/config/featureFlags', () => ({
  ...jest.requireActual('../src/config/featureFlags'),
  ENABLE_ATOMIC_ROUTINE_UPSERT: true,
}))

const requireSupabaseMock = requireSupabase as jest.MockedFunction<typeof requireSupabase>

const ROUTINE_CLIENT_UUID = '11111111-1111-4111-8111-111111111111'
const EXERCISE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function asSupabaseClient(rpc: jest.Mock) {
  return { rpc } as unknown as ReturnType<typeof requireSupabase>
}

describe('upsertCloudRoutineWithItems (atomic path)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns error without calling RPC when items are empty', async () => {
    const rpcMock = jest.fn()
    requireSupabaseMock.mockReturnValue(asSupabaseClient(rpcMock))

    const result = await upsertCloudRoutineWithItems({
      userId: 'user-1',
      routine: {
        client_uuid: ROUTINE_CLIENT_UUID,
        name: 'Test',
        description: null,
        color: null,
        pinned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      items: [],
    })

    expect(rpcMock).not.toHaveBeenCalled()
    expect(result.data).toBeNull()
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toMatch(/at least one exercise/i)
  })

  it('calls upsert_routine_with_items_atomic RPC when flag ON and items non-empty', async () => {
    const routineRow = {
      id: '22222222-2222-4222-8222-222222222222',
      user_id: 'user-1',
      client_uuid: ROUTINE_CLIENT_UUID,
      name: 'Test',
      description: null,
      color: null,
      pinned: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const itemRow = {
      id: '33333333-3333-4333-8333-333333333333',
      routine_id: routineRow.id,
      client_uuid: '44444444-4444-4444-8444-444444444444',
      order: 0,
      exercise_id: EXERCISE_ID,
      sets: null,
      reps: null,
      rest: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const rpcMock = jest.fn(async () => ({
      data: {
        routine: routineRow,
        items: [itemRow],
        skipped_by_remote_newer: false,
      },
      error: null,
    }))
    requireSupabaseMock.mockReturnValue(asSupabaseClient(rpcMock))

    const result = await upsertCloudRoutineWithItems({
      userId: 'user-1',
      routine: {
        client_uuid: ROUTINE_CLIENT_UUID,
        name: 'Test',
        description: null,
        color: null,
        pinned: false,
        created_at: routineRow.created_at,
        updated_at: routineRow.updated_at,
      },
      items: [
        {
          client_uuid: itemRow.client_uuid,
          order: 0,
          exercise_id: EXERCISE_ID,
          sets: null,
          reps: null,
          rest: null,
          notes: null,
          created_at: itemRow.created_at,
          updated_at: itemRow.updated_at,
        },
      ],
    })

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('upsert_routine_with_items_atomic', {
      p_routine: expect.objectContaining({
        client_uuid: ROUTINE_CLIENT_UUID,
        name: 'Test',
      }),
      p_items: expect.arrayContaining([
        expect.objectContaining({
          order: 0,
          exercise_id: EXERCISE_ID,
        }),
      ]),
    })
    expect(result.error).toBeNull()
    expect(result.data).not.toBeNull()
    expect(result.data?.id).toBe(routineRow.id)
    expect(result.data?.routine_items).toHaveLength(1)
    expect(result.skippedByRemoteNewer).toBe(false)
  })

  it('maps RPC error to result.error', async () => {
    const rpcMock = jest.fn(async () => ({
      data: { error: 'routine_empty' },
      error: null,
    }))
    requireSupabaseMock.mockReturnValue(asSupabaseClient(rpcMock))

    const result = await upsertCloudRoutineWithItems({
      userId: 'user-1',
      routine: {
        client_uuid: ROUTINE_CLIENT_UUID,
        name: 'Test',
        description: null,
        color: null,
        pinned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      items: [
        {
          client_uuid: '44444444-4444-4444-8444-444444444444',
          order: 0,
          exercise_id: EXERCISE_ID,
          sets: null,
          reps: null,
          rest: null,
          notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    })

    expect(result.data).toBeNull()
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('routine_empty')
  })
})
