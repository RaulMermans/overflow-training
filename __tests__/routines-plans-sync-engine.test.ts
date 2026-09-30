const mockMigrateLocalRoutinesAndPlansForSync = jest.fn(async () => ({
  applied: false,
  routinesCount: 0,
}))
const mockLoadRoutines = jest.fn()
const mockLoadPlans = jest.fn()
const mockReplaceRoutinesSnapshot = jest.fn(async () => undefined)
const mockReplacePlansSnapshot = jest.fn(async () => undefined)

const mockUpsertCloudRoutineWithItems = jest.fn()
const mockUpsertCloudActivePlan = jest.fn(async () => ({ data: null, error: null }))
const mockFetchCloudRoutinesWithItems = jest.fn()
const mockFetchCloudActivePlan = jest.fn()
const mockComputePlansPushHash = jest.fn(() => 'plans-hash')
const mockLoadPlansPushCheckpoint = jest.fn(async () => ({
  lastPlansHash: null,
  lastPlansPushedAt: null,
}))
const mockSavePlansPushCheckpoint = jest.fn(async () => undefined)
const mockRecordRoutinesPlansQuarantine = jest.fn(async () => ({ records: [] }))
const mockCallRpcWhoami = jest.fn(async () => ({
  data: { uid: 'user-1', role: 'authenticated' },
  error: null,
}))
const mockCallRpcUserLastChanged = jest.fn(async () => ({
  data: { uid: 'user-1', execution_last_changed: null, planning_last_changed: null },
  error: null,
}))

const LOCAL_ROUTINE_ID = '11111111-1111-4111-8111-111111111111'
const CLOUD_ROUTINE_ID = '22222222-2222-4222-8222-222222222222'
const EXERCISE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

jest.mock('../src/features/sync/routinesPlans/migrateLocalToCloud', () => ({
  migrateLocalRoutinesAndPlansForSync: (...args: unknown[]) =>
    mockMigrateLocalRoutinesAndPlansForSync(...args),
}))

jest.mock('../src/lib/plans', () => ({
  loadPlans: (...args: unknown[]) => mockLoadPlans(...args),
  replacePlansSnapshot: (...args: unknown[]) => mockReplacePlansSnapshot(...args),
}))

jest.mock('../src/lib/routines', () => ({
  loadRoutines: (...args: unknown[]) => mockLoadRoutines(...args),
  replaceRoutinesSnapshot: (...args: unknown[]) => mockReplaceRoutinesSnapshot(...args),
  normalizeRoutineSection: (value: unknown) =>
    value === 'warmup' || value === 'main' || value === 'cooldown' ? value : 'main',
  sortRoutineItemsBySection: (items: unknown[]) => [...items],
}))

jest.mock('../src/db/routinesPlans', () => ({
  callRpcWhoami: () => mockCallRpcWhoami(),
  callRpcUserLastChanged: () => mockCallRpcUserLastChanged(),
  fetchCloudActivePlan: (...args: unknown[]) => mockFetchCloudActivePlan(...args),
  fetchCloudRoutinesWithItems: (...args: unknown[]) => mockFetchCloudRoutinesWithItems(...args),
  upsertCloudActivePlan: (...args: unknown[]) => mockUpsertCloudActivePlan(...args),
  upsertCloudRoutineWithItems: (...args: unknown[]) => mockUpsertCloudRoutineWithItems(...args),
}))

jest.mock('../src/lib/retry', () => ({
  defaultShouldRetry: () => false,
}))

jest.mock('../src/features/sync/routinesPlans/pushCheckpoint', () => ({
  computePlansPushHash: (...args: unknown[]) => mockComputePlansPushHash(...args),
  loadPlansPushCheckpoint: (...args: unknown[]) => mockLoadPlansPushCheckpoint(...args),
  savePlansPushCheckpoint: (...args: unknown[]) => mockSavePlansPushCheckpoint(...args),
}))

jest.mock('../src/features/sync/routinesPlans/quarantineStore', () => ({
  recordRoutinesPlansQuarantine: (...args: unknown[]) => mockRecordRoutinesPlansQuarantine(...args),
  summarizeQuarantineReasons: (
    records: Array<{ reason: string; occurrences?: number }>,
    maxReasons = 3,
  ) => [...new Set(records.map((record) => record.reason))].slice(0, maxReasons),
}))

import { runRoutinesPlansSync } from '../src/features/sync/routinesPlans/syncEngine'

function makeLocalRoutine(
  id = LOCAL_ROUTINE_ID,
  overrides?: Partial<{
    dirty: boolean
    items: Array<{ exerciseDefinitionId: string; orderIndex: number; section: 'main' }>
  }>,
) {
  return {
    id,
    clientUuid: id,
    name: 'Routine One',
    description: null,
    color: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    dirty: overrides?.dirty,
    items: overrides?.items ?? [
      {
        exerciseDefinitionId: EXERCISE_ID,
        orderIndex: 0,
        section: 'main',
      },
    ],
  }
}

function makeCloudRoutine(cloudId: string, clientUuid: string) {
  return {
    id: cloudId,
    user_id: 'user-1',
    client_uuid: clientUuid,
    name: 'Routine One',
    description: null,
    color: null,
    pinned: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    routine_items: [],
  }
}

function makeCloudPlan(schedule: Record<string, unknown>) {
  return {
    id: 'plan-1',
    user_id: 'user-1',
    client_uuid: 'active-plan-client',
    name: 'Active Plan',
    schedule_json: schedule,
    active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    plan_days: [],
  }
}

describe('routines plans sync engine', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockMigrateLocalRoutinesAndPlansForSync.mockResolvedValue({
      applied: false,
      routinesCount: 0,
    })
    mockUpsertCloudRoutineWithItems.mockResolvedValue({
      data: { id: CLOUD_ROUTINE_ID, client_uuid: LOCAL_ROUTINE_ID },
      error: null,
    })
    mockUpsertCloudActivePlan.mockResolvedValue({ data: null, error: null })
    mockFetchCloudRoutinesWithItems.mockResolvedValue({
      data: [makeCloudRoutine(CLOUD_ROUTINE_ID, LOCAL_ROUTINE_ID)],
      error: null,
    })
    mockFetchCloudActivePlan.mockResolvedValue({
      data: makeCloudPlan({}),
      error: null,
    })
    mockComputePlansPushHash.mockReturnValue('plans-hash')
    mockLoadPlansPushCheckpoint.mockResolvedValue({
      lastPlansHash: null,
      lastPlansPushedAt: null,
    })
    mockLoadRoutines.mockResolvedValue([makeLocalRoutine()])
    mockLoadPlans.mockResolvedValue({})
    mockCallRpcWhoami.mockResolvedValue({
      data: { uid: 'user-1', role: 'authenticated' },
      error: null,
    })
    mockCallRpcUserLastChanged.mockResolvedValue({
      data: { uid: 'user-1', execution_last_changed: null, planning_last_changed: null },
      error: null,
    })
  })

  it('skips plan upsert when plans hash matches the saved push checkpoint', async () => {
    mockLoadPlans.mockResolvedValue({
      '2026-02-20': {
        date: '2026-02-20',
        routineId: LOCAL_ROUTINE_ID,
        updatedAt: '2026-02-20T00:00:00.000Z',
      },
    })
    mockComputePlansPushHash.mockReturnValue('plans-hash-stable')
    mockLoadPlansPushCheckpoint.mockResolvedValue({
      lastPlansHash: 'plans-hash-stable',
      lastPlansPushedAt: '2026-02-19T00:00:00.000Z',
    })

    const result = await runRoutinesPlansSync('user-1')

    expect(result.status).toBe('synced')
    expect(mockUpsertCloudActivePlan).not.toHaveBeenCalled()
    expect(mockSavePlansPushCheckpoint).not.toHaveBeenCalled()
  })

  it('quarantines malformed local routine rows and continues syncing valid rows', async () => {
    mockFetchCloudRoutinesWithItems.mockResolvedValue({
      data: [],
      error: null,
    })
    mockLoadRoutines.mockResolvedValue([
      makeLocalRoutine('33333333-3333-4333-8333-333333333333', {
        dirty: true,
        items: [
          {
            exerciseDefinitionId: '',
            orderIndex: 0,
            section: 'main',
          },
        ],
      }),
      makeLocalRoutine(LOCAL_ROUTINE_ID, { dirty: true }),
    ])

    const result = await runRoutinesPlansSync('user-1')

    expect(result.status).toBe('synced')
    expect(result.quarantinedCount).toBeGreaterThan(0)
    expect(result.warningCount).toBeGreaterThan(0)
    expect(mockRecordRoutinesPlansQuarantine).toHaveBeenCalledTimes(1)
    expect(mockUpsertCloudRoutineWithItems).toHaveBeenCalledTimes(1)
  })

  it('skips plan push when all local plan days have unresolvable routine ids', async () => {
    mockLoadPlans.mockResolvedValue({
      '2026-02-20': {
        date: '2026-02-20',
        routineId: 'nonexistent-routine-id',
        updatedAt: '2026-02-20T00:00:00.000Z',
      },
    })
    mockFetchCloudRoutinesWithItems.mockResolvedValue({ data: [], error: null })
    mockLoadRoutines.mockResolvedValue([])

    const result = await runRoutinesPlansSync('user-1')

    expect(result.status).toBe('synced')
    expect(mockUpsertCloudActivePlan).not.toHaveBeenCalled()
  })

  it('defers entire plan push when some days have unresolvable routine ids due to failed routine push', async () => {
    const FAILING_ROUTINE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

    // Plan has two days: day A (routine already in cloud) and day B (new routine whose push fails)
    mockLoadPlans.mockResolvedValue({
      '2026-03-10': {
        date: '2026-03-10',
        routineId: LOCAL_ROUTINE_ID,
        updatedAt: '2026-03-10T00:00:00.000Z',
      },
      '2026-03-11': {
        date: '2026-03-11',
        routineId: FAILING_ROUTINE_ID,
        updatedAt: '2026-03-11T00:00:00.000Z',
      },
    })

    // beforeEach sets cloud routines to [makeCloudRoutine(CLOUD_ROUTINE_ID, LOCAL_ROUTINE_ID)]
    // so LOCAL_ROUTINE_ID is already in cloud — dirty:false means it won't be pushed.
    // FAILING_ROUTINE_ID is not in cloud and dirty:true → will be pushed → fails.
    mockLoadRoutines.mockResolvedValue([
      makeLocalRoutine(LOCAL_ROUTINE_ID, { dirty: false }),
      makeLocalRoutine(FAILING_ROUTINE_ID, { dirty: true }),
    ])

    // The failing routine's push returns a recoverable error (triggers fail-open path)
    mockUpsertCloudRoutineWithItems.mockResolvedValue({
      data: null,
      error: new Error('required value is missing'),
    })

    const result = await runRoutinesPlansSync('user-1')

    // Entire plan push must be skipped — not a partial push
    expect(mockUpsertCloudActivePlan).not.toHaveBeenCalled()
    // Checkpoint must NOT be written so the next cycle re-evaluates and pushes the full plan
    expect(mockSavePlansPushCheckpoint).not.toHaveBeenCalled()
    // Recoverable error → sync completes, but flags recoverableError
    expect(result.status).toBe('synced')
    expect(result.recoverableError).toBe(true)
  })
})
