describe('supabase startup configuration', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

  const setEnv = (url?: string, anonKey?: string) => {
    if (url === undefined) {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL
    } else {
      process.env.EXPO_PUBLIC_SUPABASE_URL = url
    }

    if (anonKey === undefined) {
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    } else {
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = anonKey
    }
  }

  const loadSupabaseModule = () => {
    jest.resetModules()
    return jest.requireActual('../src/lib/supabase') as typeof import('../src/lib/supabase')
  }

  afterEach(() => {
    jest.restoreAllMocks()
    setEnv(originalUrl, originalAnonKey)
  })

  it('does not throw when both required env vars are missing', () => {
    setEnv(undefined, undefined)
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const moduleExports = loadSupabaseModule()

    expect(moduleExports.supabase).toBeNull()
    expect(moduleExports.missingSupabaseEnvVars).toEqual([
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ])
    expect(moduleExports.supabaseStartupError).toContain('EXPO_PUBLIC_SUPABASE_URL')
    expect(moduleExports.supabaseStartupError).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing Supabase environment variables:'),
    )
  })

  it('reports only EXPO_PUBLIC_SUPABASE_URL when URL is missing', () => {
    setEnv(undefined, 'test-anon-key')
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const moduleExports = loadSupabaseModule()

    expect(moduleExports.supabase).toBeNull()
    expect(moduleExports.missingSupabaseEnvVars).toEqual(['EXPO_PUBLIC_SUPABASE_URL'])
    expect(moduleExports.supabaseStartupError).toContain('EXPO_PUBLIC_SUPABASE_URL')
    expect(moduleExports.supabaseStartupError).not.toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY')
  })

  it('reports only EXPO_PUBLIC_SUPABASE_ANON_KEY when anon key is missing', () => {
    setEnv('https://example.supabase.co', undefined)
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const moduleExports = loadSupabaseModule()

    expect(moduleExports.supabase).toBeNull()
    expect(moduleExports.missingSupabaseEnvVars).toEqual(['EXPO_PUBLIC_SUPABASE_ANON_KEY'])
    expect(moduleExports.supabaseStartupError).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY')
    expect(moduleExports.supabaseStartupError).not.toContain('EXPO_PUBLIC_SUPABASE_URL')
  })
})
