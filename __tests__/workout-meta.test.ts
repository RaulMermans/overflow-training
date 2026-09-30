import {
  composeWorkoutMetaNotes,
  formatEffortLine,
  getEffortLabel,
  parseWorkoutMetaNotes,
} from '../src/features/workoutSession/workoutMeta'

describe('workoutSession/workoutMeta', () => {
  it('maps effort labels from 1-5', () => {
    expect(getEffortLabel(1)).toBe('Very light')
    expect(getEffortLabel(3)).toBe('Moderate')
    expect(getEffortLabel(5)).toBe('Very hard')
    expect(getEffortLabel(9)).toBeNull()
  })

  it('formats effort line consistently', () => {
    expect(formatEffortLine(4)).toBe('Effort: 4/5 (Hard)')
  })

  it('composes clean notes with effort and session note', () => {
    expect(composeWorkoutMetaNotes({ effortRating: 4, sessionNote: 'Felt focused.' })).toBe(
      'Effort: 4/5 (Hard)\nNote: Felt focused.',
    )
  })

  it('merges metadata while preserving existing non-meta notes', () => {
    const notes = composeWorkoutMetaNotes({
      effortRating: 2,
      sessionNote: 'Took it easy.',
      existingNotes: 'Keep elbows tucked.',
    })

    expect(notes).toBe('Effort: 2/5 (Light)\nNote: Took it easy.\nKeep elbows tucked.')
  })

  it('parses effort and note from structured notes and keeps remaining text', () => {
    const parsed = parseWorkoutMetaNotes(
      'Effort: 5/5 (Very hard)\nNote: Last set burned\nLegacy context line',
    )

    expect(parsed.effortRating).toBe(5)
    expect(parsed.effortLabel).toBe('Very hard')
    expect(parsed.sessionNote).toBe('Last set burned')
    expect(parsed.remainingNotes).toBe('Legacy context line')
  })

  it('handles plain notes without structured metadata', () => {
    const parsed = parseWorkoutMetaNotes('Felt great')
    expect(parsed.effortRating).toBeNull()
    expect(parsed.sessionNote).toBeNull()
    expect(parsed.remainingNotes).toBe('Felt great')
  })

  it('parses 1-10 effort values from legacy notes', () => {
    const parsed = parseWorkoutMetaNotes('Effort: 8/10\nNote: Tough finish')
    expect(parsed.effortRating).toBe(8)
    expect(parsed.effortLabel).toBeNull()
    expect(parsed.sessionNote).toBe('Tough finish')
  })
})
