/**
 * Unit tests for sync error taxonomy.
 * Ensures deterministic classification for AUTH, RLS, CONSTRAINT, NETWORK, RATE_LIMIT, SERVER, and UNKNOWN split.
 */

import { classifySyncError, SyncErrorCode } from '../src/lib/sync/syncErrorTaxonomy'

describe('classifySyncError', () => {
  it('classifies HTTP 401 as AUTH (retryable: false)', () => {
    const result = classifySyncError({ status: 401, message: 'Unauthorized' })
    expect(result.code).toBe(SyncErrorCode.AUTH)
    expect(result.retryable).toBe(false)
    expect(result.httpStatus).toBe(401)
  })

  it('classifies HTTP 419 as AUTH (retryable: false)', () => {
    const result = classifySyncError({ status: 419 })
    expect(result.code).toBe(SyncErrorCode.AUTH)
    expect(result.retryable).toBe(false)
  })

  it('classifies HTTP 403 without RLS markers as AUTH (retryable: false)', () => {
    const result = classifySyncError({ status: 403 })
    expect(result.code).toBe(SyncErrorCode.AUTH)
    expect(result.retryable).toBe(false)
  })

  it('classifies HTTP 403 with RLS message as RLS', () => {
    const result = classifySyncError({
      status: 403,
      message: 'new row violates row-level security policy',
    })
    expect(result.code).toBe(SyncErrorCode.RLS)
    expect(result.retryable).toBe(false)
  })

  it('classifies pg code 42501 as RLS', () => {
    const result = classifySyncError({ code: '42501' })
    expect(result.code).toBe(SyncErrorCode.RLS)
    expect(result.retryable).toBe(false)
  })

  it('classifies pg code 23505 (unique_violation) as CONSTRAINT', () => {
    const result = classifySyncError({ code: '23505' })
    expect(result.code).toBe(SyncErrorCode.CONSTRAINT)
    expect(result.retryable).toBe(false)
    expect(result.pgCode).toBe('23505')
  })

  it('classifies pg code 23503 (foreign_key) as CONSTRAINT', () => {
    const result = classifySyncError({ code: '23503' })
    expect(result.code).toBe(SyncErrorCode.CONSTRAINT)
    expect(result.retryable).toBe(false)
  })

  it('classifies HTTP 429 as RATE_LIMIT (retryable: true)', () => {
    const result = classifySyncError({ status: 429 })
    expect(result.code).toBe(SyncErrorCode.RATE_LIMIT)
    expect(result.retryable).toBe(true)
  })

  it('classifies HTTP 500 as SERVER (retryable: true)', () => {
    const result = classifySyncError({ status: 500 })
    expect(result.code).toBe(SyncErrorCode.SERVER)
    expect(result.retryable).toBe(true)
  })

  it('classifies HTTP 502 as SERVER', () => {
    const result = classifySyncError({ status: 502 })
    expect(result.code).toBe(SyncErrorCode.SERVER)
    expect(result.retryable).toBe(true)
  })

  it('classifies network error message as NETWORK', () => {
    const result = classifySyncError(new Error('Failed to fetch'))
    expect(result.code).toBe(SyncErrorCode.NETWORK)
    expect(result.retryable).toBe(true)
  })

  it('classifies timeout message as TIMEOUT', () => {
    const result = classifySyncError(new Error('Request timed out'))
    expect(result.code).toBe(SyncErrorCode.TIMEOUT)
    expect(result.retryable).toBe(true)
  })

  it('classifies unknown transient-looking error as UNKNOWN_RETRYABLE', () => {
    const result = classifySyncError(new Error('Something weird'))
    expect(result.code).toBe(SyncErrorCode.UNKNOWN_RETRYABLE)
    expect(result.retryable).toBe(true)
  })

  it('classifies unknown non-transient HTTP errors as UNKNOWN_FATAL', () => {
    const result = classifySyncError({ status: 418, message: 'Teapot failure' })
    expect(result.code).toBe(SyncErrorCode.UNKNOWN_FATAL)
    expect(result.retryable).toBe(false)
  })

  it('classifies HTTP 400 as VALIDATION', () => {
    const result = classifySyncError({ status: 400 })
    expect(result.code).toBe(SyncErrorCode.VALIDATION)
    expect(result.retryable).toBe(false)
  })

  it('classifies HTTP 409 as CONFLICT', () => {
    const result = classifySyncError({ status: 409 })
    expect(result.code).toBe(SyncErrorCode.CONFLICT)
    expect(result.retryable).toBe(true)
  })

  it('classifies JWT message as AUTH', () => {
    const result = classifySyncError(new Error('JWT expired'))
    expect(result.code).toBe(SyncErrorCode.AUTH)
    expect(result.retryable).toBe(false)
  })

  it('classifies RLS message as RLS', () => {
    const result = classifySyncError(new Error('new row violates row-level security'))
    expect(result.code).toBe(SyncErrorCode.RLS)
    expect(result.retryable).toBe(false)
  })
})
