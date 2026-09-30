import * as fs from 'fs'
import * as path from 'path'
import {
  APP_SCHEME,
  GOOGLE_CALENDAR_CALLBACK_PATH,
  GOOGLE_CALENDAR_CALLBACK_URI,
  LOGIN_CALLBACK_PATH,
  LOGIN_CALLBACK_URI,
  RESET_PASSWORD_PATH,
  RESET_PASSWORD_URI,
} from '../src/config/authRedirects'
import appJson from '../app.json'

describe('auth redirect contract', () => {
  it('APP_SCHEME matches app.json scheme', () => {
    expect(APP_SCHEME).toBe(appJson.expo.scheme)
  })

  it('LOGIN_CALLBACK_URI uses the correct scheme and path', () => {
    expect(LOGIN_CALLBACK_URI).toBe(`${APP_SCHEME}://${LOGIN_CALLBACK_PATH}`)
  })

  it('RESET_PASSWORD_URI uses the correct scheme and path', () => {
    expect(RESET_PASSWORD_URI).toBe(`${APP_SCHEME}://${RESET_PASSWORD_PATH}`)
  })

  it('GOOGLE_CALENDAR_CALLBACK_URI uses the correct scheme and path', () => {
    expect(GOOGLE_CALENDAR_CALLBACK_URI).toBe(`${APP_SCHEME}://${GOOGLE_CALENDAR_CALLBACK_PATH}`)
  })

  it('login-callback route file exists', () => {
    const routePath = path.resolve(__dirname, '..', 'app', '(auth)', 'login-callback.tsx')
    expect(fs.existsSync(routePath)).toBe(true)
  })

  it('reset-password route file exists', () => {
    const routePath = path.resolve(__dirname, '..', 'app', '(auth)', 'reset-password.tsx')
    expect(fs.existsSync(routePath)).toBe(true)
  })
})
