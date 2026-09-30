import { computeVolumeDeltaPercent, summarizeReflection } from '../src/features/progress/reflection'

describe('progress/reflection', () => {
  it('computes volume delta with baseline previous volume', () => {
    expect(computeVolumeDeltaPercent(1200, 1000)).toBe(20)
    expect(computeVolumeDeltaPercent(950, 1000)).toBe(-5)
  })

  it('handles zero previous volume safely', () => {
    expect(computeVolumeDeltaPercent(0, 0)).toBe(0)
    expect(computeVolumeDeltaPercent(500, 0)).toBe(100)
  })

  it('classifies improving when positive PR deltas dominate', () => {
    const summary = summarizeReflection({
      prDeltas: [5, 2, null, -1],
      currentWeeklyVolume: 900,
      previousWeeklyVolume: 900,
    })

    expect(summary.status).toBe('improving')
    expect(summary.headline).toBe('Improving')
  })

  it('classifies improving when volume trend is strongly positive', () => {
    const summary = summarizeReflection({
      prDeltas: [0, null, -2],
      currentWeeklyVolume: 1100,
      previousWeeklyVolume: 1000,
    })

    expect(summary.status).toBe('improving')
    expect(summary.volumeTrend).toBe('up')
  })

  it('classifies needs attention only when PR declines dominate and volume drops', () => {
    const summary = summarizeReflection({
      prDeltas: [-5, -2, 0],
      currentWeeklyVolume: 900,
      previousWeeklyVolume: 1000,
    })

    expect(summary.status).toBe('needsAttention')
    expect(summary.headline).toBe('Needs attention')
  })

  it('falls back to stable for mixed or neutral signals', () => {
    const summary = summarizeReflection({
      prDeltas: [2, -2, 0],
      currentWeeklyVolume: 1000,
      previousWeeklyVolume: 1000,
    })

    expect(summary.status).toBe('stable')
    expect(summary.headline).toBe('Stable')
  })
})
