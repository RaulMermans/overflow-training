import { normalizeDbResult, requireSupabase } from '../lib/supabaseClient'
import { withTimeout } from '../lib/withTimeout'

export async function deleteCurrentUserAccount(): Promise<{ error: Error | null }> {
  const client = requireSupabase()
  const response = await withTimeout(client.rpc('delete_my_account'), 12_000)

  const normalized = normalizeDbResult<null>({
    data: null,
    error: response.error,
  })

  return {
    error: normalized.error,
  }
}
