import { resolveSyncCycle } from '../src/features/sync/resolveSyncCycle'

describe('sync provider fail-open routing', () => {
  const baseRoutinesResult = {
    status: 'error' as const,
    migrationApplied: false,
    routinesCount: 2,
    plansCount: 1,
    errorMessage: 'violates not-null constraint',
    warningCount: 2,
    quarantinedCount: 2,
    recoverableError: true,
    quarantineReasons: ['missing_routine_item_exercise_id'],
    planningLastChanged: null,
  }

  it('degrades recoverable routines/plans errors to warning when fail-open is enabled', () => {
    const resolved = resolveSyncCycle({
      routinesSyncResult: baseRoutinesResult,
      outboxResult: {
        offline: false,
        lastErrorMessage: null,
        retried: 0,
      },
      blockedCount: 0,
      failOpenRoutinePlanSync: true,
    })

    expect(resolved.nextStatus).toBe('synced')
    expect(resolved.hasScheduleWarning).toBe(true)
    expect(resolved.lastErrorSource).toBe('routinesPlans')
    expect(resolved.combinedErrorMessage?.toLowerCase()).toContain('schedule sync')
  })

  it('keeps strict error behavior when fail-open is disabled', () => {
    const resolved = resolveSyncCycle({
      routinesSyncResult: baseRoutinesResult,
      outboxResult: {
        offline: false,
        lastErrorMessage: null,
        retried: 0,
      },
      blockedCount: 0,
      failOpenRoutinePlanSync: false,
    })

    expect(resolved.nextStatus).toBe('error')
    expect(resolved.lastErrorSource).toBe('routinesPlans')
  })

  it('prioritizes outbox blocked failures as hard errors', () => {
    const resolved = resolveSyncCycle({
      routinesSyncResult: {
        ...baseRoutinesResult,
        status: 'synced',
        warningCount: 0,
        quarantinedCount: 0,
        recoverableError: false,
        errorMessage: null,
      },
      outboxResult: {
        offline: false,
        lastErrorMessage: 'permission denied',
        retried: 0,
      },
      blockedCount: 2,
      failOpenRoutinePlanSync: true,
    })

    expect(resolved.nextStatus).toBe('error')
    expect(resolved.lastErrorSource).toBe('outbox')
    expect(resolved.combinedErrorMessage?.toLowerCase()).toContain('workout sync blocked')
  })

  it('treats non-offline outbox retries as sync errors (not offline)', () => {
    const resolved = resolveSyncCycle({
      routinesSyncResult: {
        ...baseRoutinesResult,
        status: 'synced',
        warningCount: 0,
        quarantinedCount: 0,
        recoverableError: false,
        errorMessage: null,
      },
      outboxResult: {
        offline: false,
        lastErrorMessage: 'Internal Server Error',
        retried: 1,
      },
      blockedCount: 0,
      failOpenRoutinePlanSync: true,
    })

    expect(resolved.nextStatus).toBe('error')
    expect(resolved.lastErrorSource).toBe('outbox')
    expect(resolved.combinedErrorMessage?.toLowerCase()).toContain('workout sync retrying')
  })

  it('keeps offline status for network retries', () => {
    const resolved = resolveSyncCycle({
      routinesSyncResult: {
        ...baseRoutinesResult,
        status: 'synced',
        warningCount: 0,
        quarantinedCount: 0,
        recoverableError: false,
        errorMessage: null,
      },
      outboxResult: {
        offline: true,
        lastErrorMessage: 'Network request failed',
        retried: 1,
      },
      blockedCount: 0,
      failOpenRoutinePlanSync: true,
    })

    expect(resolved.nextStatus).toBe('offline')
    expect(resolved.lastErrorSource).toBe('outbox')
    expect(resolved.combinedErrorMessage?.toLowerCase()).toContain('workout sync retrying')
  })
})
