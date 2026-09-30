import { repairRoutineExerciseRefs } from '../src/features/accountUpgrade/repairRoutineExerciseRefs'
import type { Routine } from '../src/lib/routines'
import type { ExerciseDefinitionSyncIndexEntry } from '../src/db/workouts'

const CANONICAL_UUID = '11111111-1111-1111-8111-111111111111'
const CANONICAL_UUID_2 = '22222222-2222-2222-8222-222222222222'
const ITEM_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const exerciseIndex: ExerciseDefinitionSyncIndexEntry[] = [
  {
    id: CANONICAL_UUID,
    slug: 'barbell-squat',
    name: 'Barbell Squat',
    aliases: ['back squat', 'squat'],
  },
  {
    id: CANONICAL_UUID_2,
    slug: 'bench-press',
    name: 'Bench Press',
    aliases: ['flat bench', 'chest press'],
  },
]

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'routine-1',
    clientUuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    name: 'Test Routine',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    dirty: false,
    items: [],
    ...overrides,
  }
}

describe('repairRoutineExerciseRefs', () => {
  it('leaves already-canonical UUID items unchanged and marks routine not dirty', () => {
    const routine = makeRoutine({
      items: [{ exerciseDefinitionId: CANONICAL_UUID, orderIndex: 0, clientUuid: ITEM_UUID }],
    })

    const result = repairRoutineExerciseRefs([routine], exerciseIndex)

    expect(result.routines).toHaveLength(1)
    expect(result.routines[0].items[0].exerciseDefinitionId).toBe(CANONICAL_UUID)
    expect(result.routines[0].dirty).toBe(false)
    expect(result.itemsScanned).toBe(1)
    expect(result.itemsResolved).toBe(1)
    expect(result.itemsRewritten).toBe(0)
    expect(result.itemsUnresolved).toBe(0)
    expect(result.droppedRoutineIds).toHaveLength(0)
  })

  it('resolves legacy slug to canonical UUID and marks routine dirty', () => {
    const routine = makeRoutine({
      items: [{ exerciseDefinitionId: 'barbell-squat', orderIndex: 0, clientUuid: ITEM_UUID }],
    })

    const result = repairRoutineExerciseRefs([routine], exerciseIndex)

    expect(result.routines[0].items[0].exerciseDefinitionId).toBe(CANONICAL_UUID)
    expect(result.routines[0].dirty).toBe(true)
    expect(result.itemsRewritten).toBe(1)
    expect(result.itemsResolved).toBe(0)
  })

  it('resolves legacy name (case-insensitive) to canonical UUID', () => {
    const routine = makeRoutine({
      items: [{ exerciseDefinitionId: 'barbell squat', orderIndex: 0 }],
    })

    const result = repairRoutineExerciseRefs([routine], exerciseIndex)

    expect(result.routines[0].items[0].exerciseDefinitionId).toBe(CANONICAL_UUID)
    expect(result.routines[0].dirty).toBe(true)
    expect(result.itemsRewritten).toBe(1)
  })

  it('resolves legacy alias (case-insensitive) to canonical UUID', () => {
    const routine = makeRoutine({
      items: [{ exerciseDefinitionId: 'Back Squat', orderIndex: 0 }],
    })

    const result = repairRoutineExerciseRefs([routine], exerciseIndex)

    expect(result.routines[0].items[0].exerciseDefinitionId).toBe(CANONICAL_UUID)
    expect(result.routines[0].dirty).toBe(true)
    expect(result.itemsRewritten).toBe(1)
  })

  it('quarantines items with unresolvable exercise IDs', () => {
    const routine = makeRoutine({
      items: [{ exerciseDefinitionId: 'unknown-exercise-xyz', orderIndex: 0 }],
    })

    const result = repairRoutineExerciseRefs([routine], exerciseIndex)

    expect(result.routines).toHaveLength(0)
    expect(result.droppedRoutineIds).toContain('routine-1')
    expect(result.itemsUnresolved).toBe(1)
    expect(result.itemsScanned).toBe(1)
  })

  it('drops a routine when all items are unresolvable', () => {
    const routine = makeRoutine({
      items: [
        { exerciseDefinitionId: 'ghost-exercise-1', orderIndex: 0 },
        { exerciseDefinitionId: 'ghost-exercise-2', orderIndex: 1 },
      ],
    })

    const result = repairRoutineExerciseRefs([routine], exerciseIndex)

    expect(result.routines).toHaveLength(0)
    expect(result.droppedRoutineIds).toEqual(['routine-1'])
    expect(result.itemsUnresolved).toBe(2)
  })

  it('preserves routine if at least one item resolves', () => {
    const routine = makeRoutine({
      items: [
        { exerciseDefinitionId: 'barbell-squat', orderIndex: 0 },
        { exerciseDefinitionId: 'ghost-exercise', orderIndex: 1 },
      ],
    })

    const result = repairRoutineExerciseRefs([routine], exerciseIndex)

    expect(result.routines).toHaveLength(1)
    expect(result.routines[0].items).toHaveLength(1)
    expect(result.routines[0].items[0].exerciseDefinitionId).toBe(CANONICAL_UUID)
    expect(result.droppedRoutineIds).toHaveLength(0)
    expect(result.itemsRewritten).toBe(1)
    expect(result.itemsUnresolved).toBe(1)
  })

  it('handles multiple routines with mixed resolution', () => {
    const r1 = makeRoutine({
      id: 'r1',
      items: [{ exerciseDefinitionId: CANONICAL_UUID, orderIndex: 0 }],
    })
    const r2 = makeRoutine({
      id: 'r2',
      items: [{ exerciseDefinitionId: 'bench-press', orderIndex: 0 }],
    })
    const r3 = makeRoutine({
      id: 'r3',
      items: [{ exerciseDefinitionId: 'totally-unknown', orderIndex: 0 }],
    })

    const result = repairRoutineExerciseRefs([r1, r2, r3], exerciseIndex)

    expect(result.routines).toHaveLength(2)
    expect(result.routines.map((r) => r.id).sort()).toEqual(['r1', 'r2'])
    expect(result.droppedRoutineIds).toEqual(['r3'])
    expect(result.itemsScanned).toBe(3)
    expect(result.itemsResolved).toBe(1)
    expect(result.itemsRewritten).toBe(1)
    expect(result.itemsUnresolved).toBe(1)
  })

  it('returns empty result for empty routines list', () => {
    const result = repairRoutineExerciseRefs([], exerciseIndex)

    expect(result.routines).toHaveLength(0)
    expect(result.itemsScanned).toBe(0)
    expect(result.itemsResolved).toBe(0)
    expect(result.itemsUnresolved).toBe(0)
  })

  it('returns unmodified routines when exercise index is empty', () => {
    const routine = makeRoutine({
      items: [{ exerciseDefinitionId: 'barbell-squat', orderIndex: 0 }],
    })

    const result = repairRoutineExerciseRefs([routine], [])

    expect(result.routines).toHaveLength(0)
    expect(result.droppedRoutineIds).toContain('routine-1')
    expect(result.itemsUnresolved).toBe(1)
  })

  it('preserves non-exerciseDefinitionId fields on repaired items', () => {
    const routine = makeRoutine({
      items: [
        {
          exerciseDefinitionId: 'chest press',
          orderIndex: 2,
          section: 'main',
          clientUuid: ITEM_UUID,
          defaultSets: 3,
          defaultReps: 10,
        },
      ],
    })

    const result = repairRoutineExerciseRefs([routine], exerciseIndex)

    const repaired = result.routines[0].items[0]
    expect(repaired.exerciseDefinitionId).toBe(CANONICAL_UUID_2)
    expect(repaired.orderIndex).toBe(2)
    expect(repaired.section).toBe('main')
    expect(repaired.clientUuid).toBe(ITEM_UUID)
    expect(repaired.defaultSets).toBe(3)
    expect(repaired.defaultReps).toBe(10)
  })
})
