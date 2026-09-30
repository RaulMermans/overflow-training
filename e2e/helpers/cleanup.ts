/**
 * E2E cleanup: delete all user data for a given user_id (service role).
 * Run AFTER E2E flows to leave the E2E project clean.
 *
 * Usage:
 *   SUPABASE_URL_E2E=... SUPABASE_SERVICE_ROLE_KEY_E2E=... \
 *   npx ts-node e2e/helpers/cleanup.ts <userId>
 *
 * Tables cleaned (dependency order):
 *   workout_sets, workout_exercises, workouts,
 *   plan_days, plans,
 *   routine_items, routines,
 *   user_settings, checkin_photos, checkins,
 *   favorites (exercise + routine),
 *   account (if exists)
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL_E2E ?? process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY_E2E ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Error: SUPABASE_URL_E2E and SUPABASE_SERVICE_ROLE_KEY_E2E (or fallbacks) are required.',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const TABLES_IN_ORDER = [
  'workout_sets',
  'workout_exercises',
  'workouts',
  'plan_days',
  'plans',
  'routine_items',
  'routines',
  'user_settings',
  'checkin_photos',
  'checkins',
  'routine_favorites',
  'exercise_favorites',
]

async function deleteUserData(userId: string): Promise<void> {
  for (const table of TABLES_IN_ORDER) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) {
      if (error.code === '42P01') {
        console.warn(`Table ${table} does not exist, skipping`)
      } else {
        console.error(`Failed to delete from ${table}:`, error.message)
        throw error
      }
    } else {
      console.log(`Cleaned ${table}`)
    }
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId)
  if (authError) {
    console.warn('Could not delete auth user (may not exist):', authError.message)
  } else {
    console.log('Deleted auth user')
  }
}

async function main() {
  const userId = process.argv[2]
  if (!userId) {
    console.error('Usage: npx ts-node e2e/helpers/cleanup.ts <userId>')
    process.exit(1)
  }

  await deleteUserData(userId)
  console.log('Cleanup complete')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
