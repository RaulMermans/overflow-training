import {
  distanceUnitForPreference,
  formatDistanceLabel,
  formatDurationInput,
  formatPaceLabel,
  parseDistanceInput,
  parseDurationInput,
} from '../src/features/workoutSession/setMetrics'

describe('set metrics helpers', () => {
  it('parses duration from mm:ss', () => {
    expect(parseDurationInput('12:34')).toBe(754)
  })

  it('formats duration for draft input', () => {
    expect(formatDurationInput(754)).toBe('12:34')
  })

  it('parses and formats distance by unit preference', () => {
    expect(parseDistanceInput('2', 'kg')).toBe(2000)
    expect(formatDistanceLabel(2000, 'kg')).toBe('2')
  })

  it('computes pace for distance and duration', () => {
    expect(formatPaceLabel(2000, 12 * 60, 'kg')).toBe('6:00/km')
  })

  it('maps unit preference to distance unit', () => {
    expect(distanceUnitForPreference('kg')).toBe('km')
    expect(distanceUnitForPreference('lb')).toBe('mi')
  })
})
