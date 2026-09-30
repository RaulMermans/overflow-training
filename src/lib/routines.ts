import * as SecureStore from 'expo-secure-store'

const ROUTINES_KEY_PREFIX = 'routines.v2'
const LEGACY_ROUTINES_KEY_PREFIX = 'routines.v1'
const ROUTINE_USAGE_KEY_PREFIX = 'routines.usage.v1'

export type RoutineSection = 'warmup' | 'main' | 'cooldown'

export const ROUTINE_SECTION_ORDER: RoutineSection[] = ['warmup', 'main', 'cooldown']

export type RoutineItem = {
  exerciseDefinitionId: string
  orderIndex: number
  section?: RoutineSection
  clientUuid?: string
  updatedAt?: string
  defaultSets?: number | null
  defaultReps?: number | null
}

export type Routine = {
  id: string
  clientUuid?: string
  name: string
  description?: string | null
  color?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  dirty?: boolean
  pinned?: boolean
  items: RoutineItem[]
}

export type RoutineUsageEntry = {
  usedCount: number
  lastUsedAt: string
}

export type RoutineUsageMap = Record<string, RoutineUsageEntry>

function getRoutinesKey(userId: string): string {
  return `${ROUTINES_KEY_PREFIX}.${userId}`
}

function getLegacyRoutinesKey(userId: string): string {
  return `${LEGACY_ROUTINES_KEY_PREFIX}.${userId}`
}

function getRoutineUsageKey(userId: string): string {
  return `${ROUTINE_USAGE_KEY_PREFIX}.${userId}`
}

function isValidOptionalNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function normalizeRoutineSection(value: unknown): RoutineSection {
  if (value === 'warmup' || value === 'main' || value === 'cooldown') {
    return value
  }
  return 'main'
}

function routineSectionRank(section: RoutineSection): number {
  const index = ROUTINE_SECTION_ORDER.indexOf(section)
  return index === -1 ? 1 : index
}

export function sortRoutineItemsBySection(items: RoutineItem[]): RoutineItem[] {
  return [...items].sort((a, b) => {
    const sectionDiff =
      routineSectionRank(normalizeRoutineSection(a.section)) -
      routineSectionRank(normalizeRoutineSection(b.section))
    if (sectionDiff !== 0) return sectionDiff
    return a.orderIndex - b.orderIndex
  })
}

function normalizeRoutineItems(items: RoutineItem[]): RoutineItem[] {
  const sorted = sortRoutineItemsBySection(items)
  const seenDefinitionIds = new Set<string>()
  const deduped: RoutineItem[] = []

  for (const item of sorted) {
    const exerciseDefinitionId = item.exerciseDefinitionId.trim()
    if (!exerciseDefinitionId || seenDefinitionIds.has(exerciseDefinitionId)) {
      continue
    }

    seenDefinitionIds.add(exerciseDefinitionId)
    deduped.push({
      exerciseDefinitionId,
      orderIndex: deduped.length,
      section: normalizeRoutineSection(item.section),
      clientUuid:
        typeof item.clientUuid === 'string' && item.clientUuid.trim()
          ? item.clientUuid.trim()
          : undefined,
      updatedAt: typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : undefined,
      defaultSets:
        isValidOptionalNumber(item.defaultSets) || item.defaultSets === null
          ? item.defaultSets
          : undefined,
      defaultReps:
        isValidOptionalNumber(item.defaultReps) || item.defaultReps === null
          ? item.defaultReps
          : undefined,
    })
  }

  return deduped
}

function sanitizeRoutine(input: Routine, existing?: Routine): Routine {
  const now = new Date().toISOString()
  const name = input.name.trim()

  return {
    id: input.id.trim(),
    clientUuid:
      (typeof input.clientUuid === 'string' && input.clientUuid.trim()) || existing?.clientUuid,
    name,
    description:
      typeof input.description === 'string' || input.description === null
        ? input.description
        : existing?.description,
    color: typeof input.color === 'string' || input.color === null ? input.color : existing?.color,
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    deletedAt:
      typeof input.deletedAt === 'string' || input.deletedAt === null
        ? input.deletedAt
        : existing?.deletedAt,
    dirty: input.dirty === false ? false : true,
    pinned: input.pinned === true ? true : undefined,
    items: normalizeRoutineItems(input.items),
  }
}

function parseRoutines(raw: string | null): Routine[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const normalized: Routine[] = []

    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue

      const candidate = value as Partial<Routine> & { items?: unknown[] }
      const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
      const createdAt =
        typeof candidate.createdAt === 'string' && candidate.createdAt
          ? candidate.createdAt
          : new Date(0).toISOString()
      const updatedAt =
        typeof candidate.updatedAt === 'string' && candidate.updatedAt
          ? candidate.updatedAt
          : createdAt
      const pinned = candidate.pinned === true ? true : undefined
      const clientUuid =
        typeof candidate.clientUuid === 'string' && candidate.clientUuid.trim()
          ? candidate.clientUuid.trim()
          : undefined
      const description =
        typeof candidate.description === 'string' || candidate.description === null
          ? candidate.description
          : undefined
      const color =
        typeof candidate.color === 'string' || candidate.color === null
          ? candidate.color
          : undefined
      const deletedAt =
        typeof candidate.deletedAt === 'string' || candidate.deletedAt === null
          ? candidate.deletedAt
          : undefined
      const dirty = candidate.dirty === true ? true : false

      if (!id || !name) continue

      const parsedItems: RoutineItem[] = Array.isArray(candidate.items)
        ? candidate.items
            .map((item): RoutineItem | null => {
              if (!item || typeof item !== 'object') return null

              const parsedItem = item as Partial<RoutineItem>
              const exerciseDefinitionId =
                typeof parsedItem.exerciseDefinitionId === 'string'
                  ? parsedItem.exerciseDefinitionId.trim()
                  : ''
              const orderIndex =
                typeof parsedItem.orderIndex === 'number' && Number.isFinite(parsedItem.orderIndex)
                  ? parsedItem.orderIndex
                  : 0

              if (!exerciseDefinitionId) return null

              return {
                exerciseDefinitionId,
                orderIndex,
                section: normalizeRoutineSection(parsedItem.section),
                clientUuid:
                  typeof parsedItem.clientUuid === 'string' && parsedItem.clientUuid.trim()
                    ? parsedItem.clientUuid.trim()
                    : undefined,
                updatedAt:
                  typeof parsedItem.updatedAt === 'string' && parsedItem.updatedAt
                    ? parsedItem.updatedAt
                    : undefined,
                defaultSets:
                  isValidOptionalNumber(parsedItem.defaultSets) || parsedItem.defaultSets === null
                    ? parsedItem.defaultSets
                    : undefined,
                defaultReps:
                  isValidOptionalNumber(parsedItem.defaultReps) || parsedItem.defaultReps === null
                    ? parsedItem.defaultReps
                    : undefined,
              }
            })
            .filter((entry): entry is RoutineItem => entry !== null)
        : []

      normalized.push({
        id,
        clientUuid,
        name,
        description,
        color,
        createdAt,
        updatedAt,
        deletedAt,
        dirty,
        pinned,
        items: normalizeRoutineItems(parsedItems),
      })
    }

    return normalized.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

function parseRoutineUsage(raw: string | null): RoutineUsageMap {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalized: RoutineUsageMap = {}

    for (const [routineId, value] of Object.entries(parsed)) {
      if (!routineId || !value || typeof value !== 'object') continue

      const entry = value as Partial<RoutineUsageEntry>
      const usedCount = Number.isFinite(entry.usedCount)
        ? Math.max(0, Math.round(entry.usedCount as number))
        : 0
      const lastUsedAt =
        typeof entry.lastUsedAt === 'string' && entry.lastUsedAt
          ? entry.lastUsedAt
          : new Date(0).toISOString()

      if (usedCount <= 0) continue

      normalized[routineId] = {
        usedCount,
        lastUsedAt,
      }
    }

    return normalized
  } catch {
    return {}
  }
}

async function persistRoutines(userId: string, routines: Routine[]): Promise<void> {
  if (!userId) return

  try {
    await SecureStore.setItemAsync(getRoutinesKey(userId), JSON.stringify(routines))
  } catch {
    // Persistence failures should never crash app usage.
  }
}

async function persistRoutineUsage(userId: string, usage: RoutineUsageMap): Promise<void> {
  if (!userId) return

  try {
    await SecureStore.setItemAsync(getRoutineUsageKey(userId), JSON.stringify(usage))
  } catch {
    // Persistence failures should never crash app usage.
  }
}

async function deleteRoutineStorageKey(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key)
  } catch {
    // Persistence failures should never crash app usage.
  }
}

export async function loadRoutines(userId: string): Promise<Routine[]> {
  if (!userId) return []

  try {
    const primaryRaw = await SecureStore.getItemAsync(getRoutinesKey(userId))
    const parsedPrimary = parseRoutines(primaryRaw)
    if (primaryRaw !== null) {
      return parsedPrimary
    }

    const legacyRaw = await SecureStore.getItemAsync(getLegacyRoutinesKey(userId))
    const migrated = parseRoutines(legacyRaw)
    if (migrated.length > 0) {
      await persistRoutines(userId, migrated)
    }

    return migrated
  } catch {
    return []
  }
}

export async function loadRoutineUsage(userId: string): Promise<RoutineUsageMap> {
  if (!userId) return {}

  try {
    const raw = await SecureStore.getItemAsync(getRoutineUsageKey(userId))
    return parseRoutineUsage(raw)
  } catch {
    return {}
  }
}

export async function replaceRoutinesSnapshot(userId: string, routines: Routine[]): Promise<void> {
  if (!userId) return

  const normalized = routines
    .map((routine) => ({
      ...routine,
      id: routine.id.trim(),
      clientUuid:
        typeof routine.clientUuid === 'string' && routine.clientUuid.trim()
          ? routine.clientUuid.trim()
          : undefined,
      name: routine.name.trim(),
      dirty: routine.dirty === true ? true : false,
      items: normalizeRoutineItems(routine.items),
    }))
    .filter((routine) => routine.id && routine.name && routine.items.length > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  await persistRoutines(userId, normalized)
}

export async function replaceRoutineUsageSnapshot(
  userId: string,
  usage: RoutineUsageMap,
): Promise<void> {
  await persistRoutineUsage(userId, usage)
}

export async function clearRoutinesCache(userId: string): Promise<void> {
  if (!userId) return

  await Promise.all([
    deleteRoutineStorageKey(getRoutinesKey(userId)),
    deleteRoutineStorageKey(getLegacyRoutinesKey(userId)),
    deleteRoutineStorageKey(getRoutineUsageKey(userId)),
  ])
}

export async function upsertRoutine(userId: string, routine: Routine): Promise<void> {
  if (!userId) return

  const routineId = routine.id.trim()
  if (!routineId) return

  const allRoutines = await loadRoutines(userId)
  const existing = allRoutines.find((entry) => entry.id === routineId)
  const candidate = sanitizeRoutine({ ...routine, id: routineId }, existing)

  if (!candidate.name || candidate.items.length === 0) {
    return
  }

  const duplicateName = allRoutines.find(
    (entry) =>
      entry.id !== candidate.id && entry.name.trim().toLowerCase() === candidate.name.toLowerCase(),
  )

  if (duplicateName) {
    throw new Error('A routine with this name already exists.')
  }

  const nextRoutines = existing
    ? allRoutines.map((entry) => (entry.id === candidate.id ? candidate : entry))
    : [candidate, ...allRoutines]

  await persistRoutines(userId, nextRoutines)
}

export async function saveRoutine(userId: string, routine: Routine): Promise<void> {
  await upsertRoutine(userId, routine)
}

export async function deleteRoutine(userId: string, routineId: string): Promise<void> {
  if (!userId || !routineId) return

  const [allRoutines, usage] = await Promise.all([loadRoutines(userId), loadRoutineUsage(userId)])
  const nextRoutines = allRoutines.filter((entry) => entry.id !== routineId)

  if (usage[routineId]) {
    const nextUsage = { ...usage }
    delete nextUsage[routineId]
    await persistRoutineUsage(userId, nextUsage)
  }

  await persistRoutines(userId, nextRoutines)
}

export async function setPinnedRoutine(
  userId: string,
  routineId: string,
  pinned: boolean,
): Promise<void> {
  if (!userId || !routineId) return

  const allRoutines = await loadRoutines(userId)
  const target = allRoutines.find((entry) => entry.id === routineId)
  if (!target) return

  await upsertRoutine(userId, {
    ...target,
    pinned,
  })
}

export async function bumpRoutineUsage(userId: string, routineId: string): Promise<void> {
  if (!userId || !routineId) return

  const usage = await loadRoutineUsage(userId)
  const now = new Date().toISOString()
  const current = usage[routineId]

  const next: RoutineUsageMap = {
    ...usage,
    [routineId]: {
      usedCount: (current?.usedCount ?? 0) + 1,
      lastUsedAt: now,
    },
  }

  await persistRoutineUsage(userId, next)
}

export async function reorderRoutineItems(
  userId: string,
  routineId: string,
  orderedIds: string[],
): Promise<void> {
  if (!userId || !routineId) return

  const allRoutines = await loadRoutines(userId)
  const target = allRoutines.find((entry) => entry.id === routineId)
  if (!target) return

  const uniqueOrderedIds: string[] = []
  for (const id of orderedIds) {
    const trimmed = id.trim()
    if (!trimmed || uniqueOrderedIds.includes(trimmed)) continue
    uniqueOrderedIds.push(trimmed)
  }

  const itemsByDefinitionId = new Map(
    target.items.map((item) => [item.exerciseDefinitionId, item] as const),
  )

  const reordered: RoutineItem[] = []

  for (const exerciseDefinitionId of uniqueOrderedIds) {
    const item = itemsByDefinitionId.get(exerciseDefinitionId)
    if (!item) continue

    reordered.push(item)
    itemsByDefinitionId.delete(exerciseDefinitionId)
  }

  const remaining = Array.from(itemsByDefinitionId.values()).sort(
    (a, b) => a.orderIndex - b.orderIndex,
  )

  const orderedItems = [...reordered, ...remaining].map((item, index) => ({
    ...item,
    orderIndex: index,
  }))

  await upsertRoutine(userId, {
    ...target,
    items: orderedItems,
  })
}
