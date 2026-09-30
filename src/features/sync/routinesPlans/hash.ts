import type { PlannedDay } from '../../../domain/schedule'
import { normalizeRoutineSection, type Routine } from '../../../lib/routines'

function stableHash(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function normalizeRoutineName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function routineStructureHash(routine: Routine): string {
  const normalized = {
    name: normalizeRoutineName(routine.name),
    items: [...routine.items]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => ({
        exerciseDefinitionId: item.exerciseDefinitionId.trim().toLowerCase(),
        section: normalizeRoutineSection(item.section),
        defaultSets: item.defaultSets ?? null,
        defaultReps: item.defaultReps ?? null,
      })),
  }

  return stableHash(JSON.stringify(normalized))
}

export function plansStructureHash(plans: Record<string, PlannedDay>): string {
  const normalized = Object.entries(plans)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({
      date,
      routineId: day.routineId,
      note: day.note ?? null,
    }))

  return stableHash(JSON.stringify(normalized))
}
