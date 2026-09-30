import { deleteCurrentUserAccount } from '../src/db/account'
import { requireSupabase } from '../src/lib/supabaseClient'

jest.mock('../src/lib/supabaseClient', () => {
  const actual = jest.requireActual('../src/lib/supabaseClient')
  return {
    ...actual,
    requireSupabase: jest.fn(),
  }
})

const requireSupabaseMock = requireSupabase as jest.MockedFunction<typeof requireSupabase>

function asSupabaseClient(rpc: jest.Mock) {
  return { rpc } as unknown as ReturnType<typeof requireSupabase>
}

describe('account db', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('invokes delete_my_account RPC', async () => {
    const rpcMock = jest.fn(async () => ({ data: null, error: null }))
    requireSupabaseMock.mockReturnValue(asSupabaseClient(rpcMock))

    const result = await deleteCurrentUserAccount()

    expect(rpcMock).toHaveBeenCalledWith('delete_my_account')
    expect(result.error).toBeNull()
  })

  it('surfaces RPC errors', async () => {
    const rpcMock = jest.fn(async () => ({
      data: null,
      error: { message: 'permission denied' },
    }))
    requireSupabaseMock.mockReturnValue(asSupabaseClient(rpcMock))

    const result = await deleteCurrentUserAccount()

    expect(result.error?.message).toContain('permission denied')
  })
})
