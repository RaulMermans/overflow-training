import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const nodeModulesRoot = path.resolve(repoRoot, 'node_modules')

function listDirectoryNames(dirPath) {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

function isSuspiciousDuplicateDirectory(name) {
  return /\s2$/.test(name)
}

if (!fs.existsSync(nodeModulesRoot)) {
  console.log('[check-node-modules-integrity] Skipped: node_modules directory not found.')
  process.exit(0)
}

const suspicious = []
const topLevelNames = listDirectoryNames(nodeModulesRoot)
for (const name of topLevelNames) {
  if (isSuspiciousDuplicateDirectory(name)) {
    suspicious.push(path.posix.join('node_modules', name))
  }

  if (!name.startsWith('@')) continue
  const scopeDir = path.resolve(nodeModulesRoot, name)
  const scopedPackages = listDirectoryNames(scopeDir)
  for (const scopedPackageName of scopedPackages) {
    if (isSuspiciousDuplicateDirectory(scopedPackageName)) {
      suspicious.push(path.posix.join('node_modules', name, scopedPackageName))
    }
  }
}

if (suspicious.length > 0) {
  console.error('[check-node-modules-integrity] FAILED')
  console.error("Detected suspicious duplicate package directories (trailing ' 2'):")
  suspicious.forEach((entry) => console.error(`- ${entry}`))
  console.error('\nRecommended remediation:')
  console.error('rm -rf node_modules package-lock.json && npm install')
  process.exit(1)
}

console.log('[check-node-modules-integrity] OK')
