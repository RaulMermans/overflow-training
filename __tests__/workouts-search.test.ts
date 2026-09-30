jest.mock('../src/lib/supabaseClient', () => {
  const actual = jest.requireActual('../src/lib/supabaseClient')
  return {
    ...actual,
    requireSupabase: jest.fn(),
  }
})

import { requireSupabase } from '../src/lib/supabaseClient'
import { searchExerciseDefinitionsScoped } from '../src/db/workouts'

type QueryResponse = {
  data: unknown | null
  error: { message?: string | null } | null
}

function createMockQueryBuilder(response: QueryResponse) {
  const builder: {
    select: jest.Mock
    eq: jest.Mock
    contains: jest.Mock
    ilike: jest.Mock
    or: jest.Mock
    limit: jest.Mock
    order: jest.Mock
    maybeSingle: jest.Mock
    range: jest.Mock
  } = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    contains: jest.fn(() => builder),
    ilike: jest.fn(() => builder),
    or: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    order: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => response),
    range: jest.fn(async () => response),
  }

  return builder
}

function createMockClient(responses: QueryResponse[]) {
  const builders: Array<ReturnType<typeof createMockQueryBuilder>> = []
  const from = jest.fn(() => {
    const response = responses.shift() ?? { data: [], error: null }
    const builder = createMockQueryBuilder(response)
    builders.push(builder)
    return builder
  })

  return {
    client: { from },
    builders,
  }
}

describe('searchExerciseDefinitionsScoped', () => {
  const requireSupabaseMock = requireSupabase as jest.Mock

  beforeEach(() => {
    requireSupabaseMock.mockReset()
  })

  it('returns empty data when scope is incomplete', async () => {
    const result = await searchExerciseDefinitionsScoped({ query: 'row' })

    expect(requireSupabaseMock).not.toHaveBeenCalled()
    expect(result).toEqual({ data: [], error: null })
  })

  it('returns empty data when strength has no query and no focus target', async () => {
    const result = await searchExerciseDefinitionsScoped({
      category: 'strength',
      query: '',
      target: null,
    })

    expect(requireSupabaseMock).not.toHaveBeenCalled()
    expect(result).toEqual({ data: [], error: null })
  })

  it('does not short-circuit warmup when no query and no focus target', async () => {
    const { client, builders } = createMockClient([
      {
        data: [{ id: 'warmup-1', name: 'warmup option' }],
        error: null,
      },
    ])
    requireSupabaseMock.mockReturnValue(client)

    const result = await searchExerciseDefinitionsScoped({
      category: 'warmup',
      query: '',
      target: null,
    })

    expect(client.from).toHaveBeenCalledWith('exercise_definitions')
    expect(builders[0].eq).toHaveBeenCalledWith('category', 'warmup')
    expect(builders[0].contains).not.toHaveBeenCalled()
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
  })

  it('does not short-circuit stretch when no query and no focus target', async () => {
    const { client, builders } = createMockClient([
      {
        data: [{ id: 'stretch-1', name: 'stretch option' }],
        error: null,
      },
    ])
    requireSupabaseMock.mockReturnValue(client)

    const result = await searchExerciseDefinitionsScoped({
      category: 'stretch',
      query: '',
      target: null,
    })

    expect(client.from).toHaveBeenCalledWith('exercise_definitions')
    expect(builders[0].eq).toHaveBeenCalledWith('category', 'stretch')
    expect(builders[0].contains).not.toHaveBeenCalled()
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
  })

  it('does not short-circuit mobility when no query and no focus target', async () => {
    const { client, builders } = createMockClient([
      {
        data: [{ id: 'mobility-1', name: 'mobility option' }],
        error: null,
      },
    ])
    requireSupabaseMock.mockReturnValue(client)

    const result = await searchExerciseDefinitionsScoped({
      category: 'mobility',
      query: '',
      target: null,
    })

    expect(client.from).toHaveBeenCalledWith('exercise_definitions')
    expect(builders[0].eq).toHaveBeenCalledWith('category', 'mobility')
    expect(builders[0].contains).not.toHaveBeenCalled()
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
  })

  it('uses structured scope filters when primary target columns are available', async () => {
    const { client, builders } = createMockClient([
      {
        data: [{ id: 'bench-press', name: 'Bench Press' }],
        error: null,
      },
    ])
    requireSupabaseMock.mockReturnValue(client)

    const result = await searchExerciseDefinitionsScoped({
      category: 'strength',
      target: 'chest',
      query: 'bench',
      limit: 20,
    })

    expect(client.from).toHaveBeenCalledWith('exercise_definitions')
    expect(builders[0].eq).toHaveBeenCalledWith('category', 'strength')
    expect(builders[0].contains).toHaveBeenCalledWith('primary_targets', ['chest'])
    expect(builders[0].or).toHaveBeenCalledTimes(1)
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
  })

  it('falls back to muscle_group search when structured filter columns are unavailable', async () => {
    const { client, builders } = createMockClient([
      {
        data: null,
        error: { message: 'column exercise_definitions.primary_targets does not exist' },
      },
      {
        data: [{ id: 'fly', name: 'Machine Fly' }],
        error: null,
      },
    ])
    requireSupabaseMock.mockReturnValue(client)

    const result = await searchExerciseDefinitionsScoped({
      category: 'strength',
      target: 'chest',
      query: '',
    })

    expect(client.from).toHaveBeenCalledTimes(2)
    expect(builders[1].eq).toHaveBeenCalledWith('category', 'strength')
    expect(builders[1].ilike).toHaveBeenCalledWith('muscle_group', '%chest%')
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
  })

  it('returns the structured error when fallback conditions are not met', async () => {
    const { client } = createMockClient([
      {
        data: null,
        error: { message: 'permission denied for table exercise_definitions' },
      },
    ])
    requireSupabaseMock.mockReturnValue(client)

    const result = await searchExerciseDefinitionsScoped({
      category: 'strength',
      target: 'chest',
      query: 'bench',
    })

    expect(client.from).toHaveBeenCalledTimes(1)
    expect(result.data).toEqual([])
    expect(result.error?.message).toContain('permission denied')
  })
})
