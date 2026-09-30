import { DatabaseError, normalizeDbResult } from '../src/lib/supabaseClient'

describe('supabase error normalization', () => {
  it('preserves metadata from database-shaped errors', () => {
    const result = normalizeDbResult({
      data: null,
      error: {
        message: 'violates not-null constraint',
        code: '23502',
        details: 'Failing row contains null value.',
        hint: 'Provide a value.',
        status: 400,
      },
    })

    expect(result.data).toBeNull()
    expect(result.error).toBeInstanceOf(DatabaseError)
    expect(result.error?.message).toBe('violates not-null constraint')

    const typed = result.error as DatabaseError
    expect(typed.code).toBe('23502')
    expect(typed.details).toBe('Failing row contains null value.')
    expect(typed.hint).toBe('Provide a value.')
    expect(typed.status).toBe(400)
  })

  it('passes through Error instances unchanged', () => {
    const original = new Error('network request failed')
    const result = normalizeDbResult({
      data: null,
      error: original,
    })

    expect(result.error).toBe(original)
  })
})
