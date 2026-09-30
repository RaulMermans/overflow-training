import en from './translations/en'
import es from './translations/es'

export type Language = 'en' | 'es'

export type TranslationKey = keyof typeof en

type TranslatorFn = (key: TranslationKey, params?: Record<string, string | number>) => string

export function createTranslator(lang: Language): TranslatorFn {
  const translations: Record<string, string> = lang === 'es' ? es : en
  const fallback: Record<string, string> = en

  return function t(key: TranslationKey, params?: Record<string, string | number>): string {
    let value: string = translations[key] ?? fallback[key] ?? key

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
      }
    }

    return value
  }
}
