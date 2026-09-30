import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  SplashScreen,
  Stack,
  usePathname,
  useGlobalSearchParams,
  useRouter,
  useSegments,
} from 'expo-router'
import { useFonts } from 'expo-font'
import {
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
} from '@expo-google-fonts/rubik'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { ThemeProvider } from '@shopify/restyle'
import { PostHogProvider } from 'posthog-react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { initCrashReporting, setUser } from '../src/lib/observability/crash'
import { initializeNotifications } from '../src/lib/notifications/setup'
import { getEnvironment, getReleaseId } from '../src/lib/observability/releaseId'
import { AuthProvider, useAuth } from '../src/auth/useAuth'
import { bootstrapSessionForUser } from '../src/auth/sessionBootstrap'
import { I18nProvider } from '../src/i18n/I18nProvider'
import { useI18n } from '../src/i18n/useI18n'
import { colors } from '../src/theme'
import { restyleTheme } from '../src/theme/restyleTheme'
import { SyncProvider } from '../src/features/sync/SyncProvider'
import { TrophyToastProvider } from '../src/features/trophies/ui/TrophyToastHost'
import { RootErrorBoundary } from '../src/components/errors/RootErrorBoundary'
import {
  capture,
  identify,
  isPostHogConfigured,
  posthogClient,
  reset,
  screen,
} from '../src/analytics/posthogClient'

void SplashScreen.preventAutoHideAsync().catch(() => {
  // No-op: splash may already be managed by native lifecycle.
})

function PostHogScreenTracker() {
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  const prevPathnameRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isPostHogConfigured()) return

    if (prevPathnameRef.current !== pathname) {
      screen(pathname)
      prevPathnameRef.current = pathname
    }
  }, [pathname, params])

  return null
}

function PostHogAuthBridge() {
  const { user } = useAuth()
  const prevUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isPostHogConfigured()) return

    const currentUserId = user?.id ?? null

    if (currentUserId && !prevUserIdRef.current) {
      identify(currentUserId)
      capture('auth_signed_in')
    }

    if (!currentUserId && prevUserIdRef.current) {
      capture('auth_signed_out')
      reset()
    }

    prevUserIdRef.current = currentUserId
  }, [user])

  return null
}

function CrashAuthBridge() {
  const { user } = useAuth()
  useEffect(() => {
    setUser(user?.id ?? null)
  }, [user?.id])
  return null
}

function RootLayoutNav() {
  const { user, loading, startupError, missingSupabaseEnvVars } = useAuth()
  const { t } = useI18n()
  const segments = useSegments()
  const router = useRouter()
  const [sessionBootstrapWarning, setSessionBootstrapWarning] = useState<string | null>(null)
  const bootstrappedUserRef = useRef<string | null>(null)
  const hasHiddenSplashRef = useRef(false)

  useEffect(() => {
    if (loading || startupError) return

    const rootSegment = segments[0]
    const childSegment =
      (segments as readonly string[]).length > 1 ? (segments as readonly string[])[1] : undefined

    // index.tsx handles the initial redirect via <Redirect>, so skip it here
    const onIndex = rootSegment === undefined || rootSegment === 'index'
    if (onIndex) return

    const inAuthGroup = rootSegment === '(auth)'
    const inResetPassword = childSegment === 'reset-password'
    const inLoginCallback = childSegment === 'login-callback'

    if (!user) {
      // Not logged in and not already in auth screens → send to login
      if (!inAuthGroup) {
        router.replace('/(auth)/login')
      }
      return
    }

    // Logged in but still in auth screens → send to app.
    // Exclude reset-password (manages its own session flow) and login-callback
    // (must finish exchanging the PKCE code before navigating away).
    if (inAuthGroup && !inResetPassword && !inLoginCallback) {
      router.replace('/')
    }
  }, [loading, router, segments, startupError, user])

  useEffect(() => {
    if (!user?.id) {
      bootstrappedUserRef.current = null
      setSessionBootstrapWarning(null)
      return
    }

    if (bootstrappedUserRef.current === user.id) {
      return
    }

    let cancelled = false
    bootstrappedUserRef.current = user.id

    void bootstrapSessionForUser(user.id).then(({ warning }) => {
      if (cancelled) return
      setSessionBootstrapWarning(warning)

      if (__DEV__ && warning) {
        console.warn('Session bootstrap warning:', warning)
      }
    })

    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    if (hasHiddenSplashRef.current) return

    const rootSegment = segments[0]
    const onIndex = rootSegment === undefined || rootSegment === 'index'

    if (startupError) {
      hasHiddenSplashRef.current = true
      void SplashScreen.hideAsync().catch(() => {
        // No-op: splash may already be hidden.
      })
      return
    }

    if (loading || onIndex) return

    hasHiddenSplashRef.current = true
    void SplashScreen.hideAsync().catch(() => {
      // No-op: splash may already be hidden.
    })
  }, [loading, segments, startupError])

  if (startupError) {
    return (
      <View style={styles.loader}>
        <ScrollView contentContainerStyle={styles.startupContainer}>
          <Text style={styles.startupTitle}>{t('startup.title')}</Text>
          <Text style={styles.startupMessage}>{t('startup.message')}</Text>

          {missingSupabaseEnvVars.length > 0 ? (
            <View style={styles.startupMissingBox}>
              <Text style={styles.startupDetail}>{missingSupabaseEnvVars.join('\n')}</Text>
            </View>
          ) : null}

          <View style={styles.startupSection}>
            <Text style={styles.startupSectionTitle}>{t('startup.localDev')}</Text>
            <Text style={styles.startupInstruction}>{t('startup.localDevInstruction')}</Text>
            <Text style={styles.startupCode}>
              EXPO_PUBLIC_SUPABASE_URL{'\n'}EXPO_PUBLIC_SUPABASE_ANON_KEY
            </Text>
          </View>

          <View style={styles.startupSection}>
            <Text style={styles.startupSectionTitle}>{t('startup.easBuilds')}</Text>
            <Text style={styles.startupInstruction}>{t('startup.easInstruction1')}</Text>
            <Text style={styles.startupInstruction}>{t('startup.easInstruction2')}</Text>
          </View>
        </ScrollView>
      </View>
    )
  }

  if (loading) {
    return <View style={styles.loader} />
  }

  return (
    <>
      {sessionBootstrapWarning ? (
        <View style={styles.bootstrapWarningBox}>
          <Text style={styles.bootstrapWarningTitle}>{t('startup.bootstrapWarning')}</Text>
          <Text style={styles.bootstrapWarningMessage}>{sessionBootstrapWarning}</Text>
        </View>
      ) : null}
      <PostHogScreenTracker />
      <PostHogAuthBridge />
      <CrashAuthBridge />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.bg.primary },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}

initCrashReporting({ release: getReleaseId(), env: getEnvironment() })
initializeNotifications()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      gcTime: 45 * 60 * 1000, // 45 min
      retry: 2,
      refetchOnWindowFocus: false, // React Native has no window focus
      refetchOnReconnect: true,
    },
  },
})

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
  })

  if (!fontsLoaded) return null

  const content = (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={restyleTheme}>
        <I18nProvider>
          <RootErrorBoundary>
            <AuthProvider>
              <StatusBar style="dark" />
              <TrophyToastProvider>
                <SyncProvider>
                  <RootLayoutNav />
                </SyncProvider>
              </TrophyToastProvider>
            </AuthProvider>
          </RootErrorBoundary>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )

  const appTree =
    isPostHogConfigured() && posthogClient ? (
      <PostHogProvider client={posthogClient}>{content}</PostHogProvider>
    ) : (
      content
    )

  return <SafeAreaProvider>{appTree}</SafeAreaProvider>
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.primary,
  },
  startupTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  startupMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  startupDetail: {
    fontSize: 12,
    color: colors.semantic.error,
    textAlign: 'left',
    lineHeight: 18,
  },
  startupContainer: {
    width: '100%',
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 12,
  },
  startupMissingBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.semantic.error,
    borderRadius: 12,
    backgroundColor: colors.semantic.errorMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  startupSection: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    backgroundColor: colors.bg.secondary,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  startupSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  startupInstruction: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  startupCode: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.primary,
    fontWeight: '500',
  },
  bootstrapWarningBox: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 10,
    backgroundColor: colors.bg.secondary,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bootstrapWarningTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  bootstrapWarningMessage: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },
})
