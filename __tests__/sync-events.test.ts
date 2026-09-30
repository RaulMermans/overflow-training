/**
 * Lightweight test for sync instrumentation.
 * Ensures sync_start, sync_end, sync_entity_failure are emitted with correct payload shapes.
 */

import { SyncErrorCode, classifySyncError } from '../src/lib/sync/syncErrorTaxonomy'
import { emitSyncEnd, emitSyncEntityFailure, emitSyncStart } from '../src/lib/sync/syncEvents'

type SyncCaptureProps = Record<string, string | number | boolean>

const mockCapture = jest.fn()
jest.mock('../src/analytics/posthogClient', () => ({
  capture: (event: string, props?: SyncCaptureProps) => {
    mockCapture(event, props)
  },
}))

jest.mock('../src/lib/observability/crash', () => ({
  captureException: jest.fn(),
}))

jest.mock('../src/lib/observability/releaseId', () => ({
  getReleaseId: () => '1.0.0-dev',
  getEnvironment: () => 'development',
}))

describe('sync events', () => {
  beforeEach(() => {
    mockCapture.mockClear()
  })

  it('emitSyncStart sends schema_version, sync_id, entities, direction', () => {
    emitSyncStart({
      syncId: 'test-sync-id',
      entities: ['routines_plans', 'workouts'],
      direction: 'both',
      localQueueCount: 3,
    })

    expect(mockCapture).toHaveBeenCalledWith('sync_start', expect.any(Object))
    const props = mockCapture.mock.calls[0][1] as SyncCaptureProps
    expect(props.schema_version).toBe(1)
    expect(props.sync_id).toBe('test-sync-id')
    expect(props.entities).toBe('routines_plans,workouts')
    expect(props.direction).toBe('both')
    expect(props.local_queue_count).toBe(3)
  })

  it('emitSyncEnd sends schema_version, result, counts, last_error_code', () => {
    emitSyncEnd({
      syncId: 'test-sync-id',
      durationMs: 150,
      result: 'failed',
      entitySuccessCount: 0,
      entityFailureCount: 1,
      retryableFailureCount: 1,
      lastErrorCode: SyncErrorCode.NETWORK,
    })

    expect(mockCapture).toHaveBeenCalledWith('sync_end', expect.any(Object))
    const props = mockCapture.mock.calls[0][1] as SyncCaptureProps
    expect(props.schema_version).toBe(1)
    expect(props.sync_id).toBe('test-sync-id')
    expect(props.duration_ms).toBe(150)
    expect(props.result).toBe('failed')
    expect(props.entity_success_count).toBe(0)
    expect(props.entity_failure_count).toBe(1)
    expect(props.retryable_failure_count).toBe(1)
    expect(props.last_error_code).toBe(SyncErrorCode.NETWORK)
  })

  it('emitSyncEntityFailure sends classification output with schema_version', () => {
    const classification = classifySyncError(new Error('Failed to fetch'))
    emitSyncEntityFailure({
      syncId: 'test-sync-id',
      entity: 'routines_plans',
      operation: 'pull',
      classification,
    })

    expect(mockCapture).toHaveBeenCalledWith('sync_entity_failure', expect.any(Object))
    const props = mockCapture.mock.calls[0][1] as SyncCaptureProps
    expect(props.schema_version).toBe(1)
    expect(props.sync_id).toBe('test-sync-id')
    expect(props.entity).toBe('routines_plans')
    expect(props.operation).toBe('pull')
    expect(props.error_code).toBe(SyncErrorCode.NETWORK)
    expect(props.retryable).toBe(true)
  })
})
