import { computeProgressionSuggestion } from '../src/features/programs/progression'

function makePerformance(
  sets: Array<{ reps: number; weight: number; weightKg: number; setIndex: number }>,
) {
  return {
    sets: sets.map((set) => ({
      reps: set.reps,
      weight: set.weight,
      weight_kg: set.weightKg,
      is_weight_canonical: true,
      setIndex: set.setIndex,
    })),
  }
}

describe('program progression', () => {
  it('increases load when targets are fully met', () => {
    const suggestion = computeProgressionSuggestion({
      lastPerformance: makePerformance([
        { reps: 5, weight: 100, weightKg: 100, setIndex: 0 },
        { reps: 5, weight: 100, weightKg: 100, setIndex: 1 },
        { reps: 5, weight: 100, weightKg: 100, setIndex: 2 },
      ]),
      targetSets: 3,
      targetReps: 5,
      exerciseType: 'compound',
      units: 'kg',
    })

    expect(suggestion).not.toBeNull()
    expect(suggestion?.decision).toBe('increase')
    expect(suggestion?.suggestedWeight).toBe(102.5)
  })

  it('holds load on near miss (>= 90%)', () => {
    const suggestion = computeProgressionSuggestion({
      lastPerformance: makePerformance([
        { reps: 5, weight: 80, weightKg: 80, setIndex: 0 },
        { reps: 5, weight: 80, weightKg: 80, setIndex: 1 },
        { reps: 4, weight: 80, weightKg: 80, setIndex: 2 },
      ]),
      targetSets: 3,
      targetReps: 5,
      exerciseType: 'compound',
      units: 'kg',
    })

    expect(suggestion).not.toBeNull()
    expect(suggestion?.decision).toBe('hold')
    expect(suggestion?.completionRatio).toBeCloseTo(14 / 15, 3)
    expect(suggestion?.suggestedWeight).toBe(80)
  })

  it('reduces load when completion drops below 90%', () => {
    const suggestion = computeProgressionSuggestion({
      lastPerformance: makePerformance([
        { reps: 5, weight: 80, weightKg: 80, setIndex: 0 },
        { reps: 3, weight: 80, weightKg: 80, setIndex: 1 },
        { reps: 3, weight: 80, weightKg: 80, setIndex: 2 },
      ]),
      targetSets: 3,
      targetReps: 5,
      exerciseType: 'compound',
      units: 'kg',
    })

    expect(suggestion).not.toBeNull()
    expect(suggestion?.decision).toBe('reduce')
    expect(suggestion?.completionRatio).toBeCloseTo(11 / 15, 3)
    expect(suggestion?.suggestedWeight).toBe(77.5)
  })

  it('keeps lb rounding deterministic to 2.5-lb increments', () => {
    const suggestion = computeProgressionSuggestion({
      lastPerformance: makePerformance([
        { reps: 5, weight: 200, weightKg: 90.7185, setIndex: 0 },
        { reps: 5, weight: 200, weightKg: 90.7185, setIndex: 1 },
        { reps: 5, weight: 200, weightKg: 90.7185, setIndex: 2 },
      ]),
      targetSets: 3,
      targetReps: 5,
      exerciseType: 'compound',
      units: 'lb',
    })

    expect(suggestion).not.toBeNull()
    expect(suggestion?.decision).toBe('increase')
    expect(suggestion?.baseWeight).toBe(200)
    expect(suggestion?.increment).toBe(5)
    expect(suggestion?.suggestedWeight).toBe(205)
  })
})
