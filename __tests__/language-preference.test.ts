import { getLocales } from 'expo-localization'
import { getDeviceDefault } from '../src/lib/languagePreference'

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(),
}))

const mockedGetLocales = getLocales as jest.Mock

describe('getDeviceDefault', () => {
  afterEach(() => {
    mockedGetLocales.mockReset()
  })

  it('returns "es" when device language starts with es', () => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'es' }])
    expect(getDeviceDefault()).toBe('es')
  })

  it('returns "en" for English device', () => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'en' }])
    expect(getDeviceDefault()).toBe('en')
  })

  it('returns "en" for unsupported language (fallback)', () => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'fr' }])
    expect(getDeviceDefault()).toBe('en')
  })

  it('returns "en" when getLocales returns empty array', () => {
    mockedGetLocales.mockReturnValue([])
    expect(getDeviceDefault()).toBe('en')
  })

  it('returns "en" when getLocales throws', () => {
    mockedGetLocales.mockImplementation(() => {
      throw new Error('unavailable')
    })
    expect(getDeviceDefault()).toBe('en')
  })
})
