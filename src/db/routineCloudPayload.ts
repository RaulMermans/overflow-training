import {
  sortRoutineItemsBySection,
  normalizeRoutineSection,
  type Routine,
  type RoutineSection,
} from '../lib/routines'
import { uuidFromString } from '../lib/ids'

function serializeSectionNotes(section: RoutineSection): string {
  return JSON.stringify({ section: normalizeRoutineSection(section) })
}

/**
 * Converts a local Routine to the payload shape expected by
 * upsert_routine_with_items_atomic (p_routine, p_items).
 * Shared by: sync engine, immediate cloud save flows, calendar retry.
 */
export function toCloudRoutinePayload(routine: Routine): {
  routine: {
    id?: string | null
    client_uuid: string
    name: string
    description: string | null
    color: string | null
    pinned: boolean
    created_at: string
    updated_at: string
  }
  items: Array<{
    client_uuid: string
    order: number
    exercise_id: string
    sets: number | null
    reps: number | null
    rest: null
    notes: string
    created_at: string
    updated_at: string
  }>
} {
  const clientUuid = routine.clientUuid ?? routine.id
  const sortedItems = sortRoutineItemsBySection(routine.items)

  return {
    routine: {
      id: routine.id,
      client_uuid: clientUuid,
      name: routine.name,
      description: routine.description ?? null,
      color: routine.color ?? null,
      pinned: routine.pinned === true,
      created_at: routine.createdAt,
      updated_at: routine.updatedAt,
    },
    items: sortedItems.map((item, index) => ({
      client_uuid: item.clientUuid ?? uuidFromString(`${clientUuid}:${item.exerciseDefinitionId}`),
      order: index,
      exercise_id: item.exerciseDefinitionId,
      sets: item.defaultSets ?? null,
      reps: item.defaultReps ?? null,
      rest: null,
      notes: serializeSectionNotes(item.section ?? 'main'),
      created_at: routine.createdAt,
      updated_at: item.updatedAt ?? routine.updatedAt,
    })),
  }
}
