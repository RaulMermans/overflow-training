import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const trackedFiles = execFileSync('git', ['ls-files'], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
})
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)

const duplicateSuffixFiles = trackedFiles.filter((filePath) => {
  if (!/ 2\.[^/]+$/i.test(filePath)) return false
  return fs.existsSync(path.resolve(repoRoot, filePath))
})

if (duplicateSuffixFiles.length > 0) {
  console.error('[check-no-duplicate-suffix-files] FAILED')
  console.error('Detected tracked files that appear to be duplicate suffixed copies:')
  duplicateSuffixFiles.forEach((filePath) => console.error(`- ${filePath}`))
  console.error('\nRename or remove these files to avoid accidental drift/import confusion.')
  process.exit(1)
}

console.log('[check-no-duplicate-suffix-files] OK')
