import { normalizeDbResult, requireSupabase } from '../lib/supabaseClient'
import { ENABLE_ATOMIC_ROUTINE_UPSERT } from '../config/featureFlags'
import { sanitizeRow, sanitizeRows } from './sanitize'
import type { Database } from '../types/db'

export type CloudRoutineRow = Database['public']['Tables']['routines']['Row']
export type CloudRoutineItemRow = Database['public']['Tables']['routine_items']['Row']

export type CloudRoutineWithItems = CloudRoutineRow & {
  routine_items: CloudRoutineItemRow[]
}

function toIso(value: string | null | undefined): string {
  if (!value) return new Date(0).toISOString()
  return value
}

export async function fetchCloudRoutinesWithItems(userId: string): Promise<{
  data: CloudRoutineWithItems[] | null
  error: Error | null
}> {
  if (!userId) return { data: [], error: null }

  const client = requireSupabase()
  const response = await client
    .from('routines')
    .select(
      `
      id,
      user_id,
      client_uuid,
      name,
      description,
      color,
      pinned,
      deleted_at,
      created_at,
      updated_at,
      routine_items (
        id,
        routine_id,
        client_uuid,
        order,
        exercise_id,
        sets,
        reps,
        rest,
        notes,
        created_at,
        updated_at
      )
    `,
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  const normalized = normalizeDbResult<CloudRoutineWithItems[]>({
    data: (response.data as unknown as CloudRoutineWithItems[] | null) ?? [],
    error: response.error,
  })

  return {
    ...normalized,
    data: normalized.data ?? [],
  }
}

export async function upsertCloudRoutineWithItems(input: {
  userId: string
  routine: Omit<CloudRoutineRow, 'id' | 'user_id'> & { id?: string | null }
  items: Array<Omit<CloudRoutineItemRow, 'id' | 'routine_id'> & { id?: string | null }>
}): Promise<{
  data: CloudRoutineWithItems | null
  error: Error | null
  skippedByRemoteNewer?: boolean
}> {
  const { userId, routine, items } = input
  if (!userId) return { data: null, error: new Error('Missing user id.') }

  if (ENABLE_ATOMIC_ROUTINE_UPSERT) {
    if (items.length === 0) {
      return { data: null, error: new Error('Routine must have at least one exercise.') }
    }
    const client = requireSupabase()
    const p_routine = {
      id: routine.id ?? null,
      client_uuid: routine.client_uuid,
      name: routine.name,
      description: routine.description ?? null,
      color: routine.color ?? null,
      pinned: routine.pinned ?? false,
      created_at: routine.created_at ?? new Date().toISOString(),
      updated_at: routine.updated_at ?? new Date().toISOString(),
    }
    const p_items = [...items]
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({
        client_uuid: item.client_uuid,
        order: index,
        exercise_id: item.exercise_id,
        sets: item.sets ?? null,
        reps: item.reps ?? null,
        rest: item.rest ?? null,
        notes: item.notes ?? null,
        created_at: item.created_at ?? new Date().toISOString(),
        updated_at: item.updated_at ?? new Date().toISOString(),
      }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpcResponse = await (client.rpc as any)('upsert_routine_with_items_atomic', {
      p_routine,
      p_items,
    })
    if (rpcResponse.error) {
      const normalized = normalizeDbResult<unknown>({ data: null, error: rpcResponse.error })
      return { data: null, error: normalized.error }
    }
    const result = rpcResponse.data as {
      error?: string
      routine?: CloudRoutineRow
      items?: CloudRoutineItemRow[]
      skipped_by_remote_newer?: boolean
    } | null
    if (result?.error) {
      return { data: null, error: new Error(result.error) }
    }
    if (result?.routine && Array.isArray(result.items)) {
      const data: CloudRoutineWithItems = {
        ...result.routine,
        routine_items: result.items,
      }
      return {
        data,
        error: null,
        skippedByRemoteNewer: result.skipped_by_remote_newer ?? false,
      }
    }
    const latest = await fetchCloudRoutineByClientUuid(userId, routine.client_uuid)
    return {
      data: latest.data,
      error: latest.error,
      skippedByRemoteNewer: result?.skipped_by_remote_newer ?? false,
    }
  }

  const client = requireSupabase()
  const existingResponse = await client
    .from('routines')
    .select('id, updated_at')
    .eq('user_id', userId)
    .eq('client_uuid', routine.client_uuid)
    .maybeSingle()

  if (existingResponse.error) {
    const normalizedExistingError = normalizeDbResult<CloudRoutineRow>({
      data: null,
      error: existingResponse.error,
    })
    return { data: null, error: normalizedExistingError.error }
  }

  const existingUpdatedAt = toIso(existingResponse.data?.updated_at)
  const incomingUpdatedAt = toIso(routine.updated_at)

  if (existingResponse.data && existingUpdatedAt > incomingUpdatedAt) {
    const latest = await fetchCloudRoutineByClientUuid(userId, routine.client_uuid)
    return { data: latest.data, error: latest.error, skippedByRemoteNewer: true }
  }

  const routineRow = sanitizeRow('routines', {
    id: routine.id ?? undefined,
    user_id: userId,
    client_uuid: routine.client_uuid,
    name: routine.name,
    description: routine.description ?? null,
    color: routine.color ?? null,
    pinned: routine.pinned ?? false,
    created_at: routine.created_at ?? new Date().toISOString(),
    updated_at: routine.updated_at ?? new Date().toISOString(),
  })
  const routineResponse = await client
    .from('routines')
    .upsert(routineRow, { onConflict: 'user_id,client_uuid' })
    .select('*')
    .single()

  const normalizedRoutine = normalizeDbResult<CloudRoutineRow>({
    data: routineResponse.data as CloudRoutineRow | null,
    error: routineResponse.error,
  })

  if (normalizedRoutine.error || !normalizedRoutine.data) {
    return { data: null, error: normalizedRoutine.error }
  }

  const routineId = normalizedRoutine.data.id

  const deleteResponse = await client.from('routine_items').delete().eq('routine_id', routineId)
  if (deleteResponse.error) {
    const normalizedDelete = normalizeDbResult<CloudRoutineItemRow[]>({
      data: null,
      error: deleteResponse.error,
    })
    return { data: null, error: normalizedDelete.error }
  }

  const nextItems = [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      id: item.id ?? undefined,
      routine_id: routineId,
      client_uuid: item.client_uuid,
      order: index,
      exercise_id: item.exercise_id,
      sets: item.sets ?? null,
      reps: item.reps ?? null,
      rest: item.rest ?? null,
      notes: item.notes ?? null,
      created_at: item.created_at ?? new Date().toISOString(),
      updated_at: item.updated_at ?? new Date().toISOString(),
    }))

  if (nextItems.length > 0) {
    const rows = sanitizeRows('routine_items', nextItems)
    const insertItemsResponse = await client.from('routine_items').insert(rows).select('*')

    const normalizedItems = normalizeDbResult<CloudRoutineItemRow[]>({
      data: insertItemsResponse.data as CloudRoutineItemRow[] | null,
      error: insertItemsResponse.error,
    })

    if (normalizedItems.error) {
      return { data: null, error: normalizedItems.error }
    }
  }

  const latest = await fetchCloudRoutineByClientUuid(userId, routine.client_uuid)
  return {
    data: latest.data,
    error: latest.error,
  }
}

export async function fetchCloudRoutineByClientUuid(
  userId: string,
  clientUuid: string,
): Promise<{ data: CloudRoutineWithItems | null; error: Error | null }> {
  const client = requireSupabase()
  const response = await client
    .from('routines')
    .select(
      `
      id,
      user_id,
      client_uuid,
      name,
      description,
      color,
      pinned,
      created_at,
      updated_at,
      routine_items (
        id,
        routine_id,
        client_uuid,
        order,
        exercise_id,
        sets,
        reps,
        rest,
        notes,
        created_at,
        updated_at
      )
    `,
    )
    .eq('user_id', userId)
    .eq('client_uuid', clientUuid)
    .maybeSingle()

  const normalized = normalizeDbResult<CloudRoutineWithItems>({
    data: response.data as unknown as CloudRoutineWithItems | null,
    error: response.error,
  })

  return normalized
}

export async function deleteCloudRoutine(input: {
  userId: string
  routineId: string
}): Promise<{ error: Error | null }> {
  const { userId, routineId } = input
  if (!userId) return { error: new Error('Missing user id.') }
  if (!routineId.trim()) return { error: new Error('Missing routine id.') }

  const client = requireSupabase()
  const lookupResponse = await client
    .from('routines')
    .select('id')
    .eq('user_id', userId)
    .eq('client_uuid', routineId.trim())
    .maybeSingle()

  const normalizedLookup = normalizeDbResult<{ id: string }>({
    data: (lookupResponse.data as { id: string } | null) ?? null,
    error: lookupResponse.error,
  })

  if (normalizedLookup.error) {
    return { error: normalizedLookup.error }
  }

  const remoteRoutineId = normalizedLookup.data?.id?.trim() ?? ''
  if (!remoteRoutineId) {
    // Routine not in cloud — nothing to delete remotely.
    return { error: null }
  }

  // Clean up dependent scheduled_routines first (FK is ON DELETE RESTRICT).
  const deleteScheduledResponse = await client
    .from('scheduled_routines')
    .delete()
    .eq('user_id', userId)
    .eq('routine_id', remoteRoutineId)

  const normalizedScheduledDelete = normalizeDbResult<null>({
    data: null,
    error: deleteScheduledResponse.error,
  })

  if (normalizedScheduledDelete.error) {
    return { error: normalizedScheduledDelete.error }
  }

  // Soft-delete: set deleted_at instead of hard deleting.
  // This preserves referential integrity with historical workout data
  // and prevents resurrection via sync re-merge.
  const softDeleteResponse = await client
    .from('routines')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', remoteRoutineId)

  const normalizedSoftDelete = normalizeDbResult<null>({
    data: null,
    error: softDeleteResponse.error,
  })

  return { error: normalizedSoftDelete.error }
}

export interface RpcWhoamiResult {
  uid: string | null
  role: string | null
}

export async function callRpcWhoami(): Promise<{
  data: RpcWhoamiResult | null
  error: Error | null
}> {
  const client = requireSupabase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client.rpc as any)('rpc_whoami')
  return normalizeDbResult<RpcWhoamiResult>({
    data: response.data as RpcWhoamiResult | null,
    error: response.error,
  })
}

export interface RpcUserLastChangedResult {
  uid: string | null
  execution_last_changed: string | null
  planning_last_changed: string | null
}

export async function callRpcUserLastChanged(): Promise<{
  data: RpcUserLastChangedResult | null
  error: Error | null
}> {
  const client = requireSupabase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client.rpc as any)('rpc_user_last_changed')
  return normalizeDbResult<RpcUserLastChangedResult>({
    data: response.data as RpcUserLastChangedResult | null,
    error: response.error,
  })
}
