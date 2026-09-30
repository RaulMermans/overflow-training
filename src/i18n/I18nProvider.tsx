import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createTranslator, type Language, type TranslationKey } from './index'
import { loadLanguagePreference, saveLanguagePreference } from '../lib/languagePreference'

export interface I18nContextValue {
  language: Language
  setLanguage: (lang: Language) => Promise<void>
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)

interface I18nProviderProps {
  children: ReactNode
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    void loadLanguagePreference().then(setLanguageState)
  }, [])

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang)
    await saveLanguagePreference(lang)
  }, [])

  const t = useMemo(() => createTranslator(language), [language])

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
