import type { Language } from './index'

const LOCALE_BY_LANGUAGE: Record<Language, string> = {
  en: 'en-US',
  es: 'es-ES',
}

function toValidDate(input: Date | string | number): Date | null {
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatWithLocale(
  date: Date,
  language: Language,
  formatter: (dateValue: Date, locale: string) => string,
): string {
  const locale = LOCALE_BY_LANGUAGE[language] ?? LOCALE_BY_LANGUAGE.en

  try {
    return formatter(date, locale)
  } catch {
    return formatter(date, 'en-US')
  }
}

export function getLocaleForLanguage(language: Language): string {
  return LOCALE_BY_LANGUAGE[language] ?? LOCALE_BY_LANGUAGE.en
}

export function formatDateByLanguage(
  input: Date | string | number,
  language: Language,
  options?: Intl.DateTimeFormatOptions,
): string | null {
  const date = toValidDate(input)
  if (!date) return null

  return formatWithLocale(date, language, (dateValue, locale) =>
    dateValue.toLocaleDateString(locale, options),
  )
}

export function formatTimeByLanguage(
  input: Date | string | number,
  language: Language,
  options?: Intl.DateTimeFormatOptions,
): string | null {
  const date = toValidDate(input)
  if (!date) return null

  return formatWithLocale(date, language, (dateValue, locale) =>
    dateValue.toLocaleTimeString(locale, options),
  )
}

export function formatDateTimeByLanguage(
  input: Date | string | number,
  language: Language,
  dateOptions?: Intl.DateTimeFormatOptions,
  timeOptions?: Intl.DateTimeFormatOptions,
  separator: string = ' · ',
): string | null {
  const datePart = formatDateByLanguage(input, language, dateOptions)
  const timePart = formatTimeByLanguage(input, language, timeOptions)

  if (!datePart || !timePart) return null
  return `${datePart}${separator}${timePart}`
}

export function formatWeekdayShortByLanguage(
  input: Date | string | number,
  language: Language,
): string | null {
  return formatDateByLanguage(input, language, { weekday: 'short' })
}
