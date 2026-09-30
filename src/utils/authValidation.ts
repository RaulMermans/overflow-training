/** Minimum password length (aligns with Supabase default). */
export const PASSWORD_MIN_LENGTH = 6

/** Basic email format: local@domain.tld */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim())
}

export function isValidPassword(value: string): boolean {
  return value.length >= PASSWORD_MIN_LENGTH
}
