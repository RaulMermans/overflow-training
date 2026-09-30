import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const baseArg = process.argv.find((arg) => arg.startsWith('--base='))
const baseRef = baseArg ? baseArg.split('=')[1] : 'HEAD~1'
const prTitleArg = process.argv.find((arg) => arg.startsWith('--pr-title='))
const prTitle = prTitleArg ? prTitleArg.split('=').slice(1).join('=') : ''

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  }).trim()
}

function resolveDiffRange() {
  try {
    runGit(['rev-parse', '--verify', baseRef])
    return `${baseRef}...HEAD`
  } catch {
    try {
      runGit(['rev-parse', '--verify', 'HEAD~1'])
      return 'HEAD~1...HEAD'
    } catch {
      return null
    }
  }
}

const diffRange = resolveDiffRange()
if (!diffRange) {
  console.log('[check-governance-drift] Skipped: unable to resolve git diff range.')
  process.exit(0)
}
const diffBaseRef = diffRange.split('...')[0]

const changedFiles = runGit(['diff', '--name-only', '--diff-filter=ACMRTUXB', diffRange])
  .split('\n')
  .map((value) => value.trim())
  .filter(Boolean)

const changedSet = new Set(changedFiles)
const errors = []

const migrationFilesChanged = changedFiles.filter((filePath) =>
  /^supabase\/migrations\/migration-\d{3}-.+\.sql$/i.test(filePath),
)
if (migrationFilesChanged.length > 0 && !changedSet.has('supabase/migrations/manifest.json')) {
  errors.push(
    `Migration files changed without manifest update: ${migrationFilesChanged.join(', ')}.`,
  )
}

const baselineChanged = changedSet.has('.eslint-baseline.json')
const baselineUpdateAllowed =
  process.env.ALLOW_ESLINT_BASELINE_UPDATE === '1' || /lint[\s-_]?debt/i.test(prTitle)
let baselineExistedInBase = false
if (baselineChanged) {
  try {
    runGit(['cat-file', '-e', `${diffBaseRef}:.eslint-baseline.json`])
    baselineExistedInBase = true
  } catch {
    baselineExistedInBase = false
  }
}
if (baselineChanged && baselineExistedInBase && !baselineUpdateAllowed) {
  errors.push(
    "`.eslint-baseline.json` changed without lint-debt allowance. Use ALLOW_ESLINT_BASELINE_UPDATE=1 or include 'lint-debt' in the PR title for dedicated debt updates.",
  )
}

if (errors.length > 0) {
  console.error('[check-governance-drift] FAILED')
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log('[check-governance-drift] OK')
