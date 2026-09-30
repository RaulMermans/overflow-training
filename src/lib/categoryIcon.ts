import type { ExerciseCategory } from '../db/workouts'

export interface CategoryIconSpec {
  pack: 'MaterialCommunityIcons'
  name: string
}

const categoryIconMap: Record<ExerciseCategory, string> = {
  strength: 'dumbbell',
  warmup: 'fire',
  stretch: 'human-handsup',
  cardio: 'run',
  mobility: 'yoga',
  yoga: 'yoga',
  pilates: 'human-handsup',
  other: 'dots-horizontal',
}

export function getCategoryIcon(
  category: ExerciseCategory | string | null | undefined,
): CategoryIconSpec {
  const name =
    category && Object.prototype.hasOwnProperty.call(categoryIconMap, category)
      ? categoryIconMap[category as ExerciseCategory]
      : 'dots-horizontal'
  return { pack: 'MaterialCommunityIcons', name }
}
