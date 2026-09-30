#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const REQUIRED_VARS = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']
const OPTIONAL_VARS = ['EXPO_PUBLIC_POSTHOG_KEY', 'EXPO_PUBLIC_POSTHOG_HOST']
const GOOGLE_CALENDAR_REQUIRED_VAR = 'EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID'
const FORBIDDEN_VARS = ['SUPABASE_SERVICE_ROLE_KEY', 'EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY']
const MODES = new Set(['local', 'ci', 'release'])
const SKIP_GOOGLE_CALENDAR_CLIENT_ID_CHECK =
  process.env.CHECK_ENV_SKIP_GOOGLE_CALENDAR_CLIENT_ID === '1'

function parseModeArg() {
  const rawArg = process.argv.find((arg) => arg.startsWith('--mode=')) ?? null
  const parsedMode = rawArg ? rawArg.split('=')[1] : 'local'
  if (!MODES.has(parsedMode)) {
    console.error(`[check:env] Invalid mode "${parsedMode}". Use one of: ${[...MODES].join(', ')}.`)
    process.exit(1)
  }
  return parsedMode
}

function parseDotEnvFile(dotEnvPath) {
  if (!fs.existsSync(dotEnvPath)) return {}

  const parsed = {}
  const content = fs.readFileSync(dotEnvPath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue

    const key = match[1]
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    parsed[key] = value
  }
  return parsed
}

function readFeatureFlag(flagName) {
  const repoRoot = path.resolve(__dirname, '..')
  const featureFlagsPath = path.resolve(repoRoot, 'src', 'config', 'featureFlags.ts')
  if (!fs.existsSync(featureFlagsPath)) {
    throw new Error(`Missing feature flags file: ${featureFlagsPath}`)
  }

  const content = fs.readFileSync(featureFlagsPath, 'utf8')
  const match = content.match(new RegExp(`export const ${flagName} = (true|false)\\b`, 'm'))
  if (!match) {
    throw new Error(
      `Could not determine feature flag "${flagName}" from src/config/featureFlags.ts`,
    )
  }

  return match[1] === 'true'
}

function resolveEnv(mode) {
  if (mode !== 'local') return { ...process.env }

  const repoRoot = path.resolve(__dirname, '..')
  let dotEnvPath = path.resolve(repoRoot, 'supabase', '.env')
  if (!fs.existsSync(dotEnvPath)) {
    dotEnvPath = path.resolve(repoRoot, '.env')
  }
  const fromDotEnv = parseDotEnvFile(dotEnvPath)
  return {
    ...fromDotEnv,
    ...process.env,
  }
}

function printModeHelp(mode) {
  if (mode === 'local') {
    console.error('\nLocal development fix:')
    console.error('1) cp .env.example .env')
    console.error('2) Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY')
    return
  }

  console.error('\nCI/Release fix:')
  console.error(
    `Set ${REQUIRED_VARS.join(', ')} in your CI/EAS environment for mode "${mode}", then rerun.`,
  )
  console.error('EXPO_PUBLIC_* values are inlined at build time.')
}

function printConditionalEnvHelp(mode, flagName, envVarName) {
  if (mode === 'local') {
    console.error(`- Add ${envVarName} to .env when testing Google Calendar locally`)
    return
  }

  console.error(`- ${flagName} is enabled, so ${envVarName} must be set in the EAS/CI environment`)
  console.error(
    '- Rebuild after changing EXPO_PUBLIC_* values because they are inlined at build time',
  )
}

function printConditionalEnvSkipNotice(flagName, envVarName) {
  console.warn(
    `[check:env] Warning: ${flagName} is enabled but ${envVarName} is missing. Skipping this check because CHECK_ENV_SKIP_GOOGLE_CALENDAR_CLIENT_ID=1.`,
  )
}

function parseJwtRole(token) {
  if (typeof token !== 'string') return null
  const trimmed = token.trim()
  const parts = trimmed.split('.')
  if (parts.length < 2) return null

  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    const decoded = Buffer.from(payload, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded)
    return typeof parsed.role === 'string' ? parsed.role : null
  } catch {
    return null
  }
}

function printSecurityHelp(mode) {
  if (mode === 'local') {
    console.error('\nSecurity fix (local):')
    console.error('- Remove service-role keys from .env and shell exports')
    console.error('- Keep only EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY')
    console.error('- Use SUPABASE_SERVICE_ROLE_KEY only for one-off admin scripts in a clean shell')
    return
  }

  console.error(`\nSecurity fix (${mode}):`)
  console.error('- Remove service-role keys from CI/EAS env vars')
  console.error('- EXPO_PUBLIC_SUPABASE_ANON_KEY must be anon, never service_role')
}

const mode = parseModeArg()
const resolvedEnv = resolveEnv(mode)
const googleCalendarSyncEnabled = readFeatureFlag('ENABLE_GOOGLE_CALENDAR_SYNC')

const missingRequired = REQUIRED_VARS.filter((name) => !resolvedEnv[name])
const missingOptional = OPTIONAL_VARS.filter((name) => !resolvedEnv[name])
const missingConditional = []
const missingGoogleCalendarClientId =
  googleCalendarSyncEnabled && mode !== 'local' && !resolvedEnv[GOOGLE_CALENDAR_REQUIRED_VAR]

if (missingGoogleCalendarClientId && !SKIP_GOOGLE_CALENDAR_CLIENT_ID_CHECK) {
  missingConditional.push(GOOGLE_CALENDAR_REQUIRED_VAR)
}
const forbiddenPresent = FORBIDDEN_VARS.filter((name) => Boolean(resolvedEnv[name]))
const anonRole = parseJwtRole(resolvedEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY)
const isPublicAnonActuallyServiceRole = anonRole === 'service_role'

if (forbiddenPresent.length > 0 || isPublicAnonActuallyServiceRole) {
  console.error(`[check:env] SECURITY VIOLATION (mode=${mode}):`)
  for (const name of forbiddenPresent) {
    console.error(`- Forbidden variable present: ${name}`)
  }
  if (isPublicAnonActuallyServiceRole) {
    console.error('- EXPO_PUBLIC_SUPABASE_ANON_KEY decodes to role=service_role')
  }
  printSecurityHelp(mode)
  process.exit(1)
}

if (missingRequired.length > 0 || missingConditional.length > 0) {
  console.error(`[check:env] Missing required environment variables (mode=${mode}):`)
  for (const name of missingRequired) {
    console.error(`- ${name}`)
  }
  for (const name of missingConditional) {
    console.error(`- ${name}`)
  }
  if (missingOptional.length > 0) {
    console.error('\nOptional variables not set:')
    for (const name of missingOptional) {
      console.error(`- ${name}`)
    }
  }
  printModeHelp(mode)
  if (missingConditional.length > 0) {
    console.error(`\nConditional requirement:`)
    printConditionalEnvHelp(mode, 'ENABLE_GOOGLE_CALENDAR_SYNC', GOOGLE_CALENDAR_REQUIRED_VAR)
  }
  process.exit(1)
}

console.log(`[check:env] OK (mode=${mode}): required Supabase environment variables are set.`)
if (missingGoogleCalendarClientId && SKIP_GOOGLE_CALENDAR_CLIENT_ID_CHECK) {
  printConditionalEnvSkipNotice('ENABLE_GOOGLE_CALENDAR_SYNC', GOOGLE_CALENDAR_REQUIRED_VAR)
}
if (googleCalendarSyncEnabled && mode === 'local' && !resolvedEnv[GOOGLE_CALENDAR_REQUIRED_VAR]) {
  console.log(
    `[check:env] Note: ENABLE_GOOGLE_CALENDAR_SYNC is true but ${GOOGLE_CALENDAR_REQUIRED_VAR} is not set locally. Google Calendar stays hidden in the normal UI for this build, and direct/manual navigation shows a missing-config state.`,
  )
}
if (missingOptional.length > 0) {
  console.log('[check:env] Optional variables not set:')
  for (const name of missingOptional) {
    console.log(`- ${name}`)
  }
}
