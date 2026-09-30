import { loadWeeklyWorkoutsGoal, saveWeeklyWorkoutsGoal } from '../src/db/userSettings'
import { loadOnboardingProfile, saveOnboardingProfile } from '../src/lib/onboardingProfile'
import { requireSupabase } from '../src/lib/supabaseClient'
import { withTimeout } from '../src/lib/withTimeout'

jest.mock('../src/lib/supabaseClient', () => {
  const actual = jest.requireActual('../src/lib/supabaseClient')
  return {
    ...actual,
    requireSupabase: jest.fn(),
  }
})

jest.mock('../src/lib/onboardingProfile', () => ({
  loadOnboardingProfile: jest.fn(),
  saveOnboardingProfile: jest.fn(async () => undefined),
}))

jest.mock('../src/lib/withTimeout', () => ({
  withTimeout: jest.fn(async (promise: PromiseLike<unknown>) => promise),
}))

const requireSupabaseMock = requireSupabase as jest.MockedFunction<typeof requireSupabase>
const loadOnboardingProfileMock = loadOnboardingProfile as jest.MockedFunction<
  typeof loadOnboardingProfile
>
const saveOnboardingProfileMock = saveOnboardingProfile as jest.MockedFunction<
  typeof saveOnboardingProfile
>
const withTimeoutMock = withTimeout as jest.MockedFunction<typeof withTimeout>

function buildUserSettingsClient(input: {
  selectResult: { data: unknown; error: unknown }
  upsertResult?: { data: unknown; error: unknown }
}) {
  const selectMaybeSingle = jest.fn(async () => input.selectResult)
  const eq = jest.fn(() => ({ maybeSingle: selectMaybeSingle }))
  const select = jest.fn(() => ({ eq, maybeSingle: selectMaybeSingle }))

  const upsertMaybeSingle = jest.fn(async () => input.upsertResult ?? { data: null, error: null })
  const upsertSelect = jest.fn(() => ({ maybeSingle: upsertMaybeSingle }))
  const upsert = jest.fn(() => ({ select: upsertSelect }))

  const from = jest.fn(() => ({ select, upsert }))

  return {
    client: { from } as unknown as ReturnType<typeof requireSupabase>,
    mocks: {
      from,
      select,
      eq,
      selectMaybeSingle,
      upsert,
      upsertSelect,
      upsertMaybeSingle,
    },
  }
}

describe('user settings db', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withTimeoutMock.mockImplementation(async (promise) => promise)
    loadOnboardingProfileMock.mockResolvedValue({
      intention: 'consistency',
      weeklyGoal: 4,
      weeklyGoalUpdatedAt: '2026-02-01T00:00:00.000Z',
    })
  })

  it('falls back to local weekly goal when remote fetch fails', async () => {
    const { client } = buildUserSettingsClient({
      selectResult: { data: null, error: { message: 'network down' } },
    })
    requireSupabaseMock.mockReturnValue(client)
    loadOnboardingProfileMock.mockResolvedValue({
      intention: 'consistency',
      weeklyGoal: 5,
      weeklyGoalUpdatedAt: '2026-02-10T00:00:00.000Z',
    })

    const goal = await loadWeeklyWorkoutsGoal('user-1')

    expect(goal).toBe(5)
    expect(saveOnboardingProfileMock).not.toHaveBeenCalled()
  })

  it('saves locally before remote upsert for weekly goal updates', async () => {
    const { client, mocks } = buildUserSettingsClient({
      selectResult: { data: null, error: null },
      upsertResult: {
        data: {
          user_id: 'user-1',
          weekly_workouts_goal: 6,
          updated_at: '2026-02-11T00:00:00.000Z',
        },
        error: null,
      },
    })
    requireSupabaseMock.mockReturnValue(client)

    const goal = await saveWeeklyWorkoutsGoal('user-1', 6)

    expect(goal).toBe(6)
    expect(saveOnboardingProfileMock).toHaveBeenCalled()
    const firstCall = saveOnboardingProfileMock.mock.calls[0]
    expect(firstCall[0]).toBe('user-1')
    expect((firstCall[1] as { weeklyGoal?: number }).weeklyGoal).toBe(6)
    const firstUpsertCall = mocks.upsert.mock.calls[0]
    const firstUpsertPayload = firstUpsertCall[0] as {
      user_id?: string
      weekly_workouts_goal?: number
    }
    expect(firstUpsertPayload.user_id).toBe('user-1')
    expect(firstUpsertPayload.weekly_workouts_goal).toBe(6)
    expect(firstUpsertCall[1]).toEqual({ onConflict: 'user_id' })
  })

  it('prefers local value when local timestamp is newer than remote and pushes it upstream', async () => {
    const { client, mocks } = buildUserSettingsClient({
      selectResult: {
        data: {
          user_id: 'user-1',
          weekly_workouts_goal: 4,
          updated_at: '2026-02-01T00:00:00.000Z',
        },
        error: null,
      },
      upsertResult: {
        data: {
          user_id: 'user-1',
          weekly_workouts_goal: 5,
          updated_at: '2026-02-10T00:00:00.000Z',
        },
        error: null,
      },
    })
    requireSupabaseMock.mockReturnValue(client)
    loadOnboardingProfileMock.mockResolvedValue({
      intention: 'consistency',
      weeklyGoal: 5,
      weeklyGoalUpdatedAt: '2026-02-10T00:00:00.000Z',
    })

    const goal = await loadWeeklyWorkoutsGoal('user-1')

    expect(goal).toBe(5)
    const firstUpsertCall = mocks.upsert.mock.calls[0]
    const firstUpsertPayload = firstUpsertCall[0] as {
      user_id?: string
      weekly_workouts_goal?: number
    }
    expect(firstUpsertPayload.user_id).toBe('user-1')
    expect(firstUpsertPayload.weekly_workouts_goal).toBe(5)
    expect(firstUpsertCall[1]).toEqual({ onConflict: 'user_id' })
  })
})
