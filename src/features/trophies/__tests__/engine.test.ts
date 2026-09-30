import { evaluateTrophies } from '../engine'
import { TROPHY_CATALOG } from '../catalog'
import type { TrophyState } from '../storage'
import { DEFAULT_TROPHY_STATE } from '../storage'

function freshState(): TrophyState {
  return {
    ...DEFAULT_TROPHY_STATE,
    unlocked: {},
    counters: {
      totalWorkouts: 0,
      activeDaysTotal: 0,
      recentActiveDays: [],
      currentStreak: 0,
      longestStreak: 0,
      totalPRs: 0,
      totalRoutinesCreated: 0,
      totalFavoritesAdded: 0,
      totalVolumeKg: 0,
    },
  }
}

const DAY1 = '2026-01-01T10:00:00.000Z'
const DAY2 = '2026-01-02T10:00:00.000Z'
const DAY3 = '2026-01-03T10:00:00.000Z'
const DAY4 = '2026-01-04T10:00:00.000Z'

describe('trophy engine', () => {
  describe('WORKOUT_COMPLETED', () => {
    it('unlocks first_workout on first event', () => {
      const state = freshState()
      const { newlyUnlocked, updatedState } = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      })

      expect(newlyUnlocked).toContain('first_workout')
      expect(updatedState.unlocked['first_workout']).toBeDefined()
      expect(updatedState.counters.totalWorkouts).toBe(1)
    })

    it('unlocks workouts_3 after three completions', () => {
      let state = freshState()

      for (let i = 0; i < 2; i++) {
        const day = `2026-01-0${i + 1}T10:00:00.000Z`
        const result = evaluateTrophies({
          event: { type: 'WORKOUT_COMPLETED', at: day },
          state,
          catalog: TROPHY_CATALOG,
          now: day,
        })
        state = result.updatedState
        expect(result.newlyUnlocked).not.toContain('workouts_3')
      }

      const result3 = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY3 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY3,
      })
      expect(result3.newlyUnlocked).toContain('workouts_3')
      expect(result3.updatedState.counters.totalWorkouts).toBe(3)
    })

    it('counts active days correctly when two workouts occur on the same day', () => {
      let state = freshState()

      const result1 = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      })
      state = result1.updatedState

      // Second workout same day
      const result2 = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      })
      state = result2.updatedState

      expect(state.counters.activeDaysTotal).toBe(1)
      expect(state.counters.totalWorkouts).toBe(2)
      expect(state.counters.recentActiveDays).toHaveLength(1)
    })

    it('does not unlock first_workout twice', () => {
      let state = freshState()

      const result1 = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      })
      state = result1.updatedState
      expect(result1.newlyUnlocked).toContain('first_workout')

      const result2 = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY2 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY2,
      })
      expect(result2.newlyUnlocked).not.toContain('first_workout')
    })

    it('tracks streak across consecutive days', () => {
      let state = freshState()

      const result1 = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      })
      state = result1.updatedState

      const result2 = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY2 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY2,
      })
      state = result2.updatedState

      const result3 = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY3 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY3,
      })
      state = result3.updatedState

      expect(state.counters.currentStreak).toBe(3)
      expect(result3.newlyUnlocked).toContain('streak_3')
    })

    it('resets streak when a day is skipped', () => {
      let state = freshState()

      const result1 = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      })
      state = result1.updatedState

      // Skip DAY2 — workout on DAY3 breaks the streak
      const result3 = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY3 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY3,
      })
      state = result3.updatedState

      expect(state.counters.currentStreak).toBe(1)
      expect(result3.newlyUnlocked).not.toContain('streak_3')
    })

    it('sets firstWorkoutAt on the first completion', () => {
      const state = freshState()
      const { updatedState } = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      })
      expect(updatedState.firstWorkoutAt).toBe(DAY1)
    })
  })

  describe('CHECKIN_SAVED', () => {
    it('unlocks checkin_day1 on day1 period', () => {
      const state = freshState()
      const { newlyUnlocked } = evaluateTrophies({
        event: { type: 'CHECKIN_SAVED', period: 'day1', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      })
      expect(newlyUnlocked).toContain('checkin_day1')
      expect(newlyUnlocked).not.toContain('checkin_month1')
      expect(newlyUnlocked).not.toContain('checkin_month3')
    })

    it('unlocks checkin_month1 on month1 period', () => {
      const state = freshState()
      const { newlyUnlocked } = evaluateTrophies({
        event: { type: 'CHECKIN_SAVED', period: 'month1', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      })
      expect(newlyUnlocked).toContain('checkin_month1')
      expect(newlyUnlocked).not.toContain('checkin_day1')
    })
  })

  describe('prerequisite trophies', () => {
    it('unlocks time_capsule when both checkin_day1 and checkin_month12 are unlocked', () => {
      const state: TrophyState = {
        ...freshState(),
        unlocked: {
          checkin_day1: { unlockedAt: DAY1 },
          checkin_month12: { unlockedAt: DAY2 },
        },
      }

      // Trigger any event to re-evaluate prerequisites
      const { newlyUnlocked } = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY3 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY3,
      })

      expect(newlyUnlocked).toContain('time_capsule')
    })

    it('does not unlock time_capsule with only checkin_day1', () => {
      const state: TrophyState = {
        ...freshState(),
        unlocked: {
          checkin_day1: { unlockedAt: DAY1 },
        },
      }

      const { newlyUnlocked } = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY2 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY2,
      })

      expect(newlyUnlocked).not.toContain('time_capsule')
    })

    it('unlocks time_capsule in the same pass when both checkin prerequisites fire', () => {
      // Simulate: checkin_day1 and checkin_month12 both get unlocked before time_capsule is checked
      const state = freshState()

      // Unlock checkin_day1
      const r1 = evaluateTrophies({
        event: { type: 'CHECKIN_SAVED', period: 'day1', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      })

      // Unlock checkin_month12 (should also unlock time_capsule in same call)
      const r2 = evaluateTrophies({
        event: { type: 'CHECKIN_SAVED', period: 'month12', at: DAY2 },
        state: r1.updatedState,
        catalog: TROPHY_CATALOG,
        now: DAY2,
      })

      expect(r2.newlyUnlocked).toContain('checkin_month12')
      expect(r2.newlyUnlocked).toContain('time_capsule')
    })
  })

  describe('PR_ACHIEVED', () => {
    it('unlocks first_pr on first PR_ACHIEVED', () => {
      const state = freshState()
      const { newlyUnlocked } = evaluateTrophies({
        event: { type: 'PR_ACHIEVED', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      })
      expect(newlyUnlocked).toContain('first_pr')
      expect(newlyUnlocked).not.toContain('prs_5')
    })

    it('unlocks prs_5 after 5 PR_ACHIEVED events', () => {
      let state = freshState()

      for (let i = 0; i < 4; i++) {
        const r = evaluateTrophies({
          event: { type: 'PR_ACHIEVED', at: DAY1 },
          state,
          catalog: TROPHY_CATALOG,
          now: DAY1,
        })
        state = r.updatedState
        expect(r.newlyUnlocked).not.toContain('prs_5')
      }

      const r5 = evaluateTrophies({
        event: { type: 'PR_ACHIEVED', at: DAY2 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY2,
      })
      expect(r5.newlyUnlocked).toContain('prs_5')
      expect(r5.updatedState.counters.totalPRs).toBe(5)
    })
  })

  describe('first_year', () => {
    it('unlocks first_year when firstWorkoutAt is 365 days ago', () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 365)
      const oldISO = oldDate.toISOString()

      const state: TrophyState = {
        ...freshState(),
        firstWorkoutAt: oldISO,
        counters: {
          ...freshState().counters,
          totalWorkouts: 1,
        },
      }

      const { newlyUnlocked } = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: new Date().toISOString() },
        state,
        catalog: TROPHY_CATALOG,
        now: new Date().toISOString(),
      })

      expect(newlyUnlocked).toContain('first_year')
    })

    it('does not unlock first_year when firstWorkoutAt is 364 days ago', () => {
      const recentDate = new Date()
      recentDate.setDate(recentDate.getDate() - 364)

      const state: TrophyState = {
        ...freshState(),
        firstWorkoutAt: recentDate.toISOString(),
        counters: {
          ...freshState().counters,
          totalWorkouts: 1,
        },
      }

      const { newlyUnlocked } = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: new Date().toISOString() },
        state,
        catalog: TROPHY_CATALOG,
        now: new Date().toISOString(),
      })

      expect(newlyUnlocked).not.toContain('first_year')
    })
  })

  describe('streak computation', () => {
    it('tracks three consecutive days and unlocks streak_3', () => {
      let state = freshState()

      // Day 1
      state = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      }).updatedState

      // Day 2
      state = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY2 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY2,
      }).updatedState

      // Day 3
      const result = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY3 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY3,
      })

      expect(result.updatedState.counters.currentStreak).toBe(3)
      expect(result.newlyUnlocked).toContain('streak_3')
    })

    it('breaks streak after a day gap and does not unlock streak_3', () => {
      let state = freshState()

      // Day 1
      state = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY1 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY1,
      }).updatedState

      // Day 2
      state = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY2 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY2,
      }).updatedState

      // DAY3 skipped — workout on DAY4 breaks the streak
      const result = evaluateTrophies({
        event: { type: 'WORKOUT_COMPLETED', at: DAY4 },
        state,
        catalog: TROPHY_CATALOG,
        now: DAY4,
      })

      expect(result.updatedState.counters.currentStreak).toBe(1)
      expect(result.newlyUnlocked).not.toContain('streak_3')
    })
  })
})
