import { useCallback, useRef, useState } from 'react'
import type Svg from 'react-native-svg'
import { fetchProgressWorkouts, type ProgressWorkout } from '../../db/progress'
import { loadProfilePreferences, type UnitsPreference } from '../../lib/profilePreferences'
import { fromWeightKg } from '../../lib/units'
import type { WeekRhythmDay } from '../today/compute'
import { buildWeeklyShareData, type WeeklyShareData } from './buildWeeklyShareData'
import { captureSvgToPngBase64, shareWorkoutCard } from './shareWorkoutCard'

interface UseWeeklyShareInput {
  userId: string | null
  sessionsThisWeek: number
  weeklyGoal: number
  currentStreak: number
  weekRhythm: WeekRhythmDay[]
  language: 'en' | 'es'
}

function getWeekBounds(now: Date): { fromISO: string; toISO: string } {
  const weekStart = new Date(now)
  const day = weekStart.getDay()
  const diffToMonday = (day + 6) % 7
  weekStart.setDate(weekStart.getDate() - diffToMonday)
  weekStart.setHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  return {
    fromISO: weekStart.toISOString(),
    toISO: weekEnd.toISOString(),
  }
}

function computeWeeklyVolumeKg(workouts: ProgressWorkout[]): number {
  return workouts.reduce((total, workout) => {
    const exerciseVolume = workout.workout_exercises.reduce((exTotal, exercise) => {
      const setVolume = exercise.workout_sets.reduce((setTotal, set) => {
        const reps = Number(set.reps) || 0
        const weightKg = Number(set.weight_kg) ?? Number(set.weight) ?? 0
        if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return setTotal
        return setTotal + reps * weightKg
      }, 0)
      return exTotal + setVolume
    }, 0)
    return total + exerciseVolume
  }, 0)
}

export function useWeeklyShare(input: UseWeeklyShareInput) {
  const svgRef = useRef<Svg | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [shareData, setShareData] = useState<WeeklyShareData | null>(null)

  const buildData = useCallback(async (): Promise<{
    data: WeeklyShareData
    units: UnitsPreference
  }> => {
    const now = new Date()
    const { fromISO, toISO } = getWeekBounds(now)

    let volumeKg = 0
    let units: UnitsPreference = 'kg'

    if (input.userId) {
      const [prefs, progressResult] = await Promise.all([
        loadProfilePreferences(input.userId),
        fetchProgressWorkouts(fromISO, toISO, input.userId),
      ])
      units = prefs.units
      if (progressResult.data) {
        volumeKg = computeWeeklyVolumeKg(progressResult.data)
      }
    }

    const totalVolumeDisplay = Math.round(fromWeightKg(volumeKg, units))

    const data = buildWeeklyShareData({
      workouts: [],
      weeklyGoal: input.weeklyGoal,
      currentStreak: input.currentStreak,
      totalVolumeDisplay,
      units,
      language: input.language,
      now,
    })

    // Override sessionsCompleted from the already-computed value
    // (buildWeeklyShareData computes from workouts, but we already have the count)
    const corrected: WeeklyShareData = {
      ...data,
      sessionsCompleted: input.sessionsThisWeek,
      weekRhythm: input.weekRhythm.map((day) => ({
        label: day.label,
        completed: day.completed,
      })),
    }

    return { data: corrected, units }
  }, [
    input.currentStreak,
    input.language,
    input.sessionsThisWeek,
    input.userId,
    input.weekRhythm,
    input.weeklyGoal,
  ])

  const handleShareWeek = useCallback(async () => {
    if (isSharing) return
    setIsSharing(true)

    try {
      const { data, units } = await buildData()
      setShareData(data)

      // Allow one frame for SVG to render with new data
      await new Promise((resolve) => requestAnimationFrame(resolve))

      const cacheKey = `weekly-${data.weekLabel}-${data.sessionsCompleted}`
      const fallbackText = [
        data.weekLabel,
        `${data.sessionsCompleted}/${data.weeklyGoal} sessions`,
        `${data.totalVolume.toLocaleString()} ${units}`,
        `${data.currentStreak}d streak`,
      ].join('\n')

      await shareWorkoutCard({
        cacheKey,
        fallbackText,
        renderImageBase64: () => captureSvgToPngBase64(svgRef.current),
      })
    } catch {
      // Swallow — shareWorkoutCard already falls back to text
    } finally {
      setIsSharing(false)
    }
  }, [buildData, isSharing])

  return {
    weeklyShareSvgRef: svgRef,
    weeklyShareData: shareData,
    isWeeklySharing: isSharing,
    handleShareWeek,
  }
}
