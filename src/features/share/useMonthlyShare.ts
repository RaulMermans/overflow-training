import { useCallback, useRef, useState } from 'react'
import type Svg from 'react-native-svg'
import { fetchProgressWorkouts, type ProgressWorkout } from '../../db/progress'
import { loadProfilePreferences, type UnitsPreference } from '../../lib/profilePreferences'
import { fromWeightKg } from '../../lib/units'
import { buildMonthlyShareData, type MonthlyShareData } from './buildMonthlyShareData'
import { captureSvgToPngBase64, shareWorkoutCard } from './shareWorkoutCard'

interface UseMonthlyShareInput {
  userId: string | null
  completedDateKeys: string[]
  month: number // 0-indexed
  year: number
  locale?: string
}

function computeMonthlyVolumeKg(workouts: ProgressWorkout[]): number {
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

function computeLongestStreak(completedDayNumbers: number[], daysInMonth: number): number {
  const completedSet = new Set(completedDayNumbers)
  let longest = 0
  let current = 0

  for (let day = 1; day <= daysInMonth; day++) {
    if (completedSet.has(day)) {
      current++
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
  }

  return longest
}

export function useMonthlyShare(input: UseMonthlyShareInput) {
  const svgRef = useRef<Svg | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [shareData, setShareData] = useState<MonthlyShareData | null>(null)

  const buildData = useCallback(async (): Promise<{
    data: MonthlyShareData
    units: UnitsPreference
  }> => {
    const { month, year } = input

    let volumeKg = 0
    let units: UnitsPreference = 'kg'

    if (input.userId) {
      const fromISO = new Date(year, month, 1).toISOString()
      const toISO = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString()

      const [prefs, progressResult] = await Promise.all([
        loadProfilePreferences(input.userId),
        fetchProgressWorkouts(fromISO, toISO, input.userId),
      ])
      units = prefs.units
      if (progressResult.data) {
        volumeKg = computeMonthlyVolumeKg(progressResult.data)
      }
    }

    const totalVolumeDisplay = Math.round(fromWeightKg(volumeKg, units))

    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    const completedDayNumbers = input.completedDateKeys
      .filter((key) => key.startsWith(monthPrefix))
      .map((key) => parseInt(key.slice(-2), 10))
      .filter((day) => Number.isFinite(day) && day > 0 && day <= daysInMonth)

    const longestStreak = computeLongestStreak(completedDayNumbers, daysInMonth)

    const data = buildMonthlyShareData({
      completedDateKeys: input.completedDateKeys,
      totalVolumeDisplay,
      units,
      longestStreak,
      month,
      year,
      locale: input.locale,
    })

    return { data, units }
  }, [input.completedDateKeys, input.locale, input.month, input.userId, input.year])

  const handleShareMonth = useCallback(async () => {
    if (isSharing) return
    setIsSharing(true)

    try {
      const { data, units } = await buildData()
      setShareData(data)

      // Allow one frame for SVG to render with new data
      await new Promise((resolve) => requestAnimationFrame(resolve))

      const cacheKey = `monthly-${data.monthLabel}-${data.yearLabel}-${data.totalSessions}`
      const fallbackText = [
        `${data.monthLabel} ${data.yearLabel}`,
        `${data.totalSessions} sessions`,
        `${data.totalVolume.toLocaleString()} ${units}`,
        `${data.longestStreak}d best streak`,
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
    monthlyShareSvgRef: svgRef,
    monthlyShareData: shareData,
    isMonthlySharing: isSharing,
    handleShareMonth,
  }
}
