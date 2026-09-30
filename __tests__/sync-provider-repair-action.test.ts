import { repairScheduleDataForUser } from '../src/features/sync/sessionCleanup'

// Mock all dependencies that sessionCleanup delegates to.
jest.mock('../src/features/sync/routinesPlans/migrateLocalToCloud', () => ({
  clearRoutinesPlansMigrationMarker: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../src/features/sync/routinesPlans/pushCheckpoint', () => ({
  clearPlansPushCheckpoint: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../src/features/accountUpgrade/runAccountUpgrade', () => ({
  clearAccountUpgradeMarker: jest.fn().mockResolvedValue(undefined),
  runAccountUpgrade: jest.fn().mockResolvedValue({
    userId: 'user-1',
    steps: [],
    legacyItemsScanned: 3,
    legacyItemsResolved: 3,
    legacyItemsUnresolved: 0,
    routinesDropped: 0,
    repairForced: true,
  }),
}))

jest.mock('../src/features/sync/routinesPlans/quarantineStore', () => ({
  clearRoutinesPlansQuarantine: jest.fn().mockResolvedValue(undefined),
}))

describe('repairScheduleDataForUser', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('clears migration marker, push checkpoint, and upgrade marker before re-running upgrade', async () => {
    const { clearRoutinesPlansMigrationMarker } = jest.requireMock(
      '../src/features/sync/routinesPlans/migrateLocalToCloud',
    ) as { clearRoutinesPlansMigrationMarker: jest.Mock }
    const { clearPlansPushCheckpoint } = jest.requireMock(
      '../src/features/sync/routinesPlans/pushCheckpoint',
    ) as { clearPlansPushCheckpoint: jest.Mock }
    const { clearAccountUpgradeMarker, runAccountUpgrade } = jest.requireMock(
      '../src/features/accountUpgrade/runAccountUpgrade',
    ) as { clearAccountUpgradeMarker: jest.Mock; runAccountUpgrade: jest.Mock }

    await repairScheduleDataForUser('user-1')

    expect(clearRoutinesPlansMigrationMarker).toHaveBeenCalledWith('user-1')
    expect(clearPlansPushCheckpoint).toHaveBeenCalledWith('user-1')
    expect(clearAccountUpgradeMarker).toHaveBeenCalledWith('user-1')
    expect(runAccountUpgrade).toHaveBeenCalledWith('user-1', { forced: true })
  })

  it('runs the upgrade as forced so it re-runs even if marker exists', async () => {
    const { runAccountUpgrade } = jest.requireMock(
      '../src/features/accountUpgrade/runAccountUpgrade',
    ) as { runAccountUpgrade: jest.Mock }

    await repairScheduleDataForUser('user-1')

    expect(runAccountUpgrade).toHaveBeenCalledWith('user-1', { forced: true })
  })

  it('clears quarantine records during repair', async () => {
    const { clearRoutinesPlansQuarantine } = jest.requireMock(
      '../src/features/sync/routinesPlans/quarantineStore',
    ) as { clearRoutinesPlansQuarantine: jest.Mock }

    await repairScheduleDataForUser('user-1')

    expect(clearRoutinesPlansQuarantine).toHaveBeenCalledWith('user-1')
  })

  it('does nothing when userId is empty', async () => {
    const { clearRoutinesPlansMigrationMarker } = jest.requireMock(
      '../src/features/sync/routinesPlans/migrateLocalToCloud',
    ) as { clearRoutinesPlansMigrationMarker: jest.Mock }

    await repairScheduleDataForUser('')

    expect(clearRoutinesPlansMigrationMarker).not.toHaveBeenCalled()
  })
})
