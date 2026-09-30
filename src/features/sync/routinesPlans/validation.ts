import { isUuid } from '../../../lib/ids'

export type QuarantinableEntityType = 'routine' | 'plan_day'

export interface QuarantinableIssue {
  entityType: QuarantinableEntityType
  entityId: string
  reason: string
}

interface RoutineRecord {
  id?: string | null
  client_uuid?: string | null
  name?: string | null
}

interface RoutineItemRecord {
  client_uuid?: string | null
  order?: number | null
  exercise_id?: string | null
}

export interface RoutinePayloadForValidation {
  routine: RoutineRecord
  items: RoutineItemRecord[]
}

export interface PlanDayPayloadForValidation {
  date: string
  routineId: string
  client_uuid: string
  weekday: number
  routine_id: string | null
  order: number
  updated_at: string
  created_at: string
}

const RECOVERABLE_DATA_ERROR_CODES = new Set([
  '22p02', // invalid_text_representation
  '22007', // invalid_datetime_format
  // 23502 (not_null_violation) is intentionally excluded: constraint errors are
  // classified via classifySyncError (CONSTRAINT code) and treated as payload
  // bugs rather than transient recoverable failures.
  '23503', // foreign_key_violation
  '23505', // unique_violation
  '23514', // check_violation
])

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }

  return String(error ?? '')
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  if (!('code' in error)) return null

  const rawCode = (error as { code?: unknown }).code
  return typeof rawCode === 'string' ? rawCode.toLowerCase() : null
}

function readErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  if (!('status' in error)) return null

  const rawStatus = (error as { status?: unknown }).status
  return typeof rawStatus === 'number' && Number.isFinite(rawStatus) ? rawStatus : null
}

export function isRecoverableRoutinesPlansError(error: unknown): boolean {
  const code = readErrorCode(error)
  if (code && RECOVERABLE_DATA_ERROR_CODES.has(code)) {
    return true
  }

  const message = readErrorMessage(error).toLowerCase()
  return (
    message.includes('violates not-null constraint') ||
    message.includes('violates foreign key constraint') ||
    message.includes('violates check constraint') ||
    message.includes('violates unique constraint') ||
    message.includes('invalid input syntax') ||
    message.includes('null value in column') ||
    message.includes('required value is missing')
  )
}

export function isFatalRoutinesPlansError(error: unknown): boolean {
  const status = readErrorStatus(error)
  if (status === 401 || status === 403) {
    return true
  }

  const code = readErrorCode(error)
  if (code === '42501') {
    return true
  }

  const message = readErrorMessage(error).toLowerCase()
  return (
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('jwt') ||
    message.includes('not authenticated') ||
    message.includes('invalid token') ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('column') && message.includes('does not exist'))
  )
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isIsoDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const parsed = new Date(`${value}T12:00:00`)
  return !Number.isNaN(parsed.getTime())
}

function isIsoTimestamp(value: string): boolean {
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime())
}

export function validateRoutinePayload(
  payload: RoutinePayloadForValidation,
): QuarantinableIssue | null {
  const routineId = hasNonEmptyString(payload.routine.client_uuid)
    ? payload.routine.client_uuid.trim()
    : hasNonEmptyString(payload.routine.id)
      ? payload.routine.id.trim()
      : 'unknown_routine'

  if (!hasNonEmptyString(payload.routine.client_uuid)) {
    return {
      entityType: 'routine',
      entityId: routineId,
      reason: 'missing_routine_client_uuid',
    }
  }

  if (!isUuid(payload.routine.client_uuid)) {
    return {
      entityType: 'routine',
      entityId: routineId,
      reason: 'invalid_routine_client_uuid',
    }
  }

  if (!hasNonEmptyString(payload.routine.name)) {
    return {
      entityType: 'routine',
      entityId: routineId,
      reason: 'missing_routine_name',
    }
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return {
      entityType: 'routine',
      entityId: routineId,
      reason: 'missing_routine_items',
    }
  }

  for (const item of payload.items) {
    if (!hasNonEmptyString(item.client_uuid)) {
      return {
        entityType: 'routine',
        entityId: routineId,
        reason: 'missing_routine_item_client_uuid',
      }
    }

    if (!isUuid(item.client_uuid)) {
      return {
        entityType: 'routine',
        entityId: routineId,
        reason: 'invalid_routine_item_client_uuid',
      }
    }

    if (!Number.isInteger(item.order) || Number(item.order) < 0) {
      return {
        entityType: 'routine',
        entityId: routineId,
        reason: 'invalid_routine_item_order',
      }
    }

    if (!hasNonEmptyString(item.exercise_id)) {
      return {
        entityType: 'routine',
        entityId: routineId,
        reason: 'missing_routine_item_exercise_id',
      }
    }

    if (!isUuid(item.exercise_id)) {
      return {
        entityType: 'routine',
        entityId: routineId,
        reason: 'invalid_routine_item_exercise_id',
      }
    }
  }

  return null
}

export function validatePlanDayPayload(
  payload: PlanDayPayloadForValidation,
): QuarantinableIssue | null {
  const entityId = hasNonEmptyString(payload.client_uuid)
    ? payload.client_uuid.trim()
    : payload.date

  if (!hasNonEmptyString(payload.date) || !isIsoDateKey(payload.date.trim())) {
    return {
      entityType: 'plan_day',
      entityId,
      reason: 'invalid_plan_date',
    }
  }

  if (!hasNonEmptyString(payload.routineId)) {
    return {
      entityType: 'plan_day',
      entityId,
      reason: 'missing_plan_routine_id',
    }
  }

  if (!hasNonEmptyString(payload.client_uuid) || !isUuid(payload.client_uuid)) {
    return {
      entityType: 'plan_day',
      entityId,
      reason: 'invalid_plan_day_client_uuid',
    }
  }

  if (!Number.isInteger(payload.weekday) || payload.weekday < 0 || payload.weekday > 6) {
    return {
      entityType: 'plan_day',
      entityId,
      reason: 'invalid_plan_weekday',
    }
  }

  if (!Number.isInteger(payload.order) || payload.order < 0) {
    return {
      entityType: 'plan_day',
      entityId,
      reason: 'invalid_plan_order',
    }
  }

  if (payload.routine_id === null || !isUuid(payload.routine_id)) {
    return {
      entityType: 'plan_day',
      entityId,
      reason: 'invalid_plan_remote_routine_id',
    }
  }

  if (!hasNonEmptyString(payload.updated_at) || !isIsoTimestamp(payload.updated_at)) {
    return {
      entityType: 'plan_day',
      entityId,
      reason: 'invalid_plan_updated_at',
    }
  }

  if (!hasNonEmptyString(payload.created_at) || !isIsoTimestamp(payload.created_at)) {
    return {
      entityType: 'plan_day',
      entityId,
      reason: 'invalid_plan_created_at',
    }
  }

  return null
}
