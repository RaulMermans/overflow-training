import type { Routine, RoutineUsageMap } from '../../lib/routines'

export type RoutinePickerRoutine = Pick<Routine, 'id' | 'name' | 'pinned' | 'updatedAt'>

export type RoutinePickerSectionKey = 'pinned' | 'recent' | 'all'

export interface RoutinePickerSection<T extends RoutinePickerRoutine = RoutinePickerRoutine> {
  key: RoutinePickerSectionKey
  title: string
  data: T[]
}

interface BuildRoutinePickerSectionsInput<T extends RoutinePickerRoutine> {
  routines: T[]
  usage: RoutineUsageMap
  query?: string
  titles?: Partial<Record<RoutinePickerSectionKey, string>>
}

interface BuildRoutineSectionsInput<T extends RoutinePickerRoutine> {
  routines: T[]
  usage: RoutineUsageMap
  query?: string
}

export interface RoutineSectionBuckets<T extends RoutinePickerRoutine = RoutinePickerRoutine> {
  pinned: T[]
  recent: T[]
  all: T[]
}

const DEFAULT_SECTION_TITLES: Record<RoutinePickerSectionKey, string> = {
  pinned: 'Favorites',
  recent: 'Recent',
  all: 'All',
}

export function safeTimestamp(value: unknown): number {
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string' && value.trim()) {
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  return 0
}

export function normalizeQuery(query?: string): string {
  if (!query) return ''
  return query.trim().toLocaleLowerCase()
}

export function matchesRoutineName(
  routine: Pick<RoutinePickerRoutine, 'name'>,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true
  return routine.name.toLocaleLowerCase().includes(normalizedQuery)
}

function compareByNameThenIdAsc(a: RoutinePickerRoutine, b: RoutinePickerRoutine): number {
  const nameComparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  if (nameComparison !== 0) return nameComparison
  return a.id.localeCompare(b.id)
}

function compareByUpdatedAtDesc(a: RoutinePickerRoutine, b: RoutinePickerRoutine): number {
  const updatedAtComparison = safeTimestamp(b.updatedAt) - safeTimestamp(a.updatedAt)
  if (updatedAtComparison !== 0) return updatedAtComparison
  return compareByNameThenIdAsc(a, b)
}

function compareByLastUsedAtDesc(
  a: RoutinePickerRoutine,
  b: RoutinePickerRoutine,
  usage: RoutineUsageMap,
): number {
  const lastUsedComparison =
    safeTimestamp(usage[b.id]?.lastUsedAt) - safeTimestamp(usage[a.id]?.lastUsedAt)
  if (lastUsedComparison !== 0) return lastUsedComparison
  return compareByNameThenIdAsc(a, b)
}

function hasUsage(usage: RoutineUsageMap, routineId: string): boolean {
  return safeTimestamp(usage[routineId]?.lastUsedAt) > 0
}

export function buildRoutinePickerSections<T extends RoutinePickerRoutine>({
  routines,
  usage,
  query,
  titles,
}: BuildRoutinePickerSectionsInput<T>): RoutinePickerSection<T>[] {
  const sectionTitles: Record<RoutinePickerSectionKey, string> = {
    pinned: titles?.pinned ?? DEFAULT_SECTION_TITLES.pinned,
    recent: titles?.recent ?? DEFAULT_SECTION_TITLES.recent,
    all: titles?.all ?? DEFAULT_SECTION_TITLES.all,
  }

  const { pinned, recent, all } = buildRoutineSections({ routines, usage, query })
  const sections: RoutinePickerSection<T>[] = [
    { key: 'pinned', title: sectionTitles.pinned, data: pinned },
    { key: 'recent', title: sectionTitles.recent, data: recent },
    { key: 'all', title: sectionTitles.all, data: all },
  ]

  return sections.filter((section) => section.data.length > 0)
}

export function buildRoutineSections<T extends RoutinePickerRoutine>({
  routines,
  usage,
  query,
}: BuildRoutineSectionsInput<T>): RoutineSectionBuckets<T> {
  const normalizedQuery = normalizeQuery(query)
  const filtered = normalizedQuery
    ? routines.filter((routine) => matchesRoutineName(routine, normalizedQuery))
    : routines

  const pinned = filtered.filter((routine) => routine.pinned === true).sort(compareByUpdatedAtDesc)
  const nonPinned = filtered.filter((routine) => routine.pinned !== true)

  const recent = nonPinned
    .filter((routine) => hasUsage(usage, routine.id))
    .sort((a, b) => compareByLastUsedAtDesc(a, b, usage))

  const recentIds = new Set(recent.map((routine) => routine.id))
  const all = nonPinned.filter((routine) => !recentIds.has(routine.id)).sort(compareByUpdatedAtDesc)

  return { pinned, recent, all }
}
