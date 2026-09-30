/**
 * Derives a stable release identifier for crash reporting and analytics.
 * Format: ${appVersion}+${buildNumber}-${gitShaShort}
 * Fallback when build info unavailable: ${version}-dev
 */

import Constants from 'expo-constants'
import * as Application from 'expo-application'

export function getReleaseId(): string {
  const version = Constants.expoConfig?.version ?? '1.0.0'
  const buildNumber =
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode ??
    null
  const gitSha = process.env.EXPO_PUBLIC_GIT_SHA ?? process.env.GIT_SHA ?? null
  const shaShort = gitSha ? gitSha.slice(0, 7) : 'dev'

  if (buildNumber) {
    return `${version}+${buildNumber}-${shaShort}`
  }
  return `${version}-${shaShort}`
}

export function getEnvironment(): string {
  if (__DEV__) return 'development'
  const channel = Constants.expoConfig?.extra?.eas?.channel ?? null
  if (channel === 'production' || channel === 'preview') return channel
  return process.env.EXPO_PUBLIC_ENV ?? 'production'
}
