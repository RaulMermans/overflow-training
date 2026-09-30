import * as SecureStore from 'expo-secure-store'
import type { ProgramExerciseType, ProgramWeekdayKey } from '../programs/types'

const WORKOUT_META_KEY_PREFIX = 'workout.meta.v1'

export type WorkoutProgramTarget = {
  slug: string
  exerciseDefinitionId: string
  sets: number
  reps: number
  type: ProgramExerciseType
  restSeconds?: number
}

export type WorkoutProgramContext = {
  programId: string
  programNameKey: string
  workoutTemplateId: string
  workoutNameKey: string
  dayKey: ProgramWeekdayKey
  targets: WorkoutProgramTarget[]
}

type WorkoutMetaEntry = {
  routineId?: string
  createdFrom?: 'routine' | 'manual'
  createdAt: string
  programContext?: WorkoutProgramContext
}

export type WorkoutMetaMap = Record<string, WorkoutMetaEntry>

function getWorkoutMetaKey(userId: string): string {
  return `${WORKOUT_META_KEY_PREFIX}.${userId}`
}

function parseProgramDayKey(value: unknown): ProgramWeekdayKey | null {
  const day = typeof value === 'string' ? value : ''
  switch (day) {
    case 'mon':
    case 'tue':
    case 'wed':
    case 'thu':
    case 'fri':
    case 'sat':
    case 'sun':
      return day
    default:
      return null
  }
}

function parseProgramContext(value: unknown): WorkoutProgramContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const candidate = value as Partial<WorkoutProgramContext>
  const programId = typeof candidate.programId === 'string' ? candidate.programId.trim() : ''
  const programNameKey =
    typeof candidate.programNameKey === 'string' ? candidate.programNameKey.trim() : ''
  const workoutTemplateId =
    typeof candidate.workoutTemplateId === 'string' ? candidate.workoutTemplateId.trim() : ''
  const workoutNameKey =
    typeof candidate.workoutNameKey === 'string' ? candidate.workoutNameKey.trim() : ''
  const dayKey = parseProgramDayKey(candidate.dayKey)

  if (!programId || !programNameKey || !workoutTemplateId || !workoutNameKey || !dayKey) {
    return undefined
  }

  const targets: WorkoutProgramTarget[] = Array.isArray(candidate.targets)
    ? candidate.targets
        .map((target): WorkoutProgramTarget | null => {
          if (!target || typeof target !== 'object') return null

          const parsed = target as Partial<WorkoutProgramTarget>
          const slug = typeof parsed.slug === 'string' ? parsed.slug.trim() : ''
          const exerciseDefinitionId =
            typeof parsed.exerciseDefinitionId === 'string'
              ? parsed.exerciseDefinitionId.trim()
              : ''
          const sets = Number(parsed.sets)
          const reps = Number(parsed.reps)
          const type =
            parsed.type === 'compound' || parsed.type === 'accessory' ? parsed.type : null

          if (!slug || !exerciseDefinitionId || !type) return null
          if (!Number.isFinite(sets) || sets < 1) return null
          if (!Number.isFinite(reps) || reps < 1) return null

          const restSeconds = Number(parsed.restSeconds)

          return {
            slug,
            exerciseDefinitionId,
            sets: Math.round(sets),
            reps: Math.round(reps),
            type,
            restSeconds:
              Number.isFinite(restSeconds) && restSeconds > 0 ? Math.round(restSeconds) : undefined,
          }
        })
        .filter((target): target is WorkoutProgramTarget => target !== null)
    : []

  if (targets.length === 0) {
    return undefined
  }

  return {
    programId,
    programNameKey,
    workoutTemplateId,
    workoutNameKey,
    dayKey,
    targets,
  }
}

function parseWorkoutMeta(raw: string | null): WorkoutMetaMap {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalized: WorkoutMetaMap = {}

    for (const [workoutId, value] of Object.entries(parsed)) {
      if (!workoutId || !value || typeof value !== 'object') continue

      const entry = value as Partial<WorkoutMetaEntry>
      const routineId = typeof entry.routineId === 'string' ? entry.routineId.trim() : undefined
      const createdFrom =
        entry.createdFrom === 'routine' || entry.createdFrom === 'manual'
          ? entry.createdFrom
          : undefined
      const createdAt =
        typeof entry.createdAt === 'string' && entry.createdAt
          ? entry.createdAt
          : new Date(0).toISOString()
      const programContext = parseProgramContext(entry.programContext)

      normalized[workoutId] = {
        createdAt,
        routineId: routineId || undefined,
        createdFrom,
        programContext,
      }
    }

    return normalized
  } catch {
    return {}
  }
}

async function persistWorkoutMeta(userId: string, meta: WorkoutMetaMap): Promise<void> {
  if (!userId) return

  try {
    await SecureStore.setItemAsync(getWorkoutMetaKey(userId), JSON.stringify(meta))
  } catch {
    // Persistence failures should not crash app usage.
  }
}

export async function loadWorkoutMeta(userId: string): Promise<WorkoutMetaMap> {
  if (!userId) return {}

  try {
    const raw = await SecureStore.getItemAsync(getWorkoutMetaKey(userId))
    return parseWorkoutMeta(raw)
  } catch {
    return {}
  }
}

export async function setWorkoutRoutine(
  userId: string,
  workoutId: string,
  routineId: string,
): Promise<void> {
  if (!userId || !workoutId || !routineId) return

  const current = await loadWorkoutMeta(userId)
  const now = new Date().toISOString()

  const next: WorkoutMetaMap = {
    ...current,
    [workoutId]: {
      ...current[workoutId],
      routineId,
      createdFrom: 'routine',
      createdAt: current[workoutId]?.createdAt ?? now,
    },
  }

  await persistWorkoutMeta(userId, next)
}

export async function getWorkoutRoutine(userId: string, workoutId: string): Promise<string | null> {
  if (!userId || !workoutId) return null

  const current = await loadWorkoutMeta(userId)
  return current[workoutId]?.routineId ?? null
}

export async function setWorkoutCreatedFromManual(
  userId: string,
  workoutId: string,
): Promise<void> {
  if (!userId || !workoutId) return

  const current = await loadWorkoutMeta(userId)
  const now = new Date().toISOString()

  const next: WorkoutMetaMap = {
    ...current,
    [workoutId]: {
      ...current[workoutId],
      createdFrom: 'manual',
      createdAt: current[workoutId]?.createdAt ?? now,
    },
  }

  await persistWorkoutMeta(userId, next)
}

export async function setWorkoutProgramContext(
  userId: string,
  workoutId: string,
  programContext: WorkoutProgramContext,
): Promise<void> {
  if (!userId || !workoutId) return

  const normalizedContext = parseProgramContext(programContext)
  if (!normalizedContext) return

  const current = await loadWorkoutMeta(userId)
  const now = new Date().toISOString()

  const next: WorkoutMetaMap = {
    ...current,
    [workoutId]: {
      ...current[workoutId],
      programContext: normalizedContext,
      createdAt: current[workoutId]?.createdAt ?? now,
    },
  }

  await persistWorkoutMeta(userId, next)
}

export async function getWorkoutProgramContext(
  userId: string,
  workoutId: string,
): Promise<WorkoutProgramContext | null> {
  if (!userId || !workoutId) return null

  const current = await loadWorkoutMeta(userId)
  return current[workoutId]?.programContext ?? null
}
