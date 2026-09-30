import {
  formatDateByLanguage,
  formatDateTimeByLanguage,
  formatTimeByLanguage,
  formatWeekdayShortByLanguage,
  getLocaleForLanguage,
} from '../src/i18n/formatters'

describe('i18n formatters', () => {
  const iso = '2026-02-22T22:34:47.000Z'

  it('maps app language to locale', () => {
    expect(getLocaleForLanguage('en')).toBe('en-US')
    expect(getLocaleForLanguage('es')).toBe('es-ES')
  })

  it('formats date using the selected language locale', () => {
    const date = new Date(iso)
    expect(
      formatDateByLanguage(date, 'en', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    ).toBe(
      date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    )

    expect(
      formatDateByLanguage(date, 'es', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    ).toBe(
      date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    )
  })

  it('formats time using the selected language locale', () => {
    const date = new Date(iso)
    expect(
      formatTimeByLanguage(date, 'en', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    ).toBe(
      date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    )

    expect(
      formatTimeByLanguage(date, 'es', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    ).toBe(
      date.toLocaleTimeString('es-ES', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    )
  })

  it('formats date-time with a custom separator', () => {
    const date = new Date(iso)
    const formatted = formatDateTimeByLanguage(
      date,
      'en',
      { month: 'short', day: 'numeric', year: 'numeric' },
      { hour: 'numeric', minute: '2-digit' },
      ' - ',
    )

    expect(formatted).toBe(
      `${date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })} - ${date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })}`,
    )
  })

  it('formats short weekday labels using locale', () => {
    const date = new Date('2026-02-23T12:00:00.000Z')
    expect(formatWeekdayShortByLanguage(date, 'en')).toBe(
      date.toLocaleDateString('en-US', { weekday: 'short' }),
    )
    expect(formatWeekdayShortByLanguage(date, 'es')).toBe(
      date.toLocaleDateString('es-ES', { weekday: 'short' }),
    )
  })

  it('returns null for invalid dates', () => {
    expect(formatDateByLanguage('not-a-date', 'en')).toBeNull()
    expect(formatTimeByLanguage('not-a-date', 'es')).toBeNull()
    expect(formatDateTimeByLanguage('not-a-date', 'en')).toBeNull()
    expect(formatWeekdayShortByLanguage('not-a-date', 'es')).toBeNull()
  })
})
