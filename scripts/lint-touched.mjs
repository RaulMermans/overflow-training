import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const eslintBin = path.resolve(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'eslint.cmd' : 'eslint',
)

const baseArg = process.argv.find((arg) => arg.startsWith('--base='))
const baseRef = baseArg ? baseArg.split('=')[1] : 'origin/main'
const lintableRootPrefixes = ['app/', 'src/', '__tests__/', 'scripts/']

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

function collectTouchedFiles() {
  const diffRange = resolveDiffRange()
  if (!diffRange) return []

  const raw = runGit(['diff', '--name-only', '--diff-filter=ACMRTUXB', diffRange])
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((filePath) => lintableRootPrefixes.some((prefix) => filePath.startsWith(prefix)))
    .filter((filePath) => /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath))
}

if (!fs.existsSync(eslintBin)) {
  console.error('[lint-touched] eslint binary not found. Run `npm install` first.')
  process.exit(1)
}

const touchedFiles = collectTouchedFiles()
if (touchedFiles.length === 0) {
  console.log('[lint-touched] No touched lintable files found.')
  process.exit(0)
}

console.log(`[lint-touched] Linting ${touchedFiles.length} touched files.`)
const lintRun = spawnSync(
  eslintBin,
  [...touchedFiles, '--max-warnings=0', '--no-error-on-unmatched-pattern'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  },
)

process.exit(lintRun.status ?? 1)
