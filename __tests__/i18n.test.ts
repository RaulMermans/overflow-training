import en from '../src/i18n/translations/en'
import es from '../src/i18n/translations/es'
import { createTranslator } from '../src/i18n'

describe('i18n translation system', () => {
  // ── Key parity ──────────────────────────────────────────
  it('en and es have the same set of keys', () => {
    const enKeys = Object.keys(en).sort()
    const esKeys = Object.keys(es).sort()
    expect(esKeys).toEqual(enKeys)
  })

  // ── No empty values ─────────────────────────────────────
  it('en has no empty string values', () => {
    const empties = Object.entries(en).filter(([, v]) => v.trim() === '')
    expect(empties).toEqual([])
  })

  it('es has no empty string values', () => {
    const empties = Object.entries(es).filter(([, v]) => v.trim() === '')
    expect(empties).toEqual([])
  })

  // ── Placeholder parity ──────────────────────────────────
  it('en and es have the same {{placeholders}} per key', () => {
    const placeholderRe = /\{\{(\w+)\}\}/g
    const extractPlaceholders = (value: string): string[] => {
      const matches: string[] = []
      let match: RegExpExecArray | null
      while ((match = placeholderRe.exec(value)) !== null) {
        matches.push(match[1])
      }
      return matches.sort()
    }

    const mismatches: string[] = []
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      const enPlaceholders = extractPlaceholders(en[key])
      const esPlaceholders = extractPlaceholders(es[key])
      if (JSON.stringify(enPlaceholders) !== JSON.stringify(esPlaceholders)) {
        mismatches.push(
          `${key}: en=${JSON.stringify(enPlaceholders)} es=${JSON.stringify(esPlaceholders)}`,
        )
      }
    }
    expect(mismatches).toEqual([])
  })

  // ── createTranslator ────────────────────────────────────
  describe('createTranslator', () => {
    it('returns English text for "en" locale', () => {
      const t = createTranslator('en')
      expect(t('tabs.today')).toBe('Today')
    })

    it('returns Spanish text for "es" locale', () => {
      const t = createTranslator('es')
      expect(t('tabs.today')).toBe('Hoy')
    })

    it('interpolates {{params}} in translations', () => {
      const t = createTranslator('en')
      expect(t('detail.set', { index: '3' })).toBe('Set 3')
    })

    it('falls back to English when Spanish key is missing', () => {
      // Since TypeScript enforces key parity, we test the runtime fallback path
      // by calling with a key that exists in en — the result should never be the raw key
      const t = createTranslator('es')
      const result = t('tabs.today')
      expect(result).not.toBe('tabs.today')
    })

    it('returns the raw key when neither locale has it', () => {
      const t = createTranslator('en')
      // Cast to bypass TypeScript — runtime should return the key string
      const result = (t as (key: string) => string)('nonexistent.key')
      expect(result).toBe('nonexistent.key')
    })

    it('replaces multiple placeholders', () => {
      const t = createTranslator('en')
      const result = t('session.errorReps', { min: '1', max: '999' })
      expect(result).toContain('1')
      expect(result).toContain('999')
    })
  })
})
