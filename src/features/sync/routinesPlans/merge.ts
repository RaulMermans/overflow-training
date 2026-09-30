import type { PlannedDay } from '../../../domain/schedule'
import {
  normalizeRoutineSection,
  ROUTINE_SECTION_ORDER,
  type Routine,
  type RoutineItem,
} from '../../../lib/routines'

export type MergeRoutineItem = RoutineItem & {
  clientUuid?: string
  updatedAt?: string
}

export type MergeRoutine = Routine & {
  clientUuid?: string
  description?: string | null
  color?: string | null
  deletedAt?: string | null
  dirty?: boolean
  items: MergeRoutineItem[]
}

export type MergePlannedDay = PlannedDay & {
  clientUuid?: string
  updatedAt?: string
}

function toIso(value: string | null | undefined): string {
  if (!value) return new Date(0).toISOString()
  return value
}

function compareIsoDesc(left: string | null | undefined, right: string | null | undefined): number {
  return toIso(right).localeCompare(toIso(left))
}

function routineKey(routine: MergeRoutine): string {
  return (routine.clientUuid ?? routine.id).trim()
}

function itemKey(item: MergeRoutineItem): string {
  return (item.clientUuid ?? item.exerciseDefinitionId).trim()
}

function sectionRank(value: MergeRoutineItem['section']): number {
  const normalized = normalizeRoutineSection(value)
  const index = ROUTINE_SECTION_ORDER.indexOf(normalized)
  return index === -1 ? 1 : index
}

function pickWinner<T extends { updatedAt?: string }>(a: T, b: T): T {
  return toIso(a.updatedAt) >= toIso(b.updatedAt) ? a : b
}

function mergeOrderedItems(
  localItems: MergeRoutineItem[],
  remoteItems: MergeRoutineItem[],
): MergeRoutineItem[] {
  const merged = new Map<string, MergeRoutineItem>()

  for (const item of remoteItems) {
    merged.set(itemKey(item), item)
  }

  for (const item of localItems) {
    const key = itemKey(item)
    const existing = merged.get(key)
    merged.set(key, existing ? pickWinner(item, existing) : item)
  }

  return [...merged.values()]
    .sort((a, b) => {
      const sectionDiff = sectionRank(a.section) - sectionRank(b.section)
      if (sectionDiff !== 0) return sectionDiff
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex
      const updatedCompare = compareIsoDesc(a.updatedAt, b.updatedAt)
      if (updatedCompare !== 0) return updatedCompare
      return itemKey(a).localeCompare(itemKey(b))
    })
    .map((item, index) => ({
      ...item,
      section: normalizeRoutineSection(item.section),
      orderIndex: index,
    }))
}

export function mergeRoutines(
  localRoutines: MergeRoutine[],
  remoteRoutines: MergeRoutine[],
): MergeRoutine[] {
  const merged = new Map<string, MergeRoutine>()

  for (const remoteRoutine of remoteRoutines) {
    merged.set(routineKey(remoteRoutine), remoteRoutine)
  }

  for (const localRoutine of localRoutines) {
    const key = routineKey(localRoutine)
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, localRoutine)
      continue
    }

    const scalarWinner = pickWinner(localRoutine, existing)
    merged.set(key, {
      ...scalarWinner,
      items: mergeOrderedItems(localRoutine.items, existing.items),
      dirty: Boolean(localRoutine.dirty || existing.dirty),
    })
  }

  return [...merged.values()].sort((a, b) => compareIsoDesc(a.updatedAt, b.updatedAt))
}

export function mergePlanDays(
  localPlans: Record<string, MergePlannedDay>,
  remotePlans: Record<string, MergePlannedDay>,
): Record<string, MergePlannedDay> {
  const dates = new Set<string>([...Object.keys(localPlans), ...Object.keys(remotePlans)])
  const merged: Record<string, MergePlannedDay> = {}

  for (const date of dates) {
    const local = localPlans[date]
    const remote = remotePlans[date]

    if (!local) {
      merged[date] = remote
      continue
    }

    if (!remote) {
      merged[date] = local
      continue
    }

    merged[date] = pickWinner(local, remote)
  }

  return merged
}
