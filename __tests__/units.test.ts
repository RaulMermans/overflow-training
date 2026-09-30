import {
  convertWeightBetweenUnits,
  formatSetSummary,
  formatWeight,
  fromWeightKg,
  normalizeUnitsLabel,
  resolveDisplayWeight,
  toWeightKg,
} from '../src/lib/units'

describe('units helper', () => {
  it('normalizes unsupported units to lb', () => {
    expect(normalizeUnitsLabel('kg')).toBe('kg')
    expect(normalizeUnitsLabel('lb')).toBe('lb')
    expect(normalizeUnitsLabel('stone')).toBe('lb')
  })

  it('formats weights with unit suffix', () => {
    expect(formatWeight(135, 'lb')).toBe('135 lb')
    expect(formatWeight(62.5, 'kg')).toBe('62.5 kg')
  })

  it('formats set summaries using reps and weight', () => {
    expect(formatSetSummary(8, 185, 'lb')).toBe('8 x 185 lb')
    expect(formatSetSummary(5, 60, 'kg')).toBe('5 x 60 kg')
  })

  it('converts lb to canonical kg and back', () => {
    expect(toWeightKg(225, 'lb')).toBe(102.058283)
    expect(fromWeightKg(100, 'lb')).toBe(220.5)
  })

  it('converts display weights between kg and lb', () => {
    expect(convertWeightBetweenUnits(100, 'kg', 'lb')).toBe(220.5)
    expect(convertWeightBetweenUnits(220.5, 'lb', 'kg')).toBe(100)
    expect(convertWeightBetweenUnits(42, 'kg', 'kg')).toBe(42)
  })

  it('resolves canonical and legacy display weights safely', () => {
    expect(
      resolveDisplayWeight({ weight: 225, weight_kg: 102.058283, is_weight_canonical: true }, 'lb'),
    ).toBe(225)

    expect(
      resolveDisplayWeight({ weight: 100, weight_kg: 100, is_weight_canonical: false }, 'lb'),
    ).toBe(100)
  })
})
