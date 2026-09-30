import * as SecureStore from 'expo-secure-store'

const ACTIVE_PROGRAM_KEY_PREFIX = 'programs.active.v1'

export interface ActiveProgramState {
  programId: string
  selectedAt: string
}

function getActiveProgramKey(userId: string): string {
  return `${ACTIVE_PROGRAM_KEY_PREFIX}.${userId}`
}

function parseActiveProgram(raw: string | null): ActiveProgramState | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    const programId =
      typeof (parsed as ActiveProgramState).programId === 'string'
        ? (parsed as ActiveProgramState).programId.trim()
        : ''
    const selectedAt =
      typeof (parsed as ActiveProgramState).selectedAt === 'string' &&
      (parsed as ActiveProgramState).selectedAt
        ? (parsed as ActiveProgramState).selectedAt
        : new Date(0).toISOString()

    if (!programId) return null

    return {
      programId,
      selectedAt,
    }
  } catch {
    return null
  }
}

export async function loadActiveProgram(userId: string): Promise<ActiveProgramState | null> {
  if (!userId) return null

  try {
    const raw = await SecureStore.getItemAsync(getActiveProgramKey(userId))
    return parseActiveProgram(raw)
  } catch {
    return null
  }
}

export async function setActiveProgram(userId: string, programId: string): Promise<void> {
  if (!userId) return

  const trimmedProgramId = programId.trim()
  if (!trimmedProgramId) return

  const payload: ActiveProgramState = {
    programId: trimmedProgramId,
    selectedAt: new Date().toISOString(),
  }

  try {
    await SecureStore.setItemAsync(getActiveProgramKey(userId), JSON.stringify(payload))
  } catch {
    // Persistence failures should not block usage.
  }
}

export async function clearActiveProgram(userId: string): Promise<void> {
  if (!userId) return

  try {
    await SecureStore.deleteItemAsync(getActiveProgramKey(userId))
  } catch {
    // Persistence failures should not block usage.
  }
}
