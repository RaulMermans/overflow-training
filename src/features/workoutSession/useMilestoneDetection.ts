import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExerciseDefaultsMap } from '../../lib/exerciseDefaults'
import type { WorkoutDetail } from '../../db/workouts'

type Exercise = WorkoutDetail['workout_exercises'][number]

export type MilestoneType = 'first_set' | 'halfway' | 'final_exercise' | 'pr'

export interface MilestoneEvent {
  type: MilestoneType
  exerciseName?: string
}

interface UseMilestoneDetectionInput {
  exercises: Exercise[]
  totalSets: number
  prExerciseIds: Set<string>
  exerciseDefaultsByDefinitionId: ExerciseDefaultsMap
}

export function useMilestoneDetection({
  exercises,
  totalSets,
  prExerciseIds,
  exerciseDefaultsByDefinitionId,
}: UseMilestoneDetectionInput) {
  const [currentMilestone, setCurrentMilestone] = useState<MilestoneEvent | null>(null)
  const firedRef = useRef<Set<string>>(new Set())
  const prevSetsRef = useRef(0)
  const prevPrCountRef = useRef(0)
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showMilestone = useCallback((event: MilestoneEvent) => {
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    setCurrentMilestone(event)
    dismissTimeoutRef.current = setTimeout(() => {
      setCurrentMilestone(null)
      dismissTimeoutRef.current = null
    }, 2500)
  }, [])

  const dismissMilestone = useCallback(() => {
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    setCurrentMilestone(null)
    dismissTimeoutRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    // First set milestone
    if (totalSets >= 1 && prevSetsRef.current === 0 && !firedRef.current.has('first_set')) {
      firedRef.current.add('first_set')
      showMilestone({ type: 'first_set' })
      prevSetsRef.current = totalSets
      return
    }
    prevSetsRef.current = totalSets

    // PR milestone (check before halfway/final so it takes priority)
    if (prExerciseIds.size > prevPrCountRef.current) {
      prevPrCountRef.current = prExerciseIds.size
      const prExercise = exercises.find((ex) => prExerciseIds.has(ex.id))
      const exerciseName = prExercise?.exercise_definition?.name
      if (!firedRef.current.has(`pr_${exerciseName}`)) {
        firedRef.current.add(`pr_${exerciseName}`)
        showMilestone({ type: 'pr', exerciseName })
        return
      }
    }
    prevPrCountRef.current = prExerciseIds.size

    // Halfway milestone
    if (exercises.length >= 2 && !firedRef.current.has('halfway')) {
      let completedExercises = 0
      for (const ex of exercises) {
        const target = exerciseDefaultsByDefinitionId[ex.exercise_definition_id]?.defaultSets ?? 3
        if (ex.workout_sets.length >= target) completedExercises++
      }
      if (completedExercises >= Math.ceil(exercises.length / 2)) {
        firedRef.current.add('halfway')
        showMilestone({ type: 'halfway' })
        return
      }
    }

    // Final exercise milestone
    if (exercises.length >= 2 && !firedRef.current.has('final_exercise')) {
      const ordered = [...exercises].sort((a, b) => a.order_index - b.order_index)
      const lastExercise = ordered[ordered.length - 1]
      if (lastExercise && lastExercise.workout_sets.length === 1) {
        // Just got its first set
        const prevExercisesComplete = ordered.slice(0, -1).every((ex) => {
          const target = exerciseDefaultsByDefinitionId[ex.exercise_definition_id]?.defaultSets ?? 3
          return ex.workout_sets.length >= target
        })
        if (prevExercisesComplete) {
          firedRef.current.add('final_exercise')
          showMilestone({ type: 'final_exercise' })
          return
        }
      }
    }
  }, [exercises, totalSets, prExerciseIds, exerciseDefaultsByDefinitionId, showMilestone])

  return { currentMilestone, dismissMilestone }
}
