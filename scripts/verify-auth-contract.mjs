/**
 * verify-auth-contract.mjs
 *
 * Release-gate script that validates auth redirect URIs stay consistent
 * across app.json, src/config/authRedirects.ts, and route files.
 *
 * Exit 0 = all checks pass.
 * Exit 1 = mismatch detected (blocks release).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const errors = []

// 1. Read app.json scheme
const appJsonPath = path.resolve(repoRoot, 'app.json')
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
const scheme = appJson.expo?.scheme

if (!scheme || typeof scheme !== 'string') {
  errors.push('app.json: missing or invalid expo.scheme')
}

// 2. Read authRedirects.ts and verify it references the correct scheme
const authRedirectsPath = path.resolve(repoRoot, 'src/config/authRedirects.ts')
if (!fs.existsSync(authRedirectsPath)) {
  errors.push('src/config/authRedirects.ts does not exist')
} else {
  const content = fs.readFileSync(authRedirectsPath, 'utf8')

  // Verify it imports from app.json
  if (!content.includes("from '../../app.json'")) {
    errors.push('authRedirects.ts: does not import from app.json — scheme may drift')
  }

  // Verify expected exports exist
  for (const name of [
    'APP_SCHEME',
    'LOGIN_CALLBACK_URI',
    'RESET_PASSWORD_URI',
    'GOOGLE_CALENDAR_CALLBACK_URI',
  ]) {
    if (!content.includes(`export const ${name}`)) {
      errors.push(`authRedirects.ts: missing export "${name}"`)
    }
  }
}

// 3. Verify useAuth.tsx imports from authRedirects (not hardcoded)
const useAuthPath = path.resolve(repoRoot, 'src/auth/useAuth.tsx')
if (fs.existsSync(useAuthPath)) {
  const content = fs.readFileSync(useAuthPath, 'utf8')

  if (!content.includes("from '../config/authRedirects'")) {
    errors.push('useAuth.tsx: does not import from config/authRedirects')
  }

  // Check for leftover hardcoded scheme URIs (outside comments)
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Skip comment lines
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue
    if (
      scheme &&
      line.includes(`'${scheme}://`) &&
      !line.includes('LOGIN_CALLBACK_URI') &&
      !line.includes('RESET_PASSWORD_URI')
    ) {
      errors.push(
        `useAuth.tsx:${i + 1}: hardcoded scheme URI "${scheme}://" — use authRedirects constants`,
      )
    }
  }
}

// 3b. Verify googleCalendarAuth.ts imports from authRedirects (not hardcoded)
const googleCalendarAuthPath = path.resolve(
  repoRoot,
  'src/features/googleCalendar/googleCalendarAuth.ts',
)
if (fs.existsSync(googleCalendarAuthPath)) {
  const content = fs.readFileSync(googleCalendarAuthPath, 'utf8')

  if (!content.includes("from '../../config/authRedirects'")) {
    errors.push('googleCalendarAuth.ts: does not import from config/authRedirects')
  }

  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue
    if (
      scheme &&
      line.includes(`'${scheme}://`) &&
      !line.includes('GOOGLE_CALENDAR_CALLBACK_URI')
    ) {
      errors.push(
        `googleCalendarAuth.ts:${i + 1}: hardcoded scheme URI "${scheme}://" — use authRedirects constants`,
      )
    }
  }
}

// 4. Verify route files exist for callback paths
const routeFiles = [
  { path: 'app/(auth)/login-callback.tsx', label: 'login-callback route' },
  { path: 'app/(auth)/reset-password.tsx', label: 'reset-password route' },
]
for (const { path: relPath, label } of routeFiles) {
  if (!fs.existsSync(path.resolve(repoRoot, relPath))) {
    errors.push(`${label}: ${relPath} does not exist`)
  }
}

// Result
if (errors.length > 0) {
  console.error('\n❌ Auth contract verification failed:\n')
  for (const err of errors) {
    console.error(`  • ${err}`)
  }
  console.error('')
  process.exit(1)
} else {
  console.log('✅ Auth contract verified:')
  console.log(`   scheme: ${scheme}`)
  console.log(
    `   redirects: ${scheme}://login-callback, ${scheme}://reset-password, ${scheme}://google-calendar-callback`,
  )
  console.log('   route files: present')
  console.log('   useAuth.tsx / googleCalendarAuth.ts: import authRedirects (no hardcoded URIs)')
  process.exit(0)
}
