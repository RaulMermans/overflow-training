import * as SecureStore from 'expo-secure-store'

const EXERCISE_DEFAULTS_KEY_PREFIX = 'exercise.defaults.v1'
const MIN_DEFAULT_SETS = 2
const MAX_DEFAULT_SETS = 6
const MIN_DEFAULT_REPS = 1
const MAX_DEFAULT_REPS = 999

export type ExerciseDefault = {
  defaultSets?: number
  defaultReps?: number
}

export type ExerciseDefaultsMap = Record<string, ExerciseDefault>

function getExerciseDefaultsKey(userId: string): string {
  return `${EXERCISE_DEFAULTS_KEY_PREFIX}.${userId}`
}

function normalizeDefaultSets(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined

  const rounded = Math.round(value)
  if (rounded < MIN_DEFAULT_SETS || rounded > MAX_DEFAULT_SETS) return undefined
  return rounded
}

function normalizeDefaultReps(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined

  const rounded = Math.round(value)
  if (rounded < MIN_DEFAULT_REPS || rounded > MAX_DEFAULT_REPS) return undefined
  return rounded
}

function parseExerciseDefaults(raw: string | null): ExerciseDefaultsMap {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalized: ExerciseDefaultsMap = {}

    for (const [definitionId, value] of Object.entries(parsed)) {
      if (!definitionId || !value || typeof value !== 'object') continue

      const record = value as Partial<ExerciseDefault>
      const defaultSets = normalizeDefaultSets(record.defaultSets)
      const defaultReps = normalizeDefaultReps(record.defaultReps)

      if (defaultSets === undefined && defaultReps === undefined) continue

      normalized[definitionId] = {
        defaultSets,
        defaultReps,
      }
    }

    return normalized
  } catch {
    return {}
  }
}

async function persistExerciseDefaults(
  userId: string,
  defaults: ExerciseDefaultsMap,
): Promise<void> {
  if (!userId) return

  try {
    await SecureStore.setItemAsync(getExerciseDefaultsKey(userId), JSON.stringify(defaults))
  } catch {
    // Persistence failures should never crash app usage.
  }
}

export async function loadExerciseDefaults(userId: string): Promise<ExerciseDefaultsMap> {
  if (!userId) return {}

  try {
    const raw = await SecureStore.getItemAsync(getExerciseDefaultsKey(userId))
    return parseExerciseDefaults(raw)
  } catch {
    return {}
  }
}

export async function setExerciseDefault(
  userId: string,
  exerciseDefinitionId: string,
  patch: ExerciseDefault,
): Promise<void> {
  if (!userId) return

  const trimmedId = exerciseDefinitionId.trim()
  if (!trimmedId) return

  const current = await loadExerciseDefaults(userId)
  const existing = current[trimmedId] ?? {}

  const nextSets =
    patch.defaultSets === undefined ? existing.defaultSets : normalizeDefaultSets(patch.defaultSets)
  const nextReps =
    patch.defaultReps === undefined ? existing.defaultReps : normalizeDefaultReps(patch.defaultReps)

  const next = { ...current }

  if (nextSets === undefined && nextReps === undefined) {
    delete next[trimmedId]
  } else {
    next[trimmedId] = {
      defaultSets: nextSets,
      defaultReps: nextReps,
    }
  }

  await persistExerciseDefaults(userId, next)
}

export async function getExerciseDefault(
  userId: string,
  exerciseDefinitionId: string,
): Promise<ExerciseDefault | null> {
  if (!userId) return null

  const trimmedId = exerciseDefinitionId.trim()
  if (!trimmedId) return null

  const current = await loadExerciseDefaults(userId)
  return current[trimmedId] ?? null
}

export const EXERCISE_DEFAULTS_LIMITS = {
  minSets: MIN_DEFAULT_SETS,
  maxSets: MAX_DEFAULT_SETS,
  minReps: MIN_DEFAULT_REPS,
  maxReps: MAX_DEFAULT_REPS,
} as const
