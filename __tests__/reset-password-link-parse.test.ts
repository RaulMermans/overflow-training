import { parseResetParams } from '../src/auth/resetPasswordLink'

describe('reset password link parser', () => {
  it('parses auth code from query params', () => {
    const parsed = parseResetParams(
      'workout-tracker-ios://reset-password?code=abc123&type=recovery',
    )

    expect(parsed).toEqual({
      code: 'abc123',
      accessToken: undefined,
      refreshToken: undefined,
    })
  })

  it('parses access and refresh tokens from hash params', () => {
    const parsed = parseResetParams(
      'workout-tracker-ios://reset-password#access_token=access-1&refresh_token=refresh-1',
    )

    expect(parsed).toEqual({
      code: undefined,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    })
  })

  it('preserves values containing equals signs', () => {
    const parsed = parseResetParams(
      'workout-tracker-ios://reset-password#access_token=header.payload=segment&refresh_token=refresh=value',
    )

    expect(parsed).toEqual({
      code: undefined,
      accessToken: 'header.payload=segment',
      refreshToken: 'refresh=value',
    })
  })

  it('parses mixed query and hash params together', () => {
    const parsed = parseResetParams(
      'workout-tracker-ios://reset-password?code=xyz#access_token=a1&refresh_token=r1',
    )

    expect(parsed).toEqual({
      code: 'xyz',
      accessToken: 'a1',
      refreshToken: 'r1',
    })
  })
})
