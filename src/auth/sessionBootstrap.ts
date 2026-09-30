import { loadOnboardingCompleted } from '../lib/onboarding'
import { loadOnboardingProfile } from '../lib/onboardingProfile'
import { loadProfilePreferences } from '../lib/profilePreferences'
import { loadRoutines } from '../lib/routines'
import { ensureUserSettingsRow } from '../db/userSettings'
import { sanitizeErrorMessage } from '../utils/errorMessages'
import { runAccountUpgrade } from '../features/accountUpgrade/runAccountUpgrade'

interface SessionBootstrapResult {
  warning: string | null
}

function toWarning(reason: unknown): string {
  if (reason instanceof Error) {
    return sanitizeErrorMessage(reason.message)
  }
  return sanitizeErrorMessage(reason)
}

function collectWarnings(results: PromiseSettledResult<unknown>[]): string | null {
  const messages = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => toWarning(r.reason))

  return messages.length > 0 ? messages[0] : null
}

export async function bootstrapSessionForUser(userId: string): Promise<SessionBootstrapResult> {
  if (!userId) {
    return { warning: null }
  }

  // Run account upgrade before loading routines and plans so that any legacy
  // exercise refs are repaired before the sync engine evaluates them.
  try {
    await runAccountUpgrade(userId)
  } catch {
    // Upgrade failures are non-fatal — proceed with bootstrap regardless.
  }

  try {
    const results = await Promise.allSettled([
      loadOnboardingCompleted(userId),
      loadOnboardingProfile(userId),
      loadProfilePreferences(userId),
      loadRoutines(userId),
      ensureUserSettingsRow(userId),
    ])

    return { warning: collectWarnings(results) }
  } catch (error) {
    return { warning: toWarning(error) }
  }
}
