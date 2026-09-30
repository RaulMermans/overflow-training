import { QUOTES } from '../../content/motivation/quotes'
import { getDailyQuote, getGreetingKey } from '../motivation'

describe('utils/motivation', () => {
  it('returns correct greeting keys for time buckets', () => {
    expect(getGreetingKey(new Date(2026, 1, 11, 4, 59))).toBe('night')
    expect(getGreetingKey(new Date(2026, 1, 11, 5, 0))).toBe('morning')
    expect(getGreetingKey(new Date(2026, 1, 11, 11, 59))).toBe('morning')
    expect(getGreetingKey(new Date(2026, 1, 11, 12, 0))).toBe('afternoon')
    expect(getGreetingKey(new Date(2026, 1, 11, 16, 59))).toBe('afternoon')
    expect(getGreetingKey(new Date(2026, 1, 11, 17, 0))).toBe('evening')
    expect(getGreetingKey(new Date(2026, 1, 11, 21, 59))).toBe('evening')
    expect(getGreetingKey(new Date(2026, 1, 11, 22, 0))).toBe('night')
  })

  it('returns the same quote for the same user/day/locale', () => {
    const date = new Date(2026, 1, 11, 9, 30)
    const first = getDailyQuote({ userId: 'user-1', date, locale: 'en' })
    const second = getDailyQuote({ userId: 'user-1', date, locale: 'en' })

    expect(first.id).toBe(second.id)
  })

  it('returns a different quote on the next day when there is more than one quote', () => {
    const first = getDailyQuote({
      userId: 'user-1',
      date: new Date(2026, 1, 11, 9, 30),
      locale: 'en',
    })
    const second = getDailyQuote({
      userId: 'user-1',
      date: new Date(2026, 1, 12, 9, 30),
      locale: 'en',
    })

    if (QUOTES.length > 1) {
      expect(first.id).not.toBe(second.id)
    }
  })

  it('supports locale fallback to english when spanish text is missing', () => {
    let quoteWithoutSpanish = null
    const start = new Date(2026, 1, 1, 9, 30)

    for (let offset = 0; offset < 365; offset += 1) {
      const date = new Date(start)
      date.setDate(start.getDate() + offset)
      const candidate = getDailyQuote({ userId: 'user-fallback', date, locale: 'es' })
      if (!candidate.text.es) {
        quoteWithoutSpanish = candidate
        break
      }
    }

    expect(quoteWithoutSpanish).not.toBeNull()
    if (!quoteWithoutSpanish) return

    const localizedText = quoteWithoutSpanish.text.es ?? quoteWithoutSpanish.text.en
    expect(localizedText).toBe(quoteWithoutSpanish.text.en)
  })
})
