import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { AppState } from 'react-native'
import { Session, User } from '@supabase/supabase-js'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { missingSupabaseEnvVars, supabase, supabaseStartupError } from '../lib/supabase'
import { requireSupabase } from '../lib/supabaseClient'
import { cleanupUserSessionBeforeSignOut } from '../features/sync/sessionCleanup'
import { deleteCurrentUserAccount } from '../db/account'
import {
  hasHandledAuthCallbackCode,
  markAuthCallbackCodeHandled,
  parseAuthCallbackParams,
} from './resetPasswordLink'
import { APP_SCHEME, LOGIN_CALLBACK_URI, RESET_PASSWORD_URI } from '../config/authRedirects'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  startupError: string | null
  missingSupabaseEnvVars: string[]
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ requiresEmailConfirmation: boolean }>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  exchangeCodeForSession: (code: string) => Promise<void>
  setSessionFromTokens: (accessToken: string, refreshToken: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const GOOGLE_LOGIN_REDIRECT_URI = LOGIN_CALLBACK_URI
const GOOGLE_OAUTH_SESSION_ERROR_PREFIX = 'Google OAuth session failed'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (__DEV__) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Constants = require('expo-constants').default
        const configScheme = Constants.expoConfig?.scheme
        if (configScheme && configScheme !== APP_SCHEME) {
          console.error(
            `[Auth] SCHEME MISMATCH: app.json scheme="${configScheme}" but ` +
              `authRedirects uses "${APP_SCHEME}". OAuth redirects will fail in production.`,
          )
        }
      } catch {
        /* expo-constants unavailable in test env */
      }
    }

    if (!supabase) {
      if (__DEV__ && supabaseStartupError) {
        console.warn('[Startup]', supabaseStartupError)
      }
      setLoading(false)
      return
    }
    const client = supabase

    let isMounted = true

    const start = () => {
      if (typeof client.auth.startAutoRefresh === 'function') {
        client.auth.startAutoRefresh()
      }
    }
    const stop = () => {
      if (typeof client.auth.stopAutoRefresh === 'function') {
        client.auth.stopAutoRefresh()
      }
    }
    const syncToAppState = (state: string) => {
      if (state === 'active') {
        if (__DEV__) console.log('[Auth] AppState active → startAutoRefresh')
        start()
      } else {
        if (__DEV__) console.log('[Auth] AppState', state, '→ stopAutoRefresh')
        stop()
      }
    }

    // Align with current AppState on mount
    syncToAppState(AppState.currentState)
    const appStateSubscription = AppState.addEventListener('change', syncToAppState)

    client.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      })
      .catch((error) => {
        if (__DEV__) console.warn('Failed to get session:', error)
        if (isMounted) {
          setLoading(false)
        }
      })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (!session) {
        if (__DEV__) console.log('[Auth] Session cleared → stopAutoRefresh')
        stop()
      }
    })

    return () => {
      isMounted = false
      appStateSubscription.remove()
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const client = requireSupabase()
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUp = async (email: string, password: string, displayName: string) => {
    const client = requireSupabase()
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    })

    if (error) throw error

    return { requiresEmailConfirmation: !data.session }
  }

  const signOut = async () => {
    const client = requireSupabase()
    const currentUserId = user?.id ?? null

    if (currentUserId) {
      try {
        await cleanupUserSessionBeforeSignOut(currentUserId)
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed local sign-out cleanup:', error)
        }
      }
    }

    const { error } = await client.auth.signOut()
    if (error) throw error
  }

  const deleteAccount = async () => {
    const client = requireSupabase()
    const currentUserId = user?.id ?? null

    if (!currentUserId) {
      throw new Error('No authenticated user.')
    }

    const { error: deleteError } = await deleteCurrentUserAccount()
    if (deleteError) throw deleteError

    try {
      await cleanupUserSessionBeforeSignOut(currentUserId)
    } catch (error) {
      if (__DEV__) {
        console.warn('Failed local delete-account cleanup:', error)
      }
    }

    const { error: signOutError } = await client.auth.signOut({ scope: 'local' })
    if (signOutError && __DEV__) {
      console.warn('Delete-account local sign-out warning:', signOutError)
    }

    setSession(null)
    setUser(null)
  }

  const resetPassword = async (email: string) => {
    const client = requireSupabase()
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: RESET_PASSWORD_URI,
    })
    if (error) throw error
  }

  const exchangeCodeForSession = async (code: string) => {
    const client = requireSupabase()
    const { error } = await client.auth.exchangeCodeForSession(code)
    if (error) throw error
  }

  const setSessionFromTokens = async (accessToken: string, refreshToken: string) => {
    const client = requireSupabase()
    const { error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) throw error
  }

  const updatePassword = async (password: string) => {
    const client = requireSupabase()
    const { error } = await client.auth.updateUser({ password })
    if (error) throw error
  }

  const completeGoogleAuthSession = async (callbackUrl: string) => {
    const { code, accessToken, refreshToken } = parseAuthCallbackParams(callbackUrl)

    if (code) {
      if (hasHandledAuthCallbackCode(code)) {
        return
      }
      markAuthCallbackCodeHandled(code)
      await exchangeCodeForSession(code)
      return
    }

    if (accessToken && refreshToken) {
      await setSessionFromTokens(accessToken, refreshToken)
      return
    }

    throw new Error(`${GOOGLE_OAUTH_SESSION_ERROR_PREFIX}: invalid callback URL`)
  }

  /**
   * Required Supabase redirect URLs (Dashboard → Auth → URL Configuration):
   *   - LOGIN_CALLBACK_URI   (Google OAuth PKCE callback)
   *   - RESET_PASSWORD_URI   (password reset magic link)
   * See src/config/authRedirects.ts for canonical values.
   */
  const signInWithGoogle = async () => {
    const client = requireSupabase()
    // Hard-coded to match the Supabase redirect allowlist. Linking.createURL
    // produces different schemes in Expo Go / dev-client / production, which
    // causes silent OAuth failures when the URL is not whitelisted.
    const redirectTo = GOOGLE_LOGIN_REDIRECT_URI
    if (__DEV__) {
      const dynamicUrl = Linking.createURL('login-callback')
      if (dynamicUrl !== redirectTo) {
        console.warn(
          `[Auth] Linking.createURL produced "${dynamicUrl}" which differs from ` +
            `hardcoded redirect "${redirectTo}". The hardcoded URL is used. ` +
            'Ensure it is whitelisted in Supabase dashboard.',
        )
      }
    }
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    })
    if (error) throw error
    if (!data.url) {
      throw new Error(`${GOOGLE_OAUTH_SESSION_ERROR_PREFIX}: no OAuth URL returned`)
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
      dismissButtonStyle: 'cancel',
    })

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return
    }

    if (result.type !== 'success') {
      throw new Error(`${GOOGLE_OAUTH_SESSION_ERROR_PREFIX}: ${result.type}`)
    }

    await completeGoogleAuthSession(result.url)
  }

  // Memoize so consumers only re-render when auth state (session/user/loading)
  // actually changes, not on every incidental AuthProvider re-render.
  const contextValue = useMemo(
    () => ({
      session,
      user,
      loading,
      startupError: supabaseStartupError,
      missingSupabaseEnvVars,
      signIn,
      signUp,
      signOut,
      deleteAccount,
      resetPassword,
      exchangeCodeForSession,
      setSessionFromTokens,
      updatePassword,
      signInWithGoogle,
    }),
    [session, user, loading],
  )

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
