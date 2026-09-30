/**
 * Progress sanity check (dev-only): prints last 10 workouts for a user.
 *
 * Use to debug why progress might show empty when completed workouts exist.
 * Completed workouts need status='completed' and ended_at set to count in analytics.
 *
 * Usage:
 *   EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx scripts/dev/progress-sanity-check.ts <user_id>
 *
 * Get user_id from Supabase Dashboard > Authentication > Users.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const userId = process.argv[2]

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Error: EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY required.',
  )
  process.exit(1)
}

if (!userId) {
  console.error('Usage: npx tsx scripts/dev/progress-sanity-check.ts <user_id>')
  process.exit(1)
}

async function run() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase
    .from('workouts')
    .select('id, status, started_at, ended_at, updated_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  console.log('Last 10 workouts for user', userId)
  console.log('─'.repeat(80))
  if (!data?.length) {
    console.log('No workouts found.')
    return
  }
  data.forEach((w, i) => {
    console.log(
      `${i + 1}. ${w.id?.slice(0, 8)}... | status=${w.status} | started_at=${w.started_at ?? 'null'} | ended_at=${w.ended_at ?? 'null'} | updated_at=${w.updated_at ?? 'null'}`,
    )
  })
  const incomplete = data.filter((w) => w.status !== 'completed' || !w.ended_at)
  if (incomplete.length > 0) {
    console.log('')
    console.log(
      `Note: ${incomplete.length} workout(s) missing status=completed or ended_at — they won't count in progress.`,
    )
  }
}

void run()
