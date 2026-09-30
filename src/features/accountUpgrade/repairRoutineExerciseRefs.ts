import { isUuid } from '../../lib/ids'
import type { Routine, RoutineItem } from '../../lib/routines'
import type { ExerciseDefinitionSyncIndexEntry } from '../../db/workouts'

export interface RepairRoutineRefsResult {
  routines: Routine[]
  droppedRoutineIds: string[]
  itemsScanned: number
  itemsResolved: number
  itemsRewritten: number
  itemsUnresolved: number
}

interface ExerciseLookupIndex {
  byId: Map<string, ExerciseDefinitionSyncIndexEntry>
  bySlug: Map<string, ExerciseDefinitionSyncIndexEntry>
  byNormalizedName: Map<string, ExerciseDefinitionSyncIndexEntry>
  byAlias: Map<string, ExerciseDefinitionSyncIndexEntry>
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function buildLookupIndex(entries: ExerciseDefinitionSyncIndexEntry[]): ExerciseLookupIndex {
  const byId = new Map<string, ExerciseDefinitionSyncIndexEntry>()
  const bySlug = new Map<string, ExerciseDefinitionSyncIndexEntry>()
  const byNormalizedName = new Map<string, ExerciseDefinitionSyncIndexEntry>()
  const byAlias = new Map<string, ExerciseDefinitionSyncIndexEntry>()

  for (const entry of entries) {
    const id = entry.id?.trim()
    const slug = entry.slug?.trim()
    const name = entry.name?.trim()

    if (id) {
      byId.set(id.toLowerCase(), entry)
    }

    if (slug) {
      bySlug.set(normalizeText(slug), entry)
    }

    if (name) {
      byNormalizedName.set(normalizeText(name), entry)
    }

    const aliases = entry.aliases
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        if (typeof alias === 'string' && alias.trim()) {
          byAlias.set(normalizeText(alias), entry)
        }
      }
    }
  }

  return { byId, bySlug, byNormalizedName, byAlias }
}

function resolveExerciseId(
  rawId: string,
  index: ExerciseLookupIndex,
): ExerciseDefinitionSyncIndexEntry | null {
  const normalized = normalizeText(rawId)

  // 1. UUID match by id (already canonical)
  const byIdMatch = index.byId.get(normalized)
  if (byIdMatch) return byIdMatch

  // 2. Slug match
  const bySlugMatch = index.bySlug.get(normalized)
  if (bySlugMatch) return bySlugMatch

  // 3. Normalized name match
  const byNameMatch = index.byNormalizedName.get(normalized)
  if (byNameMatch) return byNameMatch

  // 4. Alias match
  const byAliasMatch = index.byAlias.get(normalized)
  if (byAliasMatch) return byAliasMatch

  return null
}

export function repairRoutineExerciseRefs(
  routines: Routine[],
  exerciseIndex: ExerciseDefinitionSyncIndexEntry[],
): RepairRoutineRefsResult {
  const index = buildLookupIndex(exerciseIndex)

  const repairedRoutines: Routine[] = []
  const droppedRoutineIds: string[] = []
  let itemsScanned = 0
  let itemsResolved = 0
  let itemsRewritten = 0
  let itemsUnresolved = 0

  for (const routine of routines) {
    const repairedItems: RoutineItem[] = []
    let routineWasRewritten = false

    for (const item of routine.items) {
      itemsScanned++

      const rawId = item.exerciseDefinitionId
      const resolved = resolveExerciseId(rawId, index)

      if (!resolved) {
        itemsUnresolved++
        continue
      }

      const canonicalId = resolved.id
      const alreadyCanonical =
        isUuid(rawId) && rawId.trim().toLowerCase() === canonicalId.toLowerCase()

      if (alreadyCanonical) {
        itemsResolved++
        repairedItems.push(item)
      } else {
        itemsRewritten++
        routineWasRewritten = true
        repairedItems.push({ ...item, exerciseDefinitionId: canonicalId })
      }
    }

    if (repairedItems.length === 0) {
      droppedRoutineIds.push(routine.id)
      continue
    }

    repairedRoutines.push({
      ...routine,
      items: repairedItems,
      dirty: routineWasRewritten ? true : routine.dirty,
    })
  }

  return {
    routines: repairedRoutines,
    droppedRoutineIds,
    itemsScanned,
    itemsResolved,
    itemsRewritten,
    itemsUnresolved,
  }
}
