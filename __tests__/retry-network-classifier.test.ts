import { defaultShouldRetry, isNetworkError } from '../src/lib/retry'

describe('retry network classifier', () => {
  it('treats common mobile offline messages as retryable network errors', () => {
    expect(isNetworkError(new Error('The Internet connection appears to be offline.'))).toBe(true)
    expect(isNetworkError(new Error('Load failed'))).toBe(true)
    expect(isNetworkError(new Error('Could not connect to server'))).toBe(true)
    expect(defaultShouldRetry(new Error('Unable to resolve host'))).toBe(true)
  })

  it('does not mark permission failures as retryable network errors', () => {
    expect(isNetworkError(new Error('permission denied'))).toBe(false)
    expect(defaultShouldRetry(new Error('permission denied'))).toBe(false)
  })
})
