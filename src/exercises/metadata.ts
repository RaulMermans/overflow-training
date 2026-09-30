export interface ExerciseMetadata {
  muscles: string[]
  equipment?: string
  cues: string[]
  demoAsset?: number
}

export interface ExerciseMetadataInput {
  slug?: string | null
  muscleGroup?: string | null
  equipment?: string | null
}

const METADATA_BY_SLUG: Record<string, ExerciseMetadata> = {
  'bench-press': {
    muscles: ['chest', 'shoulders', 'triceps'],
    cues: ['brace', 'stackWrists', 'controlledLowering'],
    equipment: 'barbell',
  },
  squat: {
    muscles: ['quads', 'glutes', 'core'],
    cues: ['brace', 'kneeTrack', 'fullFootPressure'],
    equipment: 'barbell',
  },
  deadlift: {
    muscles: ['hamstrings', 'glutes', 'back'],
    cues: ['brace', 'neutralSpine', 'driveFloor'],
    equipment: 'barbell',
  },
  'overhead-press': {
    muscles: ['shoulders', 'triceps', 'core'],
    cues: ['brace', 'stackWrists', 'headThrough'],
    equipment: 'barbell',
  },
  'lat-pulldown': {
    muscles: ['lats', 'biceps', 'upperBack'],
    cues: ['elbowsToHips', 'controlledLowering', 'shouldersDown'],
    equipment: 'machine',
  },
  'dumbbell-row': {
    muscles: ['lats', 'upperBack', 'biceps'],
    cues: ['neutralSpine', 'elbowsToHips', 'controlledLowering'],
    equipment: 'dumbbell',
  },
  'bicep-curl': {
    muscles: ['biceps', 'forearms'],
    cues: ['elbowsStill', 'fullRange', 'controlledLowering'],
    equipment: 'dumbbell',
  },
  'tricep-pushdown': {
    muscles: ['triceps', 'forearms'],
    cues: ['elbowsStill', 'fullExtension', 'controlledLowering'],
    equipment: 'cable',
  },
}

function toSlug(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function toMuscleKey(value: string | null | undefined): string | null {
  const normalized = toSlug(value).replace(/\s+/g, '-')
  if (!normalized) return null

  switch (normalized) {
    case 'legs':
      return 'quads'
    case 'arms':
      return 'biceps'
    case 'back':
      return 'back'
    case 'chest':
      return 'chest'
    case 'shoulders':
      return 'shoulders'
    case 'core':
      return 'core'
    case 'full-body':
    case 'full_body':
    case 'fullbody':
      return 'fullBody'
    default:
      return normalized
  }
}

export function resolveExerciseMetadata(input: ExerciseMetadataInput): ExerciseMetadata {
  const slug = toSlug(input.slug)
  const fromSlug = METADATA_BY_SLUG[slug]
  if (fromSlug) {
    return {
      ...fromSlug,
      equipment: input.equipment ?? fromSlug.equipment,
    }
  }

  const fallbackMuscle = toMuscleKey(input.muscleGroup)

  return {
    muscles: fallbackMuscle ? [fallbackMuscle] : ['fullBody'],
    equipment: input.equipment ?? undefined,
    cues: ['brace', 'controlledLowering', 'fullRange'],
  }
}
