import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const baselinePath = path.resolve(repoRoot, '.eslint-baseline.json')
const writeBaseline = process.argv.includes('--write-baseline')

const lintTargets = ['app', 'src', '__tests__', 'scripts']
const eslintBin = path.resolve(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'eslint.cmd' : 'eslint',
)

function normalizeLintResults(results) {
  const issueCounts = {}

  for (const fileResult of results) {
    const absolutePath = fileResult.filePath ?? ''
    const relativePath = absolutePath
      ? path.relative(repoRoot, absolutePath).replace(/\\/g, '/')
      : '<unknown>'

    for (const message of fileResult.messages ?? []) {
      if (!message || Number(message.severity) <= 0) continue
      const ruleId = message.ruleId ?? '__unknown_rule__'
      const normalizedMessage = String(message.message ?? '').trim()
      const signature = `${relativePath}::${ruleId}::${normalizedMessage}`
      issueCounts[signature] = (issueCounts[signature] ?? 0) + 1
    }
  }

  return issueCounts
}

function runLintJson() {
  if (!fs.existsSync(eslintBin)) {
    console.error('[lint-no-new-debt] eslint binary not found. Run `npm install` first.')
    process.exit(1)
  }

  const result = spawnSync(
    eslintBin,
    [...lintTargets, '--format', 'json', '--no-error-on-unmatched-pattern'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  )

  const stdout = result.stdout?.trim() ?? ''
  if (!stdout) {
    console.error('[lint-no-new-debt] Unable to read eslint JSON output. Command stdout was empty.')
    if (result.stderr?.trim()) {
      console.error(result.stderr.trim())
    }
    process.exit(1)
  }

  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch (error) {
    console.error('[lint-no-new-debt] Failed to parse eslint JSON output.')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  if (!Array.isArray(parsed)) {
    console.error('[lint-no-new-debt] Invalid eslint JSON output: expected an array.')
    process.exit(1)
  }

  return parsed
}

const currentResults = runLintJson()
const currentIssueCounts = normalizeLintResults(currentResults)

if (writeBaseline) {
  const baselinePayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    targets: lintTargets,
    issueCounts: currentIssueCounts,
  }
  fs.writeFileSync(baselinePath, `${JSON.stringify(baselinePayload, null, 2)}\n`)
  console.log('[lint-no-new-debt] Baseline refreshed.')
  process.exit(0)
}

if (!fs.existsSync(baselinePath)) {
  console.error(
    '[lint-no-new-debt] Missing .eslint-baseline.json. Run `node scripts/lint-no-new-debt.mjs --write-baseline` once to create it.',
  )
  process.exit(1)
}

let baselinePayload = null
try {
  baselinePayload = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
} catch (error) {
  console.error('[lint-no-new-debt] Failed to parse .eslint-baseline.json.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const baselineIssueCounts =
  baselinePayload &&
  typeof baselinePayload === 'object' &&
  baselinePayload.issueCounts &&
  typeof baselinePayload.issueCounts === 'object'
    ? baselinePayload.issueCounts
    : null

if (!baselineIssueCounts) {
  console.error(
    '[lint-no-new-debt] Invalid baseline format. Expected top-level `issueCounts` object.',
  )
  process.exit(1)
}

const newDebt = []
for (const [signature, count] of Object.entries(currentIssueCounts)) {
  const baselineCount = Number(baselineIssueCounts[signature] ?? 0)
  if (count > baselineCount) {
    newDebt.push({
      signature,
      baselineCount,
      currentCount: count,
    })
  }
}

if (newDebt.length > 0) {
  console.error('[lint-no-new-debt] FAILED: net new lint debt detected.')
  newDebt
    .sort((a, b) => a.signature.localeCompare(b.signature))
    .forEach((issue) => {
      console.error(
        `- ${issue.signature} (baseline=${issue.baselineCount}, current=${issue.currentCount})`,
      )
    })
  console.error(
    '\nIf this is intentional debt reduction/re-baselining, update .eslint-baseline.json in a dedicated lint-debt PR.',
  )
  process.exit(1)
}

console.log('[lint-no-new-debt] OK: no net new lint debt.')
