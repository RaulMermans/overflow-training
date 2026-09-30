export type AuthCallbackParams = {
  code?: string
  accessToken?: string
  refreshToken?: string
}

export type ResetLinkParams = AuthCallbackParams

let lastHandledAuthCallbackCode: string | null = null

function getUrlSection(url: string, separator: '?' | '#'): string {
  const sectionStart = url.indexOf(separator)
  if (sectionStart === -1) return ''

  if (separator === '?') {
    const hashIndex = url.indexOf('#')
    const sectionEnd = hashIndex === -1 ? url.length : hashIndex
    return url.slice(sectionStart + 1, sectionEnd)
  }

  return url.slice(sectionStart + 1)
}

function getParam(section: string, key: string): string | undefined {
  if (!section) return undefined
  const params = new URLSearchParams(section)
  const value = params.get(key)
  return value === null ? undefined : value
}

export function parseAuthCallbackParams(url: string): AuthCallbackParams {
  const query = getUrlSection(url, '?')
  const hash = getUrlSection(url, '#')

  return {
    code: getParam(query, 'code'),
    accessToken: getParam(hash, 'access_token'),
    refreshToken: getParam(hash, 'refresh_token'),
  }
}

export function parseResetParams(url: string): ResetLinkParams {
  return parseAuthCallbackParams(url)
}

export function hasHandledAuthCallbackCode(code: string): boolean {
  return lastHandledAuthCallbackCode === code
}

export function markAuthCallbackCodeHandled(code: string) {
  lastHandledAuthCallbackCode = code
}
