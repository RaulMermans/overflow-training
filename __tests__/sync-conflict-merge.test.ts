import { mergePlanDays, mergeRoutines } from '../src/features/sync/routinesPlans/merge'

describe('sync conflict merge', () => {
  it('applies LWW for routine scalar fields and deterministic order merge for items', () => {
    const local = [
      {
        id: 'routine-1',
        clientUuid: 'routine-1',
        name: 'Upper A',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        pinned: true,
        items: [
          {
            exerciseDefinitionId: 'bench',
            orderIndex: 1,
            clientUuid: 'item-bench',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
          {
            exerciseDefinitionId: 'row',
            orderIndex: 0,
            clientUuid: 'item-row',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    ]

    const remote = [
      {
        id: 'routine-1',
        clientUuid: 'routine-1',
        name: 'Upper Remote',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T12:00:00.000Z',
        pinned: false,
        items: [
          {
            exerciseDefinitionId: 'pull-up',
            orderIndex: 2,
            clientUuid: 'item-pullup',
            updatedAt: '2026-01-01T12:00:00.000Z',
          },
          {
            exerciseDefinitionId: 'row',
            orderIndex: 0,
            clientUuid: 'item-row',
            updatedAt: '2026-01-01T12:00:00.000Z',
          },
        ],
      },
    ]

    const merged = mergeRoutines(local as never, remote as never)

    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('Upper A')
    expect(merged[0].pinned).toBe(true)
    expect(merged[0].items.map((item) => item.clientUuid)).toEqual([
      'item-row',
      'item-bench',
      'item-pullup',
    ])
    expect(merged[0].items.map((item) => item.orderIndex)).toEqual([0, 1, 2])
  })

  it('applies LWW for planned day map entries', () => {
    const local = {
      '2026-02-01': {
        date: '2026-02-01',
        routineId: 'routine-local',
        updatedAt: '2026-02-03T00:00:00.000Z',
      },
    }

    const remote = {
      '2026-02-01': {
        date: '2026-02-01',
        routineId: 'routine-remote',
        updatedAt: '2026-02-02T00:00:00.000Z',
      },
      '2026-02-02': {
        date: '2026-02-02',
        routineId: 'routine-2',
        updatedAt: '2026-02-02T00:00:00.000Z',
      },
    }

    const merged = mergePlanDays(local, remote)

    expect(merged['2026-02-01'].routineId).toBe('routine-local')
    expect(merged['2026-02-02'].routineId).toBe('routine-2')
  })

  it('orders merged items by section before orderIndex', () => {
    const merged = mergeRoutines(
      [
        {
          id: 'routine-a',
          clientUuid: 'routine-a',
          name: 'Pack',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-03T00:00:00.000Z',
          items: [
            { exerciseDefinitionId: 'main-a', orderIndex: 0, section: 'main', clientUuid: 'm1' },
            { exerciseDefinitionId: 'warm-a', orderIndex: 2, section: 'warmup', clientUuid: 'w1' },
          ],
        },
      ] as never,
      [
        {
          id: 'routine-a',
          clientUuid: 'routine-a',
          name: 'Pack',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          items: [
            {
              exerciseDefinitionId: 'cool-a',
              orderIndex: 1,
              section: 'cooldown',
              clientUuid: 'c1',
            },
          ],
        },
      ] as never,
    )

    expect(merged[0].items.map((item) => item.exerciseDefinitionId)).toEqual([
      'warm-a',
      'main-a',
      'cool-a',
    ])
    expect(merged[0].items.map((item) => item.section)).toEqual(['warmup', 'main', 'cooldown'])
  })
})
