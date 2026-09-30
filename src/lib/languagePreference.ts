import * as SecureStore from 'expo-secure-store'
import { getLocales } from 'expo-localization'
import type { Language } from '../i18n'

const LANGUAGE_KEY = 'app.language.v1'

export function getDeviceDefault(): Language {
  try {
    const locales = getLocales()
    const primary = locales[0]?.languageCode ?? ''
    return primary.startsWith('es') ? 'es' : 'en'
  } catch {
    return 'en'
  }
}

export async function loadLanguagePreference(): Promise<Language> {
  try {
    const raw = await SecureStore.getItemAsync(LANGUAGE_KEY)
    if (raw === 'es') return 'es'
    if (raw === 'en') return 'en'
    return getDeviceDefault()
  } catch {
    return getDeviceDefault()
  }
}

export async function saveLanguagePreference(lang: Language): Promise<void> {
  try {
    await SecureStore.setItemAsync(LANGUAGE_KEY, lang)
  } catch {
    // Persistence failures should not block language usage.
  }
}
