import {
  applyRepDecrement,
  applyRepIncrement,
  applyWeightDecrement,
  applyWeightIncrement,
  canSubmitSetDraft,
  copyLastSet,
  getDefaultSetDraft,
  getWeightDecrementLabel,
  getWeightIncrementLabel,
} from '../src/components/workout-session/setEntry'

describe('setEntry helpers', () => {
  it('returns empty draft when no last set exists', () => {
    expect(getDefaultSetDraft(null)).toEqual({ reps: '', weight: '' })
  })

  it('defaults draft from last set values', () => {
    expect(getDefaultSetDraft({ reps: 8, weight: 135 })).toEqual({ reps: '8', weight: '135' })
  })

  it('increments reps by one when draft has value', () => {
    expect(applyRepIncrement({ reps: '10', weight: '100' })).toEqual({ reps: '11', weight: '100' })
  })

  it('starts reps at 1 when draft is empty', () => {
    expect(applyRepIncrement({ reps: '', weight: '' })).toEqual({ reps: '1', weight: '' })
  })

  it('clamps reps at 1 when decrementing', () => {
    expect(applyRepDecrement({ reps: '1', weight: '100' })).toEqual({ reps: '1', weight: '100' })
    expect(applyRepDecrement({ reps: '', weight: '' })).toEqual({ reps: '1', weight: '' })
  })

  it('increments weight with lb step', () => {
    expect(applyWeightIncrement({ reps: '5', weight: '135' }, 'lb')).toEqual({
      reps: '5',
      weight: '140',
    })
  })

  it('increments weight with kg step', () => {
    expect(applyWeightIncrement({ reps: '5', weight: '60' }, 'kg')).toEqual({
      reps: '5',
      weight: '62.5',
    })
  })

  it('clamps weight at 0 when decrementing', () => {
    expect(applyWeightDecrement({ reps: '5', weight: '2.5' }, 'kg')).toEqual({
      reps: '5',
      weight: '0',
    })
    expect(applyWeightDecrement({ reps: '5', weight: '' }, 'lb')).toEqual({
      reps: '5',
      weight: '0',
    })
  })

  it('copies last set when available', () => {
    expect(copyLastSet({ reps: '', weight: '' }, { reps: 12, weight: 50 })).toEqual({
      reps: '12',
      weight: '50',
    })
  })

  it('keeps draft when no last set exists', () => {
    expect(copyLastSet({ reps: '8', weight: '90' }, null)).toEqual({ reps: '8', weight: '90' })
  })

  it('validates draft values correctly', () => {
    expect(canSubmitSetDraft({ reps: '5', weight: '100' })).toBe(true)
    expect(canSubmitSetDraft({ reps: '0', weight: '100' })).toBe(false)
    expect(canSubmitSetDraft({ reps: '5', weight: '-1' })).toBe(false)
  })

  it('returns expected increment labels', () => {
    expect(getWeightIncrementLabel('lb')).toBe('+5 lb')
    expect(getWeightIncrementLabel('kg')).toBe('+2.5 kg')
    expect(getWeightDecrementLabel('lb')).toBe('-5 lb')
    expect(getWeightDecrementLabel('kg')).toBe('-2.5 kg')
  })
})
