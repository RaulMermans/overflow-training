function randomHexDigit(): string {
  return Math.floor(Math.random() * 16).toString(16)
}

/**
 * RFC-4122-ish UUID v4 generator without extra dependencies.
 * Good enough for client-generated idempotency keys.
 */
export function generateUuid(): string {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  return template.replace(/[xy]/g, (char) => {
    if (char === 'x') return randomHexDigit()
    const value = Math.floor(Math.random() * 16)
    return ((value & 0x3) | 0x8).toString(16)
  })
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  )
}

/**
 * Deterministically maps an arbitrary string to a UUID-shaped value.
 */
export function uuidFromString(input: string): string {
  let hash1 = 0x811c9dc5
  let hash2 = 0x1000193

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    hash1 ^= code
    hash1 = Math.imul(hash1, 0x01000193)
    hash2 ^= code + index
    hash2 = Math.imul(hash2, 0x01000193)
  }

  const raw = [hash1 >>> 0, hash2 >>> 0, (hash1 ^ hash2) >>> 0, (hash1 + hash2) >>> 0]
    .map((value) => value.toString(16).padStart(8, '0'))
    .join('')

  const hex = `${raw.slice(0, 8)}${raw.slice(8, 12)}4${raw.slice(13, 16)}a${raw.slice(17, 20)}${raw.slice(20, 32)}`
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
