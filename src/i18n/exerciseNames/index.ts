import type { Language } from '../index'
import en from './en'
import es from './es'

const maps: Record<Language, Record<string, string>> = { en, es }

/**
 * Returns the localized display name for an exercise given its slug.
 *
 * Fallback chain: requested language → English map → englishName param → slug.
 */
export function getLocalizedExerciseName(
  slug: string | null | undefined,
  language: Language,
  englishName?: string,
): string {
  if (!slug) return englishName ?? ''
  return maps[language]?.[slug] ?? maps.en[slug] ?? englishName ?? slug
}
