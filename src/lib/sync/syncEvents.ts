/**
 * Structured sync analytics events.
 * schema_version allows payload evolution; all events use allowlisted fields.
 * No PII — slugs truncated, no tokens, no user-generated free-text.
 */

import { capture } from '../../analytics/posthogClient'
import { captureException } from '../observability/crash'
import {
  classifySyncError,
  type SyncErrorClassification,
  type SyncErrorCode,
} from './syncErrorTaxonomy'
import { getEnvironment, getReleaseId } from '../observability/releaseId'

const SCHEMA_VERSION = 1

function toSafeProperties(
  props: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(props)) {
    if (
      v !== undefined &&
      (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    ) {
      out[k] = v
    }
  }
  return out
}

export function emitSyncStart(params: {
  syncId: string
  entities: string[]
  direction: 'pull' | 'push' | 'both'
  localQueueCount?: number
}): void {
  capture(
    'sync_start',
    toSafeProperties({
      schema_version: SCHEMA_VERSION,
      sync_id: params.syncId,
      env: getEnvironment(),
      release: getReleaseId(),
      started_at: new Date().toISOString(),
      entities: params.entities.join(','),
      direction: params.direction,
      local_queue_count: params.localQueueCount,
    }),
  )
}

export function emitSyncEnd(params: {
  syncId: string
  durationMs: number
  result: 'success' | 'partial' | 'failed'
  entitySuccessCount: number
  entityFailureCount: number
  retryableFailureCount: number
  lastErrorCode?: SyncErrorCode
}): void {
  capture(
    'sync_end',
    toSafeProperties({
      schema_version: SCHEMA_VERSION,
      sync_id: params.syncId,
      duration_ms: params.durationMs,
      result: params.result,
      entity_success_count: params.entitySuccessCount,
      entity_failure_count: params.entityFailureCount,
      retryable_failure_count: params.retryableFailureCount,
      last_error_code: params.lastErrorCode,
    }),
  )
}

export function emitSyncEntityFailure(params: {
  syncId: string
  entity: string
  operation: 'pull' | 'push' | 'merge' | 'upsert' | 'delete' | 'both'
  classification: SyncErrorClassification
  attempt?: number
  batchSize?: number
  durationMs?: number
}): void {
  const { classification } = params
  capture(
    'sync_entity_failure',
    toSafeProperties({
      schema_version: SCHEMA_VERSION,
      sync_id: params.syncId,
      entity: params.entity,
      operation: params.operation,
      error_code: classification.code,
      retryable: classification.retryable,
      http_status: classification.httpStatus,
      pg_code: classification.pgCode,
      constraint: classification.constraint,
      attempt: params.attempt,
      batch_size: params.batchSize,
      duration_ms: params.durationMs,
    }),
  )

  // Capture unexpected/bug-like failures to crash reporter
  if (
    classification.code === 'UNKNOWN' ||
    classification.code === 'UNKNOWN_RETRYABLE' ||
    classification.code === 'UNKNOWN_FATAL' ||
    classification.code === 'VALIDATION'
  ) {
    captureException(new Error(classification.messageSafe ?? 'Sync entity failure'), {
      sync_id: params.syncId,
      entity: params.entity,
      operation: params.operation,
      error_code: classification.code,
      retryable: String(classification.retryable),
    })
  }
}

export function classifyAndEmitEntityFailure(
  syncId: string,
  entity: string,
  operation: 'pull' | 'push' | 'merge' | 'upsert' | 'delete' | 'both',
  error: unknown,
  attempt?: number,
): SyncErrorClassification {
  const classification = classifySyncError(error)
  emitSyncEntityFailure({
    syncId,
    entity,
    operation,
    classification,
    attempt,
  })
  return classification
}
