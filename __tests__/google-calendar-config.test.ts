import { GOOGLE_CALENDAR_CALLBACK_URI } from '../src/config/authRedirects'

let mockEnableGoogleCalendarSync = true

jest.mock('../src/config/featureFlags', () => {
  const actual = jest.requireActual('../src/config/featureFlags')
  return {
    ...actual,
    ENABLE_GOOGLE_CALENDAR_SYNC: mockEnableGoogleCalendarSync,
  }
})

describe('googleCalendar feature gates', () => {
  it('feature flag ENABLE_GOOGLE_CALENDAR_SYNC is true', () => {
    const { ENABLE_GOOGLE_CALENDAR_SYNC } = jest.requireActual(
      '../src/config/featureFlags',
    ) as typeof import('../src/config/featureFlags')
    expect(ENABLE_GOOGLE_CALENDAR_SYNC).toBe(true)
  })

  it('isConfigured is false when EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is missing', () => {
    const originalClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
    delete process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID

    jest.isolateModules(() => {
      const { getGoogleCalendarConfig } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/features/googleCalendar/googleCalendarConfig') as typeof import('../src/features/googleCalendar/googleCalendarConfig')

      const config = getGoogleCalendarConfig()
      expect(config.clientId).toBe('')
      expect(config.clientId.length > 0).toBe(false)
    })

    if (originalClientId !== undefined) {
      process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = originalClientId
    }
  })

  it('isConfigured is true when EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is set', () => {
    const originalClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = 'test-id'

    jest.isolateModules(() => {
      const { getGoogleCalendarConfig } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/features/googleCalendar/googleCalendarConfig') as typeof import('../src/features/googleCalendar/googleCalendarConfig')

      const config = getGoogleCalendarConfig()
      expect(config.clientId.length > 0).toBe(true)
    })

    if (originalClientId === undefined) {
      delete process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
    } else {
      process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = originalClientId
    }
  })
})

describe('googleCalendarConfig', () => {
  const originalClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID

  afterEach(() => {
    jest.resetModules()

    if (originalClientId === undefined) {
      delete process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
    } else {
      process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = originalClientId
    }
  })

  it('returns callbackUri and trimmed clientId when configured', () => {
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = '  test-client-id  '

    jest.isolateModules(() => {
      const { getGoogleCalendarConfig, validateGoogleCalendarConfig } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/features/googleCalendar/googleCalendarConfig') as typeof import('../src/features/googleCalendar/googleCalendarConfig')

      expect(getGoogleCalendarConfig()).toEqual({
        clientId: 'test-client-id',
        callbackUri: GOOGLE_CALENDAR_CALLBACK_URI,
      })
      expect(validateGoogleCalendarConfig()).toEqual({
        clientId: 'test-client-id',
        callbackUri: GOOGLE_CALENDAR_CALLBACK_URI,
      })
    })
  })

  it('throws a typed error when the Google OAuth client id is missing', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID

    jest.isolateModules(() => {
      const { validateGoogleCalendarConfig } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/features/googleCalendar/googleCalendarConfig') as typeof import('../src/features/googleCalendar/googleCalendarConfig')
      // Import inside isolateModules so the class identity matches
      const { GoogleCalendarError } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/features/googleCalendar/googleCalendarErrors') as typeof import('../src/features/googleCalendar/googleCalendarErrors')

      try {
        validateGoogleCalendarConfig()
      } catch (error) {
        expect(error).toBeInstanceOf(GoogleCalendarError)
        expect((error as InstanceType<typeof GoogleCalendarError>).code).toBe('missingConfig')
        return
      }

      throw new Error('Expected validateGoogleCalendarConfig to throw')
    })
  })
})

describe('googleCalendar feature state', () => {
  const originalClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID

  afterEach(() => {
    jest.resetModules()
    mockEnableGoogleCalendarSync = true

    if (originalClientId === undefined) {
      delete process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
    } else {
      process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = originalClientId
    }
  })

  it('hides the integration when the feature flag is disabled', () => {
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
    mockEnableGoogleCalendarSync = false

    jest.isolateModules(() => {
      const { getGoogleCalendarFeatureState } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/features/googleCalendar/googleCalendarConfig') as typeof import('../src/features/googleCalendar/googleCalendarConfig')

      expect(getGoogleCalendarFeatureState()).toEqual({
        isFeatureEnabled: false,
        isConfigured: true,
        isVisible: false,
        canConnect: false,
      })
    })
  })

  it('hides the normal integration entry point when config is missing', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
    mockEnableGoogleCalendarSync = true

    jest.isolateModules(() => {
      const { getGoogleCalendarFeatureState } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/features/googleCalendar/googleCalendarConfig') as typeof import('../src/features/googleCalendar/googleCalendarConfig')

      expect(getGoogleCalendarFeatureState()).toEqual({
        isFeatureEnabled: true,
        isConfigured: false,
        isVisible: false,
        canConnect: false,
      })
    })
  })

  it('marks the integration connectable when the feature flag and config are both present', () => {
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
    mockEnableGoogleCalendarSync = true

    jest.isolateModules(() => {
      const { getGoogleCalendarFeatureState } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/features/googleCalendar/googleCalendarConfig') as typeof import('../src/features/googleCalendar/googleCalendarConfig')

      expect(getGoogleCalendarFeatureState()).toEqual({
        isFeatureEnabled: true,
        isConfigured: true,
        isVisible: true,
        canConnect: true,
      })
    })
  })
})
