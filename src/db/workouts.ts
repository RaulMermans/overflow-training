import { normalizeDbResult, requireSupabase } from '../lib/supabaseClient'
import { Database } from '../types/db'
import { sanitizeRow, sanitizeRows } from './sanitize'
import { getWorkoutStartedFallback } from './workoutTimestamps'
import type { UnitsPreference } from '../lib/profilePreferences'
import { toWeightKg } from '../lib/units'
import { generateUuid } from '../lib/ids'

export type ExerciseDefinitionRow = Database['public']['Tables']['exercise_definitions']['Row']
export type ExerciseCategory =
  | 'strength'
  | 'warmup'
  | 'stretch'
  | 'cardio'
  | 'mobility'
  | 'yoga'
  | 'pilates'
  | 'other'
export type ExerciseTrackingMode = 'weight_reps' | 'reps_only' | 'time' | 'distance_time'
export type WorkoutSetType = 'normal' | 'warmup' | 'drop' | 'failure'
export type ExerciseScope = 'system' | 'user'
export type WorkoutRow = Database['public']['Tables']['workouts']['Row']
export type WorkoutExerciseRow = Database['public']['Tables']['workout_exercises']['Row']
export type WorkoutSetRow = Database['public']['Tables']['workout_sets']['Row']
export type ExerciseDefinitionSyncIndexEntry = Pick<
  ExerciseDefinitionRow,
  'id' | 'slug' | 'name' | 'aliases'
>

export type WorkoutDetail = WorkoutRow & {
  workout_exercises: (WorkoutExerciseRow & {
    exercise_definition: Pick<
      ExerciseDefinitionRow,
      | 'id'
      | 'name'
      | 'slug'
      | 'muscle_group'
      | 'equipment'
      | 'scope'
      | 'category'
      | 'tracking_mode'
      | 'primary_targets'
      | 'secondary_targets'
    > | null
    workout_sets: WorkoutSetRow[]
  })[]
}

export interface UpsertWorkoutFromClientInput {
  id: string
  user_id: string
  client_uuid: string
  started_at: string
  created_at: string
}

export interface UpsertWorkoutExerciseFromClientInput {
  id: string
  workout_id: string
  client_uuid: string
  exercise_definition_id: string
  order_index: number
  notes: string | null
  created_at: string
}

export interface UpsertWorkoutSetFromClientInput {
  id: string
  workout_exercise_id: string
  client_uuid: string
  set_index: number
  reps?: number | null
  weight?: number | null
  weight_kg?: number | null
  duration_seconds?: number | null
  distance_m?: number | null
  is_completed?: boolean
  created_at: string
}

export interface WorkoutSetWriteInput {
  reps?: number | null
  weight?: number | null
  weight_kg?: number | null
  duration_seconds?: number | null
  distance_m?: number | null
  is_completed?: boolean
}

const mapQuery = (query: string) => `%${query.trim()}%`
const mapAliasContainsQuery = (query: string) => {
  const escaped = query.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `aliases.cs.{"${escaped}"}`
}
const exerciseDefinitionSearchSelect =
  'id, name, slug, aliases, muscle_group, equipment, exercise_type, scope, owner_user_id, category, tracking_mode, primary_targets, secondary_targets'

interface SearchExerciseDefinitionsOptions {
  target?: string
  exerciseType?: ExerciseCategory
  category?: ExerciseCategory
  scope?: 'all' | ExerciseScope
  userId?: string
  emptyQueryBehavior?: 'all' | 'none'
  limit?: number
}

interface SearchExerciseDefinitionsScopedOptions {
  target?: string | null
  exerciseType?: ExerciseCategory | null
  category?: ExerciseCategory | null
  scope?: 'all' | ExerciseScope
  userId?: string
  query?: string
  limit?: number
}

const categoryWithFocus: Record<ExerciseCategory, boolean> = {
  strength: true,
  warmup: false,
  stretch: false,
  cardio: false,
  mobility: false,
  yoga: false,
  pilates: false,
  other: false,
}

function mapSetWriteInput(
  fields: WorkoutSetWriteInput,
  units: UnitsPreference,
): Database['public']['Tables']['workout_sets']['Insert'] {
  const hasWeight = Number.isFinite(fields.weight)
  const canonicalWeight =
    Number.isFinite(fields.weight_kg) && fields.weight_kg !== null
      ? Number(fields.weight_kg)
      : hasWeight
        ? toWeightKg(Number(fields.weight), units)
        : null

  return {
    reps: fields.reps ?? null,
    weight: hasWeight ? Number(fields.weight) : null,
    weight_kg: canonicalWeight,
    duration_seconds: fields.duration_seconds ?? null,
    distance_m: fields.distance_m ?? null,
    is_weight_canonical: canonicalWeight !== null,
    is_completed: fields.is_completed,
  }
}

function hasAtLeastOneSetMetric(input: {
  reps?: number | null
  duration_seconds?: number | null
  distance_m?: number | null
}): boolean {
  return (
    (input.reps !== null && input.reps !== undefined) ||
    (input.duration_seconds !== null && input.duration_seconds !== undefined) ||
    (input.distance_m !== null && input.distance_m !== undefined)
  )
}

function shouldFallbackToMuscleGroup(error: Error | null): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return (
    message.includes('primary_targets') ||
    message.includes('category') ||
    message.includes('scope') ||
    message.includes('could not find') ||
    message.includes('operator does not exist') ||
    message.includes('malformed array literal')
  )
}

export function createWorkout(
  userId: string,
  options?: { id?: string; clientUuid?: string; startedAt?: string },
) {
  const client = requireSupabase()
  const startedAt = options?.startedAt ?? new Date().toISOString()
  const id = options?.id ?? generateUuid()
  const clientUuid = options?.clientUuid ?? generateUuid()
  const row = sanitizeRow('workouts', {
    id,
    user_id: userId,
    client_uuid: clientUuid,
    status: 'in_progress',
    started_at: startedAt,
    created_at: startedAt,
  })
  return client.from('workouts').insert(row).select('*').single()
}

export interface StartWorkoutFromRoutineResult {
  data: { workout: WorkoutRow; exercises: WorkoutExerciseRow[] } | null
  error: Error | null
}

function normalizeStartWorkoutFromRoutineErrorCode(codeOrMessage: string): string {
  const normalized = codeOrMessage.trim().toLowerCase()

  if (normalized === 'routine_not_found') {
    return 'This routine is no longer available.'
  }

  if (normalized === 'routine_empty') {
    return 'This routine has no exercises yet.'
  }

  if (normalized === 'not_authenticated') {
    return 'Your session has expired. Please sign in again.'
  }

  if (normalized === 'forbidden') {
    return 'You do not have permission to start this routine.'
  }

  return codeOrMessage
}

export async function callStartWorkoutFromRoutine(
  routineId: string,
): Promise<StartWorkoutFromRoutineResult> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('start_workout_from_routine', {
    p_routine_id: routineId,
  })

  if (error) {
    return {
      data: null,
      error: new Error(normalizeStartWorkoutFromRoutineErrorCode(error.message)),
    }
  }

  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    typeof (data as { error?: string }).error === 'string'
  ) {
    const err = (data as { error: string }).error
    return {
      data: null,
      error: new Error(normalizeStartWorkoutFromRoutineErrorCode(err)),
    }
  }

  if (data && typeof data === 'object' && 'workout' in data && 'exercises' in data) {
    const payload = data as { workout: WorkoutRow; exercises: WorkoutExerciseRow[] }
    return { data: payload, error: null }
  }

  return { data: null, error: new Error('Invalid response from start_workout_from_routine') }
}

export function addExerciseToWorkout(
  workoutId: string,
  exerciseDefinitionId: string,
  orderIndex: number,
  options?: {
    id?: string
    clientUuid?: string
    createdAt?: string
    notes?: string | null
  },
) {
  const client = requireSupabase()
  const row = sanitizeRow('workout_exercises', {
    id: options?.id ?? generateUuid(),
    workout_id: workoutId,
    client_uuid: options?.clientUuid ?? generateUuid(),
    exercise_definition_id: exerciseDefinitionId,
    order_index: orderIndex,
    notes: options?.notes ?? null,
    created_at: options?.createdAt ?? new Date().toISOString(),
  })
  return client.from('workout_exercises').insert(row).select('*').single()
}

export function addSet(
  workoutExerciseId: string,
  setIndex: number,
  fields: WorkoutSetWriteInput,
  units: UnitsPreference,
  options?: { id?: string; clientUuid?: string; createdAt?: string },
) {
  const client = requireSupabase()
  const payload = mapSetWriteInput(fields, units)
  const row = sanitizeRow('workout_sets', {
    id: options?.id ?? generateUuid(),
    workout_exercise_id: workoutExerciseId,
    client_uuid: options?.clientUuid ?? generateUuid(),
    set_index: setIndex,
    reps: payload.reps ?? null,
    weight: payload.weight ?? null,
    weight_kg: payload.weight_kg ?? null,
    duration_seconds: payload.duration_seconds ?? null,
    distance_m: payload.distance_m ?? null,
    is_weight_canonical: payload.is_weight_canonical ?? false,
    is_completed: payload.is_completed ?? true,
    created_at: options?.createdAt ?? new Date().toISOString(),
  })
  return client.from('workout_sets').insert(row).select('*').single()
}

/**
 * Create-only insert for workouts. Used by outbox create_workout to ensure
 * a late replay never overwrites a completed workout. Idempotent on (user_id, client_uuid):
 * if row exists, returns it without mutating (status, ended_at preserved).
 */
export async function insertWorkoutIfMissingFromClient(
  input: UpsertWorkoutFromClientInput,
): Promise<{ data: WorkoutRow | null; error: Error | null }> {
  const client = requireSupabase()

  const row = sanitizeRow('workouts', {
    id: input.id,
    user_id: input.user_id,
    client_uuid: input.client_uuid,
    status: 'in_progress',
    started_at: input.started_at,
    created_at: input.created_at,
  })
  const insertResponse = await client
    .from('workouts')
    .upsert(row, {
      onConflict: 'user_id,client_uuid',
      ignoreDuplicates: true,
    })
    .select('*')
    .maybeSingle()

  if (insertResponse.error) {
    return normalizeDbResult<WorkoutRow>({
      data: null,
      error: insertResponse.error,
    })
  }

  if (insertResponse.data != null) {
    return { data: insertResponse.data as WorkoutRow, error: null }
  }

  const selectResponse = await client
    .from('workouts')
    .select('*')
    .eq('user_id', input.user_id)
    .eq('client_uuid', input.client_uuid)
    .maybeSingle()

  return normalizeDbResult<WorkoutRow>({
    data: selectResponse.data as WorkoutRow | null,
    error: selectResponse.error,
  })
}

export async function upsertWorkoutFromClient(
  input: UpsertWorkoutFromClientInput,
): Promise<{ data: WorkoutRow | null; error: Error | null }> {
  const client = requireSupabase()

  const existing = await client
    .from('workouts')
    .select('*')
    .eq('user_id', input.user_id)
    .eq('client_uuid', input.client_uuid)
    .maybeSingle()

  if (existing.data != null && existing.data.status === 'completed') {
    return { data: existing.data as WorkoutRow, error: null }
  }

  const row = sanitizeRow('workouts', {
    id: input.id,
    user_id: input.user_id,
    client_uuid: input.client_uuid,
    status: 'in_progress',
    started_at: input.started_at,
    created_at: input.created_at,
  })
  const response = await client
    .from('workouts')
    .upsert(row, { onConflict: 'user_id,client_uuid' })
    .select('*')
    .single()

  return normalizeDbResult<WorkoutRow>({
    data: response.data as WorkoutRow | null,
    error: response.error,
  })
}

export async function upsertWorkoutExerciseFromClient(
  input: UpsertWorkoutExerciseFromClientInput,
): Promise<{ data: WorkoutExerciseRow | null; error: Error | null }> {
  const client = requireSupabase()
  const row = sanitizeRow('workout_exercises', {
    id: input.id,
    workout_id: input.workout_id,
    client_uuid: input.client_uuid,
    exercise_definition_id: input.exercise_definition_id,
    order_index: input.order_index,
    notes: input.notes,
    created_at: input.created_at,
  })
  const response = await client
    .from('workout_exercises')
    .upsert(row, { onConflict: 'workout_id,client_uuid' })
    .select('*')
    .single()

  return normalizeDbResult<WorkoutExerciseRow>({
    data: response.data as WorkoutExerciseRow | null,
    error: response.error,
  })
}

export async function upsertWorkoutSetFromClient(
  input: UpsertWorkoutSetFromClientInput,
): Promise<{ data: WorkoutSetRow | null; error: Error | null }> {
  if (
    !hasAtLeastOneSetMetric({
      reps: input.reps,
      duration_seconds: input.duration_seconds,
      distance_m: input.distance_m,
    })
  ) {
    return {
      data: null,
      error: new Error('Set requires reps, duration, or distance.'),
    }
  }

  const client = requireSupabase()
  const canonicalWeight =
    Number.isFinite(input.weight_kg) && input.weight_kg !== null ? Number(input.weight_kg) : null
  const hasWeight = Number.isFinite(input.weight)
  const row = sanitizeRow('workout_sets', {
    id: input.id,
    workout_exercise_id: input.workout_exercise_id,
    client_uuid: input.client_uuid,
    set_index: input.set_index,
    reps: input.reps ?? null,
    weight: hasWeight ? Number(input.weight) : null,
    weight_kg: canonicalWeight,
    duration_seconds: input.duration_seconds ?? null,
    distance_m: input.distance_m ?? null,
    is_weight_canonical: canonicalWeight !== null,
    is_completed: input.is_completed ?? true,
    created_at: input.created_at,
  })
  const response = await client
    .from('workout_sets')
    .upsert(row, { onConflict: 'workout_exercise_id,client_uuid' })
    .select('*')
    .single()

  return normalizeDbResult<WorkoutSetRow>({
    data: response.data as WorkoutSetRow | null,
    error: response.error,
  })
}

export function deleteWorkoutSet(setId: string) {
  const client = requireSupabase()
  return client.from('workout_sets').delete().eq('id', setId)
}

export function updateWorkoutSet(
  setId: string,
  fields: WorkoutSetWriteInput,
  units: UnitsPreference,
) {
  const client = requireSupabase()
  const payload = mapSetWriteInput(fields, units)
  const row = sanitizeRow('workout_sets', {
    reps: payload.reps ?? null,
    weight: payload.weight ?? null,
    weight_kg: payload.weight_kg ?? null,
    duration_seconds: payload.duration_seconds ?? null,
    distance_m: payload.distance_m ?? null,
    is_weight_canonical: payload.is_weight_canonical ?? false,
    is_completed: payload.is_completed,
  })
  return client.from('workout_sets').update(row).eq('id', setId).select('*').single()
}

export function deleteWorkoutExercise(workoutExerciseId: string) {
  const client = requireSupabase()
  return client.from('workout_exercises').delete().eq('id', workoutExerciseId)
}

export function deleteWorkout(workoutId: string) {
  const client = requireSupabase()
  return client.from('workouts').delete().eq('id', workoutId)
}

export function finishWorkout(workoutId: string) {
  return finishWorkoutAt(workoutId, new Date().toISOString())
}

/**
 * Finish a workout. Progress integrity: always sets status + ended_at together.
 * Never finish with only one of these — both are required for analytics to count the workout.
 */
export function finishWorkoutAt(workoutId: string, endedAt: string) {
  const client = requireSupabase()
  const row = sanitizeRow('workouts', { status: 'completed', ended_at: endedAt })
  return client.from('workouts').update(row).eq('id', workoutId).select('*').single()
}

export function finishWorkoutWithMeta(
  workoutId: string,
  input: {
    notes?: string | null
    effort_rating?: number | null
    session_note?: string | null
  },
) {
  return finishWorkoutWithMetaAt(workoutId, {
    endedAt: new Date().toISOString(),
    ...input,
  })
}

/**
 * Finish a workout with optional meta. Progress integrity: always sets status + ended_at together.
 */
export function finishWorkoutWithMetaAt(
  workoutId: string,
  input: {
    endedAt: string
    notes?: string | null
    effort_rating?: number | null
    session_note?: string | null
  },
) {
  const client = requireSupabase()
  const payload: Record<string, unknown> = {
    status: 'completed',
    ended_at: input.endedAt,
  }
  if (input.notes !== undefined) payload.notes = input.notes
  if (input.effort_rating !== undefined) payload.effort_rating = input.effort_rating
  if (input.session_note !== undefined) payload.session_note = input.session_note

  const row = sanitizeRow('workouts', payload)
  return client.from('workouts').update(row).eq('id', workoutId).select('*').single()
}

export async function fetchWorkouts() {
  const client = requireSupabase()
  const response = await client
    .from('workouts')
    .select(
      'id, user_id, client_uuid, started_at, ended_at, status, notes, effort_rating, session_note, created_at',
    )
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .order('created_at', { ascending: false })

  const normalized = normalizeDbResult<WorkoutRow[]>({
    data: response.data
      ? (response.data.map((workout) => ({
          ...workout,
          started_at: getWorkoutStartedFallback(workout),
        })) as WorkoutRow[])
      : null,
    error: response.error,
  })

  return {
    ...response,
    ...normalized,
  }
}

export async function fetchInProgressWorkout(userId: string) {
  const client = requireSupabase()
  const response = await client
    .from('workouts')
    .select('id, status, user_id, client_uuid, started_at, created_at, ended_at')
    .eq('status', 'in_progress')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const normalized = normalizeDbResult<WorkoutRow>({
    data: response.data
      ? ({
          ...response.data,
          started_at: getWorkoutStartedFallback(response.data),
        } as WorkoutRow)
      : null,
    error: response.error,
  })

  return {
    ...response,
    ...normalized,
  }
}

export async function fetchWorkoutDetail(workoutId: string) {
  const client = requireSupabase()
  const response = await client
    .from('workouts')
    .select(
      `
      id,
      user_id,
      client_uuid,
      started_at,
      ended_at,
      status,
      notes,
      effort_rating,
      session_note,
      created_at,
      workout_exercises (
        id,
        workout_id,
        client_uuid,
        exercise_definition_id,
        order_index,
        notes,
        created_at,
        exercise_definition:exercise_definition_id (
          id,
          name,
          slug,
          muscle_group,
          equipment,
          scope,
          category,
          tracking_mode,
          primary_targets,
          secondary_targets
        ),
        workout_sets (
          id,
          workout_exercise_id,
          client_uuid,
          set_index,
          reps,
          weight,
          weight_kg,
          duration_seconds,
          distance_m,
          is_weight_canonical,
          is_completed,
          created_at
        )
      )
    `,
    )
    .eq('id', workoutId)
    .single()

  if (!response.data) {
    const normalized = normalizeDbResult<WorkoutDetail>({
      data: null,
      error: response.error,
    })

    return {
      ...response,
      ...normalized,
    }
  }

  const raw = response.data as unknown as WorkoutDetail

  const normalized = normalizeDbResult<WorkoutDetail>({
    data: {
      ...raw,
      started_at: getWorkoutStartedFallback(raw),
    } as WorkoutDetail,
    error: response.error,
  })

  return {
    ...response,
    ...normalized,
  }
}

export async function fetchLastCompletedExerciseSummary(
  exerciseDefinitionId: string,
  excludeWorkoutId?: string,
  userId?: string,
): Promise<{ data: string | null; error: Error | null }> {
  const response = await fetchLastExercisePerformance(
    userId ?? '',
    exerciseDefinitionId,
    excludeWorkoutId,
  )

  if (response.error || !response.data) {
    return { data: null, error: response.error }
  }

  const topSets = response.data.sets.slice(0, 3)
  if (topSets.length === 0) {
    return { data: null, error: null }
  }

  return {
    data: `Last time: ${topSets.map((set) => `${set.weight}×${set.reps}`).join(', ')}`,
    error: null,
  }
}

export type LastExercisePerformance = {
  workoutId: string
  performedAt: string | null
  sets: {
    reps: number
    weight: number
    weight_kg: number
    is_weight_canonical: boolean
    setIndex: number
  }[]
}

type LastExercisePerformanceRow =
  Database['public']['Functions']['get_last_exercise_performance']['Returns'][number]

export async function fetchLastExercisePerformance(
  _userId: string,
  exerciseDefinitionId: string,
  excludeWorkoutId?: string,
): Promise<{ data: LastExercisePerformance | null; error: Error | null }> {
  if (!exerciseDefinitionId) {
    return { data: null, error: null }
  }

  const client = requireSupabase()
  const rpcResponse = await client.rpc('get_last_exercise_performance', {
    target_exercise_definition_id: exerciseDefinitionId,
    exclude_workout_id: excludeWorkoutId ?? null,
  })

  const normalizedRpcResult = normalizeDbResult<LastExercisePerformanceRow[]>({
    data: (rpcResponse.data ?? []) as LastExercisePerformanceRow[],
    error: rpcResponse.error,
  })

  if (normalizedRpcResult.error) {
    return { data: null, error: normalizedRpcResult.error }
  }

  const rows = normalizedRpcResult.data ?? []
  if (rows.length === 0) {
    return { data: null, error: null }
  }

  const [firstRow] = rows
  return {
    data: {
      workoutId: firstRow.workout_id,
      performedAt: firstRow.performed_at ?? null,
      sets: rows.map((row) => ({
        reps: row.reps,
        weight: Number(row.weight),
        weight_kg: Number(row.weight_kg),
        is_weight_canonical: Boolean(row.is_weight_canonical),
        setIndex: row.set_index,
      })),
    },
    error: null,
  }
}

export function updateWorkoutExerciseNotes(workoutExerciseId: string, notes: string | null) {
  const client = requireSupabase()
  const row = sanitizeRow('workout_exercises', { notes })
  return client
    .from('workout_exercises')
    .update(row)
    .eq('id', workoutExerciseId)
    .select('*')
    .single()
}

export interface UpdateWorkoutSessionDateInput {
  workoutId: string
  newDateISO: string
  currentStartedAt: string | null | undefined
  currentEndedAt: string | null | undefined
}

/**
 * Updates workout session date, preserving duration when both started_at and ended_at exist.
 * Used when the user edits the displayed session date (e.g. via workout detail screen).
 */
export async function updateWorkoutSessionDate(
  input: UpdateWorkoutSessionDateInput,
): Promise<{ data: WorkoutRow | null; error: Error | null }> {
  const { workoutId, newDateISO, currentStartedAt, currentEndedAt } = input
  const client = requireSupabase()

  let startedAt: string
  let endedAt: string

  const startMs = currentStartedAt ? Date.parse(currentStartedAt) : NaN
  const endMs = currentEndedAt ? Date.parse(currentEndedAt) : NaN

  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
    const durationMs = endMs - startMs
    startedAt = newDateISO
    endedAt = new Date(Date.parse(newDateISO) + durationMs).toISOString()
  } else {
    startedAt = newDateISO
    endedAt = newDateISO
  }

  const row = sanitizeRow('workouts', { started_at: startedAt, ended_at: endedAt })
  const response = await client
    .from('workouts')
    .update(row)
    .eq('id', workoutId)
    .select('*')
    .single()

  return normalizeDbResult<WorkoutRow>({
    data: response.data as WorkoutRow | null,
    error: response.error,
  })
}

export async function copyWorkoutExerciseDefinitions(
  sourceWorkoutId: string,
  targetWorkoutId: string,
) {
  const client = requireSupabase()
  const sourceResponse = await client
    .from('workout_exercises')
    .select('exercise_definition_id, order_index')
    .eq('workout_id', sourceWorkoutId)
    .order('order_index', { ascending: true })

  const normalizedSource = normalizeDbResult<
    { exercise_definition_id: string; order_index: number }[]
  >({
    data: sourceResponse.data,
    error: sourceResponse.error,
  })

  if (normalizedSource.error || !normalizedSource.data) {
    return { data: null, error: normalizedSource.error }
  }

  if (normalizedSource.data.length === 0) {
    return { data: [], error: null }
  }

  const rows = sanitizeRows(
    'workout_exercises',
    normalizedSource.data.map((exercise) => ({
      workout_id: targetWorkoutId,
      exercise_definition_id: exercise.exercise_definition_id,
      order_index: exercise.order_index,
    })),
  )
  const insertResponse = await client.from('workout_exercises').insert(rows).select('*')

  const normalizedInsert = normalizeDbResult<WorkoutExerciseRow[]>({
    data: (insertResponse.data ?? null) as WorkoutExerciseRow[] | null,
    error: insertResponse.error,
  })

  return {
    ...insertResponse,
    ...normalizedInsert,
  }
}

/**
 * Inserts workout exercises from a list of definition IDs and order indices.
 * Used when copying from projection (source not on server yet).
 */
export async function insertWorkoutExerciseDefinitions(
  targetWorkoutId: string,
  items: { exercise_definition_id: string; order_index: number }[],
) {
  if (items.length === 0) {
    return { data: [], error: null }
  }

  const client = requireSupabase()
  const rows = sanitizeRows(
    'workout_exercises',
    items.map((exercise) => ({
      workout_id: targetWorkoutId,
      exercise_definition_id: exercise.exercise_definition_id,
      order_index: exercise.order_index,
    })),
  )
  const insertResponse = await client.from('workout_exercises').insert(rows).select('*')

  const normalizedInsert = normalizeDbResult<WorkoutExerciseRow[]>({
    data: (insertResponse.data ?? null) as WorkoutExerciseRow[] | null,
    error: insertResponse.error,
  })

  return {
    ...insertResponse,
    ...normalizedInsert,
  }
}

export function searchExerciseDefinitions(query: string, opts?: SearchExerciseDefinitionsOptions) {
  const trimmed = query.trim()
  const target = opts?.target?.trim().toLowerCase() ?? ''
  const hasTarget = target.length > 0
  const category = opts?.category ?? opts?.exerciseType ?? null
  const hasCategory = Boolean(category)
  const requiresFocus = category ? categoryWithFocus[category] : false
  const emptyQueryBehavior = opts?.emptyQueryBehavior ?? 'all'
  const maxLimit = trimmed ? 100 : 300
  const requestedLimit = opts?.limit ?? maxLimit
  const safeLimit = Math.max(1, Math.min(requestedLimit, maxLimit))
  const client = requireSupabase()

  if (!trimmed && emptyQueryBehavior === 'none' && !hasTarget && !hasCategory) {
    return Promise.resolve({ data: [] as ExerciseDefinitionRow[], error: null })
  }

  if (!trimmed && requiresFocus && !hasTarget) {
    return Promise.resolve({ data: [] as ExerciseDefinitionRow[], error: null })
  }

  let request = client.from('exercise_definitions').select(exerciseDefinitionSearchSelect)

  if (category) {
    request = request.eq('category', category)
  }

  if (hasTarget) {
    request = request.contains('primary_targets', [target])
  }

  if (opts?.scope && opts.scope !== 'all') {
    request = request.eq('scope', opts.scope)
    if (opts.scope === 'user' && opts.userId) {
      request = request.eq('owner_user_id', opts.userId)
    }
  }

  if (trimmed) {
    request = request.or(
      `name.ilike.${mapQuery(trimmed)},slug.ilike.${mapQuery(trimmed)},${mapAliasContainsQuery(trimmed)}`,
    )
  }

  return request.order('name', { ascending: true }).range(0, safeLimit - 1)
}

export async function searchExerciseDefinitionsScoped(
  opts: SearchExerciseDefinitionsScopedOptions,
): Promise<{ data: ExerciseDefinitionRow[]; error: Error | null }> {
  const target = opts.target?.trim().toLowerCase() ?? ''
  const category = opts.category ?? opts.exerciseType ?? null
  const trimmed = opts.query?.trim() ?? ''

  if (!category) {
    return { data: [], error: null }
  }

  const requiresFocus = categoryWithFocus[category]
  if (!trimmed && requiresFocus && target.length === 0) {
    return { data: [], error: null }
  }

  const requestedLimit = opts.limit ?? 100
  const safeLimit = Math.max(1, Math.min(requestedLimit, 100))
  const client = requireSupabase()

  let structuredRequest = client
    .from('exercise_definitions')
    .select(exerciseDefinitionSearchSelect)
    .eq('category', category)

  if (target.length > 0) {
    structuredRequest = structuredRequest.contains('primary_targets', [target])
  }

  if (opts.scope && opts.scope !== 'all') {
    structuredRequest = structuredRequest.eq('scope', opts.scope)
    if (opts.scope === 'user' && opts.userId) {
      structuredRequest = structuredRequest.eq('owner_user_id', opts.userId)
    }
  }

  if (trimmed) {
    structuredRequest = structuredRequest.or(
      `name.ilike.${mapQuery(trimmed)},slug.ilike.${mapQuery(trimmed)},${mapAliasContainsQuery(trimmed)}`,
    )
  }

  const structuredResponse = await structuredRequest
    .order('name', { ascending: true })
    .range(0, safeLimit - 1)

  const structured = normalizeDbResult<ExerciseDefinitionRow[]>({
    data: (structuredResponse.data ?? []) as ExerciseDefinitionRow[],
    error: structuredResponse.error,
  })

  if (!structured.error) {
    return {
      data: structured.data ?? [],
      error: null,
    }
  }

  if (!shouldFallbackToMuscleGroup(structured.error)) {
    return {
      data: [],
      error: structured.error,
    }
  }

  let fallbackRequest = client.from('exercise_definitions').select(exerciseDefinitionSearchSelect)

  fallbackRequest = fallbackRequest.eq('category', category)

  if (target.length > 0) {
    fallbackRequest = fallbackRequest.ilike('muscle_group', mapQuery(target))
  }

  if (opts.scope && opts.scope !== 'all') {
    fallbackRequest = fallbackRequest.eq('scope', opts.scope)
    if (opts.scope === 'user' && opts.userId) {
      fallbackRequest = fallbackRequest.eq('owner_user_id', opts.userId)
    }
  }

  if (trimmed) {
    fallbackRequest = fallbackRequest.or(
      `name.ilike.${mapQuery(trimmed)},slug.ilike.${mapQuery(trimmed)},${mapAliasContainsQuery(trimmed)}`,
    )
  }

  const fallbackResponse = await fallbackRequest
    .order('name', { ascending: true })
    .range(0, safeLimit - 1)

  const fallback = normalizeDbResult<ExerciseDefinitionRow[]>({
    data: (fallbackResponse.data ?? []) as ExerciseDefinitionRow[],
    error: fallbackResponse.error,
  })

  return {
    data: fallback.data ?? [],
    error: fallback.error,
  }
}

export async function fetchExerciseDefinitionsByIds(ids: string[]) {
  const exerciseIds = Array.from(new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)))

  if (exerciseIds.length === 0) {
    return { data: [] as ExerciseDefinitionRow[], error: null }
  }

  const client = requireSupabase()
  const response = await client
    .from('exercise_definitions')
    .select(exerciseDefinitionSearchSelect)
    .in('id', exerciseIds)
    .order('name', { ascending: true })

  const normalized = normalizeDbResult<ExerciseDefinitionRow[]>({
    data: (response.data ?? []) as ExerciseDefinitionRow[],
    error: response.error,
  })

  return {
    ...response,
    ...normalized,
  }
}

export async function fetchExerciseDefinitionsBySlugs(slugs: string[]) {
  const exerciseSlugs = Array.from(
    new Set(slugs.map((slug) => slug.trim()).filter((slug) => slug.length > 0)),
  )

  if (exerciseSlugs.length === 0) {
    return { data: [] as ExerciseDefinitionRow[], error: null }
  }

  const client = requireSupabase()
  const response = await client
    .from('exercise_definitions')
    .select(exerciseDefinitionSearchSelect)
    .in('slug', exerciseSlugs)
    .order('name', { ascending: true })

  const normalized = normalizeDbResult<ExerciseDefinitionRow[]>({
    data: (response.data ?? []) as ExerciseDefinitionRow[],
    error: response.error,
  })

  return {
    ...response,
    ...normalized,
  }
}

export async function fetchExerciseDefinitionSyncIndex(
  pageSize = 500,
): Promise<{ data: ExerciseDefinitionSyncIndexEntry[]; error: Error | null }> {
  const safePageSize = Math.max(100, Math.min(pageSize, 1000))
  const client = requireSupabase()
  const rows: ExerciseDefinitionSyncIndexEntry[] = []
  let from = 0

  while (true) {
    const to = from + safePageSize - 1
    const response = await client
      .from('exercise_definitions')
      .select('id, slug, name, aliases')
      .order('name', { ascending: true })
      .range(from, to)

    const normalized = normalizeDbResult<ExerciseDefinitionSyncIndexEntry[]>({
      data: (response.data ?? []) as ExerciseDefinitionSyncIndexEntry[],
      error: response.error,
    })

    if (normalized.error) {
      return {
        data: [],
        error: normalized.error,
      }
    }

    const page = normalized.data ?? []
    rows.push(...page)

    if (page.length < safePageSize) {
      break
    }
    from += safePageSize
  }

  return {
    data: rows,
    error: null,
  }
}

export async function fetchCompletedWorkoutDates(sinceISO: string) {
  const client = requireSupabase()
  const response = await client
    .from('workouts')
    .select('id, user_id, client_uuid, started_at, ended_at, created_at')
    .eq('status', 'completed')
    .gte('started_at', sinceISO)
    .order('started_at', { ascending: false })
    .order('created_at', { ascending: false })

  const normalized = normalizeDbResult<WorkoutRow[]>({
    data: response.data
      ? (response.data.map((workout) => ({
          ...workout,
          started_at: getWorkoutStartedFallback(workout),
        })) as WorkoutRow[])
      : null,
    error: response.error,
  })

  return {
    ...response,
    ...normalized,
  }
}

export async function fetchCompletedWorkoutsByRange(fromISO: string, toISO: string) {
  const client = requireSupabase()
  const response = await client
    .from('workouts')
    .select(
      'id, user_id, client_uuid, started_at, ended_at, status, notes, effort_rating, session_note, created_at',
    )
    .eq('status', 'completed')
    .gte('started_at', fromISO)
    .lte('started_at', toISO)
    .order('started_at', { ascending: false })
    .order('created_at', { ascending: false })

  const normalized = normalizeDbResult<WorkoutRow[]>({
    data: response.data
      ? (response.data.map((workout) => ({
          ...workout,
          started_at: getWorkoutStartedFallback(workout),
        })) as WorkoutRow[])
      : null,
    error: response.error,
  })

  return {
    ...response,
    ...normalized,
  }
}
