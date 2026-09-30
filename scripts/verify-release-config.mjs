import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const appJsonPath = path.resolve(repoRoot, 'app.json')
const appLinksPath = path.resolve(repoRoot, 'src/config/appLinks.ts')

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
const appLinksSource = fs.readFileSync(appLinksPath, 'utf8')

const errors = []

function findPluginConfig(plugins, pluginName) {
  for (const plugin of plugins ?? []) {
    if (plugin === pluginName) return {}
    if (Array.isArray(plugin) && plugin[0] === pluginName) {
      return plugin[1] ?? {}
    }
  }
  return null
}

function looksPlaceholder(value) {
  return (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    /(example\.com|example\.org|placeholder|changeme|todo|your-project|your-anon-key|your_existing|your-existing|<[^>]+>)/i.test(
      value,
    )
  )
}

function extractLink(name) {
  const match = appLinksSource.match(new RegExp(`${name}:\\s*['"]([^'"]+)['"]`))
  return match?.[1] ?? null
}

const expoConfig = appJson.expo ?? {}
const iosConfig = expoConfig.ios ?? {}
const imagePickerConfig = findPluginConfig(expoConfig.plugins, 'expo-image-picker')

if (iosConfig.supportsTablet !== false) {
  errors.push('app.json: expo.ios.supportsTablet must be false for the iPhone-only release scope.')
}

if (!imagePickerConfig) {
  errors.push('app.json: missing expo-image-picker plugin configuration.')
} else {
  if (looksPlaceholder(imagePickerConfig.photosPermission)) {
    errors.push('app.json: expo-image-picker.photosPermission is missing or placeholder-like.')
  }
  if (looksPlaceholder(imagePickerConfig.cameraPermission)) {
    errors.push('app.json: expo-image-picker.cameraPermission is missing or placeholder-like.')
  }
  if (imagePickerConfig.microphonePermission !== false) {
    errors.push(
      'app.json: expo-image-picker.microphonePermission must be false for the current release scope.',
    )
  }
}

const privacyLink = extractLink('privacy')
const termsLink = extractLink('terms')
const supportLink = extractLink('support')

if (looksPlaceholder(privacyLink) || !/^https?:\/\//i.test(privacyLink)) {
  errors.push('src/config/appLinks.ts: privacy link must be a non-placeholder https URL.')
}

if (looksPlaceholder(termsLink) || !/^https?:\/\//i.test(termsLink)) {
  errors.push('src/config/appLinks.ts: terms link must be a non-placeholder https URL.')
}

if (
  looksPlaceholder(supportLink) ||
  (!/^https?:\/\//i.test(supportLink) && !/^mailto:/i.test(supportLink))
) {
  errors.push(
    'src/config/appLinks.ts: support link must be a non-placeholder https URL or mailto link.',
  )
}

if (errors.length > 0) {
  console.error('\n❌ Release config verification failed:\n')
  for (const error of errors) {
    console.error(`  • ${error}`)
  }
  console.error('')
  process.exit(1)
}

console.log('✅ Release config verified:')
console.log(`   supportsTablet: ${iosConfig.supportsTablet}`)
console.log('   expo-image-picker: configured with explicit camera/photo permissions')
console.log(`   privacy: ${privacyLink}`)
console.log(`   terms: ${termsLink}`)
console.log(`   support: ${supportLink}`)
