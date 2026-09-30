import fs from 'node:fs'

const appConfig = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8'))
const easConfig = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url), 'utf8'))

const expo = appConfig.expo ?? {}
const submitIos = easConfig.submit?.production?.ios ?? {}

const identity = {
  slug: expo.slug ?? null,
  bundleIdentifier: expo.ios?.bundleIdentifier ?? null,
  scheme: expo.scheme ?? null,
  version: expo.version ?? null,
  buildNumber: expo.ios?.buildNumber ?? null,
  owner: expo.owner ?? null,
  projectId: expo.extra?.eas?.projectId ?? null,
  ascAppId: submitIos.ascAppId ?? null,
  appleTeamId: submitIos.appleTeamId ?? null,
}

console.log(JSON.stringify(identity, null, 2))
