import type { Database } from '../types/db'
import { normalizeDbResult, requireSupabase } from '../lib/supabaseClient'
import { withTimeout } from '../lib/withTimeout'

type CheckinPhotoRow = Database['public']['Tables']['checkin_photos']['Row']
type CheckinPhotoInsert = Database['public']['Tables']['checkin_photos']['Insert']

const CHECKIN_PHOTOS_TIMEOUT_MS = 5000

export type CheckinPhotoUpsertPayload = Omit<
  CheckinPhotoInsert,
  'user_id' | 'created_at' | 'updated_at'
>

export async function listCheckinPhotoMeta(
  userId: string,
): Promise<{ data: CheckinPhotoRow[] | null; error: Error | null }> {
  if (!userId) {
    return { data: [], error: null }
  }

  try {
    const client = requireSupabase()
    const response = await withTimeout(
      client
        .from('checkin_photos')
        .select('*')
        .eq('user_id', userId)
        .order('taken_at', { ascending: false }),
      CHECKIN_PHOTOS_TIMEOUT_MS,
    )

    return normalizeDbResult<CheckinPhotoRow[]>({
      data: (response.data as CheckinPhotoRow[] | null) ?? [],
      error: response.error,
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Failed to list check-in photos.'),
    }
  }
}

export async function upsertCheckinPhotoMeta(
  userId: string,
  payload: CheckinPhotoUpsertPayload,
): Promise<{ data: CheckinPhotoRow | null; error: Error | null }> {
  if (!userId) {
    return { data: null, error: new Error('Missing user id.') }
  }

  try {
    const client = requireSupabase()
    const response = await withTimeout(
      client
        .from('checkin_photos')
        .upsert(
          {
            ...payload,
            user_id: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'checkin_id' },
        )
        .select('*')
        .maybeSingle(),
      CHECKIN_PHOTOS_TIMEOUT_MS,
    )

    return normalizeDbResult<CheckinPhotoRow>({
      data: (response.data as CheckinPhotoRow | null) ?? null,
      error: response.error,
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Failed to save check-in photo metadata.'),
    }
  }
}
