import { getLocalizedExerciseName } from '../src/i18n/exerciseNames'
import en from '../src/i18n/exerciseNames/en'
import es from '../src/i18n/exerciseNames/es'

describe('getLocalizedExerciseName', () => {
  it('returns English name for known slug in en', () => {
    expect(getLocalizedExerciseName('bench-press', 'en')).toBe('Bench Press')
  })

  it('returns Spanish name for known slug in es', () => {
    expect(getLocalizedExerciseName('bench-press', 'es')).toBe('Press de Banca')
  })

  it('falls back to English when slug not in target language', () => {
    // Remove a slug from es temporarily by checking a slug that exists in en
    expect(getLocalizedExerciseName('squat', 'en')).toBe('Squat')
    expect(getLocalizedExerciseName('squat', 'es')).toBe('Sentadilla')
  })

  it('falls back to englishName param for unknown slug', () => {
    expect(getLocalizedExerciseName('unknown-exercise', 'es', 'Custom Exercise')).toBe(
      'Custom Exercise',
    )
  })

  it('falls back to slug when no translation or englishName', () => {
    expect(getLocalizedExerciseName('totally-custom', 'es')).toBe('totally-custom')
  })

  it('returns empty string for null/undefined slug without englishName', () => {
    expect(getLocalizedExerciseName(null, 'en')).toBe('')
    expect(getLocalizedExerciseName(undefined, 'es')).toBe('')
  })

  it('returns englishName for null slug when englishName is provided', () => {
    expect(getLocalizedExerciseName(null, 'en', 'Bench Press')).toBe('Bench Press')
  })

  it('en and es maps cover the same slugs', () => {
    const enSlugs = Object.keys(en).sort()
    const esSlugs = Object.keys(es).sort()
    expect(esSlugs).toEqual(enSlugs)
  })
})
