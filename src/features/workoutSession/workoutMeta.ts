const EFFORT_LABELS = {
  1: 'Very light',
  2: 'Light',
  3: 'Moderate',
  4: 'Hard',
  5: 'Very hard',
} as const

type EffortLabelRating = keyof typeof EFFORT_LABELS

const EFFORT_PATTERN = /^Effort:\s*([0-9]{1,2})(?:\s*\/\s*([0-9]{1,2}))?(?:\s*\(([^)]+)\))?$/i
const NOTE_PATTERN = /^Note:\s*(.*)$/i

function toValidEffortRating(value: number | null | undefined): EffortLabelRating | null {
  if (typeof value !== 'number') return null
  if (!Number.isInteger(value)) return null
  if (value < 1 || value > 5) return null
  return value as EffortLabelRating
}

function toSupportedEffortValue(
  value: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isInteger(value)) return null
  if (value < 1 || value > 10) return null

  if (denominator === 5) {
    return value >= 1 && value <= 5 ? value : null
  }

  if (denominator === 10 || denominator == null) {
    return value
  }

  return null
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

export function getEffortLabel(value: number): string | null {
  const rating = toValidEffortRating(value)
  if (!rating) return null
  return EFFORT_LABELS[rating]
}

export function formatEffortLine(value: number): string | null {
  const rating = toValidEffortRating(value)
  if (!rating) return null
  return `Effort: ${rating}/5 (${EFFORT_LABELS[rating]})`
}

export interface ParsedWorkoutMetaNotes {
  effortRating: number | null
  effortLabel: string | null
  sessionNote: string | null
  remainingNotes: string | null
}

export function parseWorkoutMetaNotes(notes: string | null | undefined): ParsedWorkoutMetaNotes {
  const normalized = normalizeText(notes)
  if (!normalized) {
    return {
      effortRating: null,
      effortLabel: null,
      sessionNote: null,
      remainingNotes: null,
    }
  }

  const lines = normalized.split('\n')
  const remainingLines: string[] = []
  let effortRating: number | null = null
  let effortLabel: string | null = null
  let sessionNote: string | null = null

  for (const line of lines) {
    if (!effortRating) {
      const effortMatch = line.match(EFFORT_PATTERN)
      if (effortMatch) {
        const parsedRating = Number.parseInt(effortMatch[1], 10)
        const parsedDenominator = effortMatch[2] ? Number.parseInt(effortMatch[2], 10) : null
        const rating = toSupportedEffortValue(parsedRating, parsedDenominator)
        if (rating) {
          effortRating = rating
          effortLabel = getEffortLabel(rating)
          continue
        }
      }
    }

    if (!sessionNote) {
      const noteMatch = line.match(NOTE_PATTERN)
      if (noteMatch) {
        sessionNote = normalizeText(noteMatch[1])
        continue
      }
    }

    remainingLines.push(line)
  }

  const remainingNotes = normalizeText(remainingLines.join('\n'))

  return {
    effortRating,
    effortLabel,
    sessionNote,
    remainingNotes,
  }
}

interface ComposeWorkoutMetaInput {
  effortRating?: number | null
  sessionNote?: string | null
  existingNotes?: string | null
}

export function composeWorkoutMetaNotes({
  effortRating,
  sessionNote,
  existingNotes,
}: ComposeWorkoutMetaInput): string | null {
  const parsed = parseWorkoutMetaNotes(existingNotes)
  const parsedEffort = toValidEffortRating(parsed.effortRating)
  const resolvedEffort = toValidEffortRating(effortRating ?? null) ?? parsedEffort
  const resolvedSessionNote = normalizeText(sessionNote) ?? parsed.sessionNote
  const remainingNotes = parsed.remainingNotes

  const lines: string[] = []
  if (resolvedEffort) {
    lines.push(`Effort: ${resolvedEffort}/5 (${EFFORT_LABELS[resolvedEffort]})`)
  }
  if (resolvedSessionNote) {
    lines.push(`Note: ${resolvedSessionNote}`)
  }
  if (remainingNotes) {
    lines.push(remainingNotes)
  }

  return lines.length > 0 ? lines.join('\n') : null
}
