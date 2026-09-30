/**
 * Backfill script: resolve plan_days.routine_id for rows that have
 * template_json data but no routine_id set, then null out template_json
 * for all rows.
 *
 * Run after deploying migration-018 and app Phase 2 changes (template_json: null writes).
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   npx ts-node scripts/backfill_plan_days_routine_id.ts
 *
 * Pre-flight check (run in Supabase SQL editor first):
 *   SELECT count(*) FROM plan_days WHERE routine_id IS NULL AND template_json IS NOT NULL AND template_json != '{}'::jsonb;
 *
 * Post-run verification:
 *   SELECT count(*) FROM plan_days WHERE routine_id IS NULL;       -- expect 0
 *   SELECT count(*) FROM plan_days WHERE template_json IS NOT NULL; -- expect 0
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function run() {
  let resolved = 0
  let unresolvable = 0
  let emptied = 0

  console.log(
    'Step 1: Finding orphaned plan_days rows (routine_id IS NULL with template_json data)...',
  )

  const { data: orphanedRows, error: fetchError } = await supabase
    .from('plan_days')
    .select('id, template_json')
    .is('routine_id', null)
    .not('template_json', 'is', null)
    .neq('template_json', '{}')

  if (fetchError) {
    console.error('Failed to fetch orphaned rows:', fetchError.message)
    process.exit(1)
  }

  console.log(`Found ${orphanedRows?.length ?? 0} orphaned row(s) to process.`)

  for (const row of orphanedRows ?? []) {
    const templateJson = row.template_json as Record<string, unknown> | null
    const routineClientUuid =
      typeof templateJson?.routineId === 'string' ? templateJson.routineId : null

    if (!routineClientUuid) {
      console.warn(
        `  [SKIP] Row ${row.id}: no routineId field in template_json — clearing template_json only.`,
      )
      const { error } = await supabase
        .from('plan_days')
        .update({ template_json: null })
        .eq('id', row.id)
      if (error) {
        console.error(`  [ERROR] Failed to clear template_json for row ${row.id}:`, error.message)
      } else {
        unresolvable++
      }
      continue
    }

    // Look up the cloud routine by client_uuid
    const { data: routine, error: routineError } = await supabase
      .from('routines')
      .select('id')
      .eq('client_uuid', routineClientUuid)
      .maybeSingle()

    if (routineError) {
      console.error(
        `  [ERROR] Routine lookup failed for row ${row.id} (routineId=${routineClientUuid}):`,
        routineError.message,
      )
      continue
    }

    if (!routine) {
      console.warn(
        `  [UNRESOLVABLE] Row ${row.id}: routine with client_uuid=${routineClientUuid} not found (deleted?). Clearing template_json only.`,
      )
      const { error } = await supabase
        .from('plan_days')
        .update({ template_json: null })
        .eq('id', row.id)
      if (error) {
        console.error(`  [ERROR] Failed to clear template_json for row ${row.id}:`, error.message)
      } else {
        unresolvable++
      }
      continue
    }

    // Set routine_id and clear template_json
    const { error: updateError } = await supabase
      .from('plan_days')
      .update({ routine_id: routine.id, template_json: null })
      .eq('id', row.id)

    if (updateError) {
      console.error(`  [ERROR] Failed to update row ${row.id}:`, updateError.message)
    } else {
      console.log(`  [OK] Row ${row.id}: routine_id set to ${routine.id}.`)
      resolved++
    }
  }

  console.log('\nStep 2: Clearing remaining template_json = {} rows...')

  const { count: emptyCount, error: emptyFetchError } = await supabase
    .from('plan_days')
    .select('id', { count: 'exact', head: true })
    .eq('template_json', '{}')

  if (emptyFetchError) {
    console.error('Failed to count empty template_json rows:', emptyFetchError.message)
  } else {
    console.log(`Found ${emptyCount ?? 0} row(s) with template_json = '{}'.`)

    if ((emptyCount ?? 0) > 0) {
      const { error: clearError } = await supabase
        .from('plan_days')
        .update({ template_json: null })
        .eq('template_json', '{}')

      if (clearError) {
        console.error('Failed to clear empty template_json rows:', clearError.message)
      } else {
        emptied = emptyCount ?? 0
        console.log(`Cleared ${emptied} empty row(s).`)
      }
    }
  }

  console.log('\n--- Backfill complete ---')
  console.log(`  routine_id resolved:      ${resolved}`)
  console.log(`  unresolvable (cleared):   ${unresolvable}`)
  console.log(`  '{}' rows cleared:        ${emptied}`)

  // Post-run verification
  const { count: nullRoutineCount } = await supabase
    .from('plan_days')
    .select('id', { count: 'exact', head: true })
    .is('routine_id', null)

  const { count: nonNullTemplateCount } = await supabase
    .from('plan_days')
    .select('id', { count: 'exact', head: true })
    .not('template_json', 'is', null)

  console.log('\n--- Post-run verification ---')
  console.log(`  Rows with routine_id IS NULL:       ${nullRoutineCount ?? '?'} (expect 0)`)
  console.log(`  Rows with template_json IS NOT NULL: ${nonNullTemplateCount ?? '?'} (expect 0)`)

  if ((nullRoutineCount ?? 1) > 0) {
    console.warn(
      '\nWARNING: Some rows still have routine_id IS NULL. Investigate before running migration-019.',
    )
  } else {
    console.log('\n✓ Safe to proceed with migration-019.')
  }
}

run().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
