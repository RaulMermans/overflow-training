import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const migrationManifestRelativePath = 'supabase/migrations/manifest.json'
const migrationManifestAbsolutePath = path.resolve(repoRoot, migrationManifestRelativePath)

let migrationManifestError = null
let manifestMigrations = []

if (fs.existsSync(migrationManifestAbsolutePath)) {
  try {
    const parsedManifest = JSON.parse(fs.readFileSync(migrationManifestAbsolutePath, 'utf8'))
    if (!Array.isArray(parsedManifest?.migrations)) {
      migrationManifestError =
        'Invalid supabase/migrations/manifest.json: expected a top-level `migrations` array.'
    } else {
      manifestMigrations = parsedManifest.migrations.map((value) => String(value))
    }
  } catch (error) {
    migrationManifestError = `Invalid supabase/migrations/manifest.json JSON: ${
      error instanceof Error ? error.message : String(error)
    }`
  }
}

const canonicalFiles = [
  'supabase/schema.sql',
  'supabase/policies.sql',
  migrationManifestRelativePath,
  ...manifestMigrations.map((name) => `supabase/migrations/${name}`),
]

const contractChecks = [
  {
    file: 'supabase/schema.sql',
    checks: [
      {
        description: 'exercise_definitions table exists',
        test: (content) => /create table if not exists exercise_definitions/i.test(content),
      },
      {
        description: 'workouts.started_at exists',
        test: (content) =>
          /create table if not exists workouts[\s\S]*\bstarted_at\s+timestamptz\b/i.test(content),
      },
      {
        description: 'workouts.structured metadata columns exist',
        test: (content) =>
          /create table if not exists workouts[\s\S]*\beffort_rating\s+integer\b[\s\S]*\bsession_note\s+text\b/i.test(
            content,
          ),
      },
      {
        description: 'workout_exercises.exercise_definition_id exists as uuid',
        test: (content) =>
          /create table if not exists workout_exercises[\s\S]*\bexercise_definition_id\s+uuid\b/i.test(
            content,
          ),
      },
      {
        description: 'workout_sets canonical columns exist',
        test: (content) =>
          /create table if not exists workout_sets[\s\S]*\bweight_kg\s+numeric\b[\s\S]*\bis_weight_canonical\s+boolean\b/i.test(
            content,
          ),
      },
      {
        description: 'UUID primary keys exist on canonical tables',
        test: (content) => (content.match(/\bid\s+uuid\s+primary key\b/gi) ?? []).length >= 7,
      },
      {
        description: 'routines and scheduled_routines sync tables exist',
        test: (content) =>
          /create table if not exists routines[\s\S]*create table if not exists routine_items[\s\S]*create table if not exists public\.scheduled_routines/i.test(
            content,
          ),
      },
      {
        description: 'last exercise performance RPC exists',
        test: (content) =>
          /create or replace function get_last_exercise_performance/i.test(content),
      },
      {
        description: 'aliases GIN index exists',
        test: (content) =>
          /create index if not exists exercise_definitions_aliases_gin_idx[\s\S]*using gin \(aliases\)/i.test(
            content,
          ),
      },
      {
        description: 'exercise_definitions target/type columns exist',
        test: (content) =>
          /create table if not exists exercise_definitions[\s\S]*\bexercise_type\s+text\b[\s\S]*\bprimary_targets\s+text\[\][\s\S]*\bsecondary_targets\s+text\[\]/i.test(
            content,
          ),
      },
      {
        description: 'category to exercise_type derivation function exists',
        test: (content) => /create or replace function derive_legacy_exercise_type/i.test(content),
      },
      {
        description: 'exercise_type sync trigger function exists',
        test: (content) =>
          /create or replace function sync_exercise_type_from_category/i.test(content),
      },
      {
        description: 'exercise_type sync trigger exists',
        test: (content) =>
          /create trigger exercise_definitions_sync_exercise_type_trg/i.test(content),
      },
      {
        description: 'exercise scope/owner consistency check exists',
        test: (content) => /exercise_definitions_scope_owner_consistency_check/i.test(content),
      },
      {
        description: 'exercise_definitions hybrid scope/owner/category/tracking columns exist',
        test: (content) =>
          /create table if not exists exercise_definitions[\s\S]*\bscope\s+text\b[\s\S]*\bowner_user_id\s+uuid\b[\s\S]*\bcategory\s+text\b[\s\S]*\btracking_mode\s+text\b/i.test(
            content,
          ),
      },
      {
        description: 'workout_sets duration/distance columns exist',
        test: (content) =>
          /create table if not exists workout_sets[\s\S]*\bduration_seconds\s+integer\b[\s\S]*\bdistance_m\s+numeric\b/i.test(
            content,
          ),
      },
      {
        description: 'workout_sets metric presence constraint exists',
        test: (content) => /workout_sets_metric_presence_check/i.test(content),
      },
      {
        description: 'exercise_definitions target/type indexes exist',
        test: (content) =>
          /exercise_definitions_primary_targets_gin_idx|exercise_definitions_secondary_targets_gin_idx|exercise_definitions_exercise_type_idx/i.test(
            content,
          ),
      },
      {
        description: 'progress PR RPC exists',
        test: (content) => /create or replace function get_progress_exercise_prs/i.test(content),
      },
      {
        description: 'progress recent occurrences RPC exists',
        test: (content) =>
          /create or replace function get_progress_exercise_recent_occurrences/i.test(content),
      },
      {
        description:
          'performance indexes exist (workouts_user_started_at_desc, routines_user_updated_at_desc, scheduled_routines_user_date_idx)',
        test: (content) =>
          /workouts_user_started_at_desc/i.test(content) &&
          /routines_user_updated_at_desc/i.test(content) &&
          /scheduled_routines_user_date_idx/i.test(content),
      },
      {
        description:
          'start_workout_from_routine RPC exists with auth-only contract (p_routine_id only)',
        test: (content) =>
          /create or replace function public\.start_workout_from_routine\s*\(\s*p_routine_id\s+uuid\s*\)/i.test(
            content,
          ),
      },
    ],
  },
  {
    file: 'supabase/policies.sql',
    checks: [
      {
        description: 'RLS enabled for key tables',
        test: (content) =>
          /alter table exercise_definitions enable row level security[\s\S]*alter table workouts enable row level security[\s\S]*alter table workout_exercises enable row level security[\s\S]*alter table workout_sets enable row level security[\s\S]*alter table routines enable row level security[\s\S]*alter table routine_items enable row level security[\s\S]*alter table scheduled_routines enable row level security/i.test(
            content,
          ),
      },
      {
        description: 'exercise_definitions owner policy set exists',
        test: (content) =>
          /create policy "exercise_definitions_select_authenticated"[\s\S]*create policy "exercise_definitions_insert_own"[\s\S]*create policy "exercise_definitions_update_own"[\s\S]*create policy "exercise_definitions_delete_own"/i.test(
            content,
          ),
      },
      {
        description: 'workout policies exist',
        test: (content) =>
          /create policy "workouts_select_own"[\s\S]*create policy "workouts_insert_own"[\s\S]*create policy "workouts_update_own"[\s\S]*create policy "workouts_delete_own"[\s\S]*create policy "workout_exercises_select_own"[\s\S]*create policy "workout_exercises_insert_own"[\s\S]*create policy "workout_exercises_update_own"[\s\S]*create policy "workout_exercises_delete_own"[\s\S]*create policy "workout_sets_select_own"[\s\S]*create policy "workout_sets_insert_own"[\s\S]*create policy "workout_sets_update_own"[\s\S]*create policy "workout_sets_delete_own"/i.test(
            content,
          ),
      },
      {
        description: 'routines and scheduled_routines policies exist',
        test: (content) =>
          /create policy "routines_select_own"[\s\S]*create policy "routines_insert_own"[\s\S]*create policy "routines_update_own"[\s\S]*create policy "routines_delete_own"[\s\S]*create policy "routine_items_select_own"[\s\S]*create policy "routine_items_insert_own"[\s\S]*create policy "routine_items_update_own"[\s\S]*create policy "routine_items_delete_own"[\s\S]*create policy "scheduled_routines_select_own"[\s\S]*create policy "scheduled_routines_insert_own"[\s\S]*create policy "scheduled_routines_update_own"[\s\S]*create policy "scheduled_routines_delete_own"/i.test(
            content,
          ),
      },
      {
        description: 'RLS policies use (select auth.uid()) for single eval per statement',
        test: (content) => /\(select auth\.uid\(\)\)/i.test(content),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-001-sync-schema.sql',
    checks: [
      {
        description: 'migration covers workouts.started_at',
        test: (content) => /\bstarted_at\b/i.test(content),
      },
      {
        description: 'migration covers workout_exercises.exercise_definition_id',
        test: (content) => /\bexercise_definition_id\b/i.test(content),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-002-canonicalize-exercises.sql',
    checks: [
      {
        description: 'migration backfills exercise_definition_id',
        test: (content) =>
          /backfilling exercise_definition_id|set exercise_definition_id/i.test(content),
      },
      {
        description: 'migration checks started_at canonical column',
        test: (content) => /\bstarted_at\b/i.test(content),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-003-clean-rebuild.sql',
    checks: [
      {
        description: 'clean rebuild defines workouts.started_at',
        test: (content) =>
          /create table workouts[\s\S]*\bstarted_at\s+timestamptz\b/i.test(content),
      },
      {
        description: 'clean rebuild defines workout_exercises.exercise_definition_id',
        test: (content) =>
          /create table workout_exercises[\s\S]*\bexercise_definition_id\s+uuid\b/i.test(content),
      },
      {
        description: 'clean rebuild is safety-gated',
        test: (content) => /abort: core tables have data/i.test(content),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-005-last-exercise-performance-rpc.sql',
    checks: [
      {
        description: 'RPC migration defines get_last_exercise_performance',
        test: (content) =>
          /create or replace function get_last_exercise_performance/i.test(content),
      },
      {
        description: 'RPC migration returns workout_id/performed_at/set rows',
        test: (content) =>
          /\breturns table[\s\S]*\bworkout_id\b[\s\S]*\bperformed_at\b[\s\S]*\bset_index\b[\s\S]*\breps\b[\s\S]*\bweight\b/i.test(
            content,
          ),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-006-exercise-aliases-gin-index.sql',
    checks: [
      {
        description: 'migration defines exercise_definitions_aliases_gin_idx',
        test: (content) =>
          /create index if not exists exercise_definitions_aliases_gin_idx/i.test(content),
      },
      {
        description: 'migration uses GIN on aliases',
        test: (content) => /using gin \(aliases\)/i.test(content),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-007-canonical-weight-started-at-progress-meta.sql',
    checks: [
      {
        description: 'migration adds workout_sets.weight_kg',
        test: (content) => /\badd column if not exists weight_kg\b/i.test(content),
      },
      {
        description: 'migration adds workout_sets.is_weight_canonical',
        test: (content) => /\badd column if not exists is_weight_canonical\b/i.test(content),
      },
      {
        description: 'migration adds workouts structured metadata columns',
        test: (content) =>
          /\badd column if not exists effort_rating\b[\s\S]*\badd column if not exists session_note\b/i.test(
            content,
          ),
      },
      {
        description: 'migration defines progress PR RPC',
        test: (content) => /create or replace function get_progress_exercise_prs/i.test(content),
      },
      {
        description: 'migration defines progress recent occurrences RPC',
        test: (content) =>
          /create or replace function get_progress_exercise_recent_occurrences/i.test(content),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-007-exercise-targets-and-types.sql',
    checks: [
      {
        description: 'migration adds exercise_definitions.exercise_type',
        test: (content) => /\badd column if not exists exercise_type\b/i.test(content),
      },
      {
        description: 'migration adds exercise_definitions primary/secondary targets',
        test: (content) =>
          /\badd column if not exists primary_targets\b[\s\S]*\badd column if not exists secondary_targets\b/i.test(
            content,
          ),
      },
      {
        description: 'migration enforces exercise_type allowed values',
        test: (content) =>
          /exercise_type in \('strength', 'warmup', 'stretch', 'cardio', 'mobility'\)/i.test(
            content,
          ),
      },
      {
        description: 'migration defines target/type indexes',
        test: (content) =>
          /exercise_definitions_primary_targets_gin_idx|exercise_definitions_secondary_targets_gin_idx|exercise_definitions_exercise_type_idx/i.test(
            content,
          ),
      },
      {
        description: 'migration seeds warmup and stretch exercises',
        test: (content) => /\bwarmup\b[\s\S]*\bstretch\b/i.test(content),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-008-hybrid-exercises-and-tracking-modes.sql',
    checks: [
      {
        description: 'migration adds exercise_definitions hybrid columns',
        test: (content) =>
          /\badd column if not exists scope\b[\s\S]*\badd column if not exists owner_user_id\b[\s\S]*\badd column if not exists category\b[\s\S]*\badd column if not exists tracking_mode\b/i.test(
            content,
          ),
      },
      {
        description: 'migration adds workout_sets duration/distance columns',
        test: (content) =>
          /\bworkout_sets[\s\S]*add column if not exists duration_seconds\b[\s\S]*\bworkout_sets[\s\S]*add column if not exists distance_m\b/i.test(
            content,
          ),
      },
      {
        description: 'migration defines exercise_definitions owner CRUD policies',
        test: (content) =>
          /\bcreate policy "exercise_definitions_select_authenticated"[\s\S]*\bcreate policy "exercise_definitions_insert_own"[\s\S]*\bcreate policy "exercise_definitions_update_own"[\s\S]*\bcreate policy "exercise_definitions_delete_own"/i.test(
            content,
          ),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-008-routines-plans-sync-offline-outbox.sql',
    checks: [
      {
        description: 'migration adds workout client_uuid columns',
        test: (content) =>
          /\bworkouts[\s\S]*add column if not exists client_uuid\b[\s\S]*workout_exercises[\s\S]*add column if not exists client_uuid\b[\s\S]*workout_sets[\s\S]*add column if not exists client_uuid\b/i.test(
            content,
          ),
      },
      {
        description: 'migration creates routines/plans tables',
        test: (content) =>
          /\bcreate table if not exists routines\b[\s\S]*\bcreate table if not exists routine_items\b[\s\S]*\bcreate table if not exists plans\b[\s\S]*\bcreate table if not exists plan_days\b/i.test(
            content,
          ),
      },
      {
        description: 'migration enables RLS for sync tables',
        test: (content) =>
          /\balter table routines enable row level security\b[\s\S]*\balter table routine_items enable row level security\b[\s\S]*\balter table plans enable row level security\b[\s\S]*\balter table plan_days enable row level security\b/i.test(
            content,
          ),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-009-favorites.sql',
    checks: [
      {
        description: 'migration creates exercise_favorites table',
        test: (content) => /create table if not exists public\.exercise_favorites/i.test(content),
      },
      {
        description: 'migration creates routine_favorites table',
        test: (content) => /create table if not exists public\.routine_favorites/i.test(content),
      },
      {
        description: 'migration enables RLS on exercise_favorites',
        test: (content) =>
          /alter table public\.exercise_favorites enable row level security/i.test(content),
      },
      {
        description: 'migration enables RLS on routine_favorites',
        test: (content) =>
          /alter table public\.routine_favorites enable row level security/i.test(content),
      },
      {
        description: 'migration defines all 6 favorites policies',
        test: (content) =>
          /create policy "exercise_favorites_select"[\s\S]*create policy "exercise_favorites_insert"[\s\S]*create policy "exercise_favorites_delete"[\s\S]*create policy "routine_favorites_select"[\s\S]*create policy "routine_favorites_insert"[\s\S]*create policy "routine_favorites_delete"/i.test(
            content,
          ),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-027-analytics-foundation.sql',
    checks: [
      {
        description: 'analytics schema created',
        test: (content) => /create schema if not exists analytics/i.test(content),
      },
      {
        description: 'analytics views have security_invoker = true',
        test: (content) => /security_invoker\s*=\s*true/i.test(content),
      },
      {
        description: 'weekly_workouts view exists',
        test: (content) => /create or replace view analytics\.weekly_workouts/i.test(content),
      },
      {
        description: 'weekly_strength_volume view exists',
        test: (content) =>
          /create or replace view analytics\.weekly_strength_volume/i.test(content),
      },
      {
        description: 'weekly_muscle_balance view exists',
        test: (content) => /create or replace view analytics\.weekly_muscle_balance/i.test(content),
      },
      {
        description: 'exercise_e1rm_weekly view exists',
        test: (content) => /create or replace view analytics\.exercise_e1rm_weekly/i.test(content),
      },
      {
        description: 'rpc_progress_overview RPC exists',
        test: (content) =>
          /create or replace function analytics\.rpc_progress_overview/i.test(content),
      },
      {
        description: 'rpc_strength_lift_trend RPC exists',
        test: (content) =>
          /create or replace function analytics\.rpc_strength_lift_trend/i.test(content),
      },
      {
        description: 'rpc_muscle_balance RPC exists',
        test: (content) =>
          /create or replace function analytics\.rpc_muscle_balance/i.test(content),
      },
      {
        description: 'analytics schema grants SELECT to authenticated role (per view)',
        test: (content) => /grant select on analytics\.\w+ to authenticated/i.test(content),
      },
      {
        description: 'analytics schema grants EXECUTE to authenticated role (per function)',
        test: (content) => /grant execute on function analytics\.\w+/i.test(content),
      },
      {
        description: 'volume computed with weight_kg (not legacy weight)',
        test: (content) => /weight_kg\s*\*/i.test(content),
      },
      {
        description: 'Epley e1RM formula present (reps / 30)',
        test: (content) => /reps\s*\/\s*30/i.test(content),
      },
    ],
  },
  {
    file: 'supabase/migrations/migration-010-data-hygiene-contract-hardening.sql',
    checks: [
      {
        description: 'migration defines derive_legacy_exercise_type function',
        test: (content) =>
          /create or replace function public\.derive_legacy_exercise_type/i.test(content),
      },
      {
        description: 'migration defines exercise_type sync trigger function',
        test: (content) =>
          /create or replace function public\.sync_exercise_type_from_category/i.test(content),
      },
      {
        description: 'migration creates exercise_type sync trigger',
        test: (content) =>
          /create trigger exercise_definitions_sync_exercise_type_trg/i.test(content),
      },
      {
        description: 'migration enforces scope/owner consistency check',
        test: (content) => /exercise_definitions_scope_owner_consistency_check/i.test(content),
      },
      {
        description: 'migration deletes fully empty workout sets before hardening',
        test: (content) =>
          /delete from public\.workout_sets[\s\S]*reps is null[\s\S]*duration_seconds is null[\s\S]*distance_m is null/i.test(
            content,
          ),
      },
      {
        description: 'migration ensures workout_sets_metric_presence_check',
        test: (content) => /workout_sets_metric_presence_check/i.test(content),
      },
    ],
  },
]

const errors = []

if (migrationManifestError) {
  errors.push(migrationManifestError)
}

for (const relativePath of canonicalFiles) {
  const absolutePath = path.resolve(repoRoot, relativePath)
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing canonical file: ${relativePath}`)
  }
}

const supabaseRoot = path.resolve(repoRoot, 'supabase')
const rootMigrationFiles = fs
  .readdirSync(supabaseRoot)
  .filter((name) => /^migration-\d{3}-.+\.sql$/i.test(name))

if (rootMigrationFiles.length > 0) {
  errors.push(
    `Found non-canonical migration files under supabase/: ${rootMigrationFiles.join(
      ', ',
    )}. Move them to supabase/migrations/.`,
  )
}

const migrationsDir = path.resolve(repoRoot, 'supabase/migrations')
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((name) => /^migration-\d{3}-.+\.sql$/i.test(name))
  .sort()

if (manifestMigrations.length === 0) {
  errors.push('supabase/migrations/manifest.json must define a non-empty `migrations` array.')
}

const invalidManifestEntries = manifestMigrations.filter(
  (name) => !/^migration-\d{3}-.+\.sql$/i.test(name),
)
if (invalidManifestEntries.length > 0) {
  errors.push(
    `Invalid migration names in supabase/migrations/manifest.json: ${invalidManifestEntries.join(', ')}.`,
  )
}

const manifestDuplicates = manifestMigrations.filter(
  (name, index) => manifestMigrations.indexOf(name) !== index,
)
if (manifestDuplicates.length > 0) {
  const uniqueDuplicates = [...new Set(manifestDuplicates)]
  errors.push(
    `Duplicate entries in supabase/migrations/manifest.json: ${uniqueDuplicates.join(', ')}.`,
  )
}

const missingFromManifest = migrationFiles.filter((name) => !manifestMigrations.includes(name))
if (missingFromManifest.length > 0) {
  errors.push(
    `Migrations present on disk but missing in supabase/migrations/manifest.json: ${missingFromManifest.join(', ')}.`,
  )
}

const missingFromDiskByManifest = manifestMigrations.filter(
  (name) => !migrationFiles.includes(name),
)
if (missingFromDiskByManifest.length > 0) {
  errors.push(
    `supabase/migrations/manifest.json lists migrations not present on disk: ${missingFromDiskByManifest.join(', ')}.`,
  )
}

// Detect duplicate migration sequence numbers.
// Historical duplicates (007, 008, 027) are frozen — they shipped to production
// and must not be renumbered. New duplicates are blocked.
const FROZEN_DUPLICATE_SEQS = new Set(['007', '008', '027'])
const seqToFiles = new Map()
for (const name of manifestMigrations) {
  const match = name.match(/^migration-(\d{3})/)
  if (!match) continue
  const seq = match[1]
  if (!seqToFiles.has(seq)) seqToFiles.set(seq, [])
  seqToFiles.get(seq).push(name)
}
for (const [seq, files] of seqToFiles) {
  if (files.length <= 1) continue
  if (FROZEN_DUPLICATE_SEQS.has(seq)) {
    console.warn(
      `[db:verify:contract] INFO: historical duplicate sequence ${seq}: ${files.join(', ')} (frozen, not blocking)`,
    )
  } else {
    errors.push(
      `Duplicate migration sequence number ${seq}: ${files.join(', ')}. Each new migration must use a unique sequence number.`,
    )
  }
}

const supabaseReadmePath = path.resolve(repoRoot, 'supabase/README.md')
if (fs.existsSync(supabaseReadmePath)) {
  const readmeContent = fs.readFileSync(supabaseReadmePath, 'utf8')
  const listedInReadme = Array.from(
    readmeContent.matchAll(/migrations\/(migration-\d{3}-[a-z0-9-]+\.sql)/gi),
    (match) => match[1],
  )
  const readmeMigrations = listedInReadme.filter(
    (name, index) => listedInReadme.indexOf(name) === index,
  )

  const missingFromReadme = manifestMigrations.filter((name) => !readmeMigrations.includes(name))
  if (missingFromReadme.length > 0) {
    errors.push(`Missing migration entries in supabase/README.md: ${missingFromReadme.join(', ')}.`)
  }

  const readmeUnknown = readmeMigrations.filter((name) => !manifestMigrations.includes(name))
  if (readmeUnknown.length > 0) {
    errors.push(
      `supabase/README.md lists migrations not present in supabase/migrations/manifest.json: ${readmeUnknown.join(
        ', ',
      )}.`,
    )
  }

  if (
    readmeMigrations.length === manifestMigrations.length &&
    readmeMigrations.some((name, index) => name !== manifestMigrations[index])
  ) {
    errors.push(
      'Migration order mismatch: supabase/README.md must list migrations in the same order as supabase/migrations/manifest.json.',
    )
  }
} else {
  errors.push('Missing canonical file: supabase/README.md')
}

for (const entry of contractChecks) {
  const absolutePath = path.resolve(repoRoot, entry.file)
  if (!fs.existsSync(absolutePath)) continue

  const content = fs.readFileSync(absolutePath, 'utf8')
  for (const check of entry.checks) {
    if (!check.test(content)) {
      errors.push(`Contract mismatch in ${entry.file}: ${check.description}`)
    }
  }
}

if (errors.length > 0) {
  console.error('[db:verify:contract] FAILED')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('[db:verify:contract] OK')
for (const file of canonicalFiles) {
  console.log(`- ${file}`)
}
