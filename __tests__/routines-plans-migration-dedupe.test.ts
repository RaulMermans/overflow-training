const mockGetItemAsync = jest.fn(async () => null)
const mockSetItemAsync = jest.fn(async () => undefined)

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
}))

const mockLoadRoutines = jest.fn()
const mockLoadRoutineUsage = jest.fn()
const mockReplaceRoutinesSnapshot = jest.fn(async () => undefined)
const mockReplaceRoutineUsageSnapshot = jest.fn(async () => undefined)

jest.mock('../src/lib/routines', () => ({
  loadRoutines: (...args: unknown[]) => mockLoadRoutines(...args),
  loadRoutineUsage: (...args: unknown[]) => mockLoadRoutineUsage(...args),
  replaceRoutinesSnapshot: (...args: unknown[]) => mockReplaceRoutinesSnapshot(...args),
  replaceRoutineUsageSnapshot: (...args: unknown[]) => mockReplaceRoutineUsageSnapshot(...args),
  normalizeRoutineSection: (value: unknown) =>
    value === 'warmup' || value === 'main' || value === 'cooldown' ? value : 'main',
}))

import { migrateLocalRoutinesAndPlansForSync } from '../src/features/sync/routinesPlans/migrateLocalToCloud'

describe('routines/plans migration dedupe', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('dedupes matching routines and remaps plans and usage to the surviving id', async () => {
    mockLoadRoutines.mockResolvedValue([
      {
        id: 'legacy-routine-1',
        name: 'Upper Focus',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-03T00:00:00.000Z',
        items: [{ exerciseDefinitionId: 'bench', orderIndex: 0 }],
      },
      {
        id: 'legacy-routine-2',
        name: ' upper   focus ',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        items: [{ exerciseDefinitionId: 'bench', orderIndex: 0 }],
      },
    ])

    mockLoadRoutineUsage.mockResolvedValue({
      'legacy-routine-1': { usedCount: 2, lastUsedAt: '2026-02-03T00:00:00.000Z' },
      'legacy-routine-2': { usedCount: 1, lastUsedAt: '2026-02-01T00:00:00.000Z' },
    })

    const result = await migrateLocalRoutinesAndPlansForSync('user-1')

    expect(result.applied).toBe(true)

    const replacedRoutines = mockReplaceRoutinesSnapshot.mock.calls[0][1] as Array<{
      id: string
      clientUuid?: string
      items: Array<{ clientUuid?: string; section?: string }>
    }>
    expect(replacedRoutines).toHaveLength(1)
    expect(replacedRoutines[0].id).toBe(replacedRoutines[0].clientUuid)
    expect(replacedRoutines[0].items[0].clientUuid).toBeDefined()
    expect(replacedRoutines[0].items[0].section).toBe('main')

    const replacedUsage = mockReplaceRoutineUsageSnapshot.mock.calls[0][1] as Record<
      string,
      { usedCount: number }
    >
    expect(Object.keys(replacedUsage)).toHaveLength(1)
    expect(replacedUsage[replacedRoutines[0].id].usedCount).toBe(3)
  })
})
