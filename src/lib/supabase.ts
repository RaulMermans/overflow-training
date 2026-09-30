import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Database } from '../types/db'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

const supabaseEnv = {
  EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
}

export const missingSupabaseEnvVars = Object.entries(supabaseEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key)

export const supabaseStartupError =
  missingSupabaseEnvVars.length > 0
    ? `Missing Supabase environment variables: ${missingSupabaseEnvVars.join(', ')}.`
    : null

if (supabaseStartupError && __DEV__) {
  console.error(`[Startup] ${supabaseStartupError}`)
}

const memoryStorage = new Map<string, string>()

const secureStoreReady = SecureStore.isAvailableAsync()
  .then((available) => {
    if (!available && __DEV__) {
      console.error(
        '[Startup] Expo SecureStore is unavailable. Falling back to in-memory auth storage.',
      )
    }
    return available
  })
  .catch((error) => {
    if (__DEV__) {
      console.error('[Startup] Failed to check SecureStore availability:', error)
    }
    return false
  })

const keychainOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

const secureStorage = {
  getItem: async (key: string) => {
    const available = await secureStoreReady
    if (!available) return memoryStorage.get(key) ?? null
    return SecureStore.getItemAsync(key, keychainOptions)
  },
  setItem: async (key: string, value: string) => {
    const available = await secureStoreReady
    if (!available) {
      memoryStorage.set(key, value)
      return
    }
    await SecureStore.setItemAsync(key, value, keychainOptions)
  },
  removeItem: async (key: string) => {
    const available = await secureStoreReady
    if (!available) {
      memoryStorage.delete(key)
      return
    }
    await SecureStore.deleteItemAsync(key, keychainOptions)
  },
}

export const supabase: SupabaseClient<Database> | null = supabaseStartupError
  ? null
  : createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
