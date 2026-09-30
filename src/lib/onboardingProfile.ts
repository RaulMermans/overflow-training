import * as SecureStore from 'expo-secure-store'

export type Intention = 'strength' | 'conditioning' | 'mobility' | 'consistency' | 'rehab' | 'other'

export type Equipment =
  | 'bodyweight'
  | 'dumbbells'
  | 'barbell'
  | 'cables'
  | 'machines'
  | 'bands'
  | 'kettlebell'

export const VALID_EQUIPMENT: Equipment[] = [
  'bodyweight',
  'dumbbells',
  'barbell',
  'cables',
  'machines',
  'bands',
  'kettlebell',
]

export interface OnboardingProfile {
  intention: Intention
  weeklyGoal: number
  weeklyGoalUpdatedAt?: string
  equipment: Equipment[]
}

const KEY_PREFIX = 'onboarding.profile.v1'

const VALID_INTENTIONS: Intention[] = [
  'strength',
  'conditioning',
  'mobility',
  'consistency',
  'rehab',
  'other',
]

const DEFAULTS: OnboardingProfile = {
  intention: 'consistency',
  weeklyGoal: 4,
  weeklyGoalUpdatedAt: undefined,
  equipment: [],
}

function getKey(userId: string): string {
  return `${KEY_PREFIX}.${userId}`
}

function coerce(value: unknown): OnboardingProfile {
  if (!value || typeof value !== 'object') return { ...DEFAULTS }

  const record = value as Partial<OnboardingProfile>

  const intention: Intention =
    typeof record.intention === 'string' && VALID_INTENTIONS.includes(record.intention as Intention)
      ? (record.intention as Intention)
      : DEFAULTS.intention

  const rawGoal = Number(record.weeklyGoal)
  const weeklyGoal =
    Number.isFinite(rawGoal) && rawGoal >= 0 && rawGoal <= 14
      ? Math.round(rawGoal)
      : DEFAULTS.weeklyGoal

  const weeklyGoalUpdatedAt =
    typeof record.weeklyGoalUpdatedAt === 'string' && record.weeklyGoalUpdatedAt
      ? record.weeklyGoalUpdatedAt
      : undefined

  const equipment: Equipment[] = Array.isArray(record.equipment)
    ? (record.equipment as string[]).filter((e): e is Equipment =>
        VALID_EQUIPMENT.includes(e as Equipment),
      )
    : []

  return { intention, weeklyGoal, weeklyGoalUpdatedAt, equipment }
}

export async function loadOnboardingProfile(userId: string): Promise<OnboardingProfile> {
  if (!userId) return { ...DEFAULTS }

  try {
    const raw = await SecureStore.getItemAsync(getKey(userId))
    if (!raw) return { ...DEFAULTS }
    return coerce(JSON.parse(raw))
  } catch {
    return { ...DEFAULTS }
  }
}

export async function saveOnboardingProfile(
  userId: string,
  patch: Partial<OnboardingProfile>,
): Promise<void> {
  if (!userId) return

  try {
    const current = await loadOnboardingProfile(userId)
    const hasWeeklyGoalPatch = Object.prototype.hasOwnProperty.call(patch, 'weeklyGoal')
    const merged = coerce({
      ...current,
      ...patch,
      weeklyGoalUpdatedAt: hasWeeklyGoalPatch
        ? (patch.weeklyGoalUpdatedAt ?? new Date().toISOString())
        : (patch.weeklyGoalUpdatedAt ?? current.weeklyGoalUpdatedAt),
    })
    await SecureStore.setItemAsync(getKey(userId), JSON.stringify(merged))
  } catch {
    // Persistence failures should never crash the app.
  }
}
