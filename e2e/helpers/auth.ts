/**
 * E2E auth helpers: create unique test user for isolated runs.
 *
 * Usage:
 *   SUPABASE_URL_E2E=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY_E2E=eyJ... \
 *   npx ts-node e2e/helpers/auth.ts create
 *
 * Outputs JSON: { "email": "e2e+...@example.com", "password": "...", "userId": "..." }
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL_E2E ?? process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY_E2E ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Error: SUPABASE_URL_E2E and SUPABASE_SERVICE_ROLE_KEY_E2E (or SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY) are required.',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function generateRunId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).slice(2, 10)
  return `${date}-${random}`
}

const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'E2eTestP@ssw0rd!'

async function createTestUser(): Promise<{ email: string; password: string; userId: string }> {
  const runId = generateRunId()
  const email = `e2e+${runId}@example.com`

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
  })

  if (error) {
    console.error('Failed to create test user:', error.message)
    process.exit(1)
  }

  const userId = data.user?.id
  if (!userId) {
    console.error('No user ID returned from createUser')
    process.exit(1)
  }

  return { email, password: E2E_PASSWORD, userId }
}

async function main() {
  const cmd = process.argv[2]
  if (cmd !== 'create') {
    console.error('Usage: npx ts-node e2e/helpers/auth.ts create')
    process.exit(1)
  }

  const result = await createTestUser()
  console.log(JSON.stringify(result))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
