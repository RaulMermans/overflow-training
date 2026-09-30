import type { Language } from '../i18n'
import { QUOTES, type MotivationQuote } from '../content/motivation/quotes'

function hashString(input: string): number {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }
  return hash
}

function toLocalDayOrdinal(date: Date): number {
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()
  return Math.floor(Date.UTC(year, month, day) / (1000 * 60 * 60 * 24))
}

export function getGreetingKey(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = date.getHours()

  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

interface GetDailyQuoteParams {
  userId?: string
  date?: Date
  locale: Language
}

export function getDailyQuote({
  userId,
  date = new Date(),
  locale,
}: GetDailyQuoteParams): MotivationQuote {
  if (QUOTES.length === 0) {
    return {
      id: 'fallback',
      text: { en: '' },
      author: '',
    }
  }

  const dayOrdinal = toLocalDayOrdinal(date)
  const userSeed = userId?.trim() || 'anon'
  const baseHash = hashString(`${userSeed}|${locale}`)
  const index = (baseHash + dayOrdinal) % QUOTES.length

  return QUOTES[index]
}
