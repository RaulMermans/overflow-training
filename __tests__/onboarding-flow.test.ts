import {
  canAdvanceOnboardingStep,
  canSkipOnboardingStep,
  FIRST_ROUTINE_STEP_INDEX,
  validateFirstRoutineDraft,
} from '../src/features/onboarding/flow'

describe('onboarding flow gating', () => {
  it('does not allow primary completion on first-routine step before saving', () => {
    expect(
      canAdvanceOnboardingStep({
        stepIndex: FIRST_ROUTINE_STEP_INDEX,
        hasIntention: true,
        hasWeeklyGoal: true,
        hasSavedFirstRoutine: false,
      }),
    ).toBe(false)
  })

  it('allows primary completion on first-routine step after save', () => {
    expect(
      canAdvanceOnboardingStep({
        stepIndex: FIRST_ROUTINE_STEP_INDEX,
        hasIntention: true,
        hasWeeklyGoal: true,
        hasSavedFirstRoutine: true,
      }),
    ).toBe(true)
  })

  it('keeps skip available on required first-routine step', () => {
    expect(canSkipOnboardingStep()).toBe(true)
  })
})

describe('first routine draft validation', () => {
  it('requires routine name', () => {
    expect(
      validateFirstRoutineDraft({
        name: '   ',
        exerciseCount: 2,
      }),
    ).toBe('onboarding.step3.validation.nameRequired')
  })

  it('requires at least one exercise', () => {
    expect(
      validateFirstRoutineDraft({
        name: 'Full Body',
        exerciseCount: 0,
      }),
    ).toBe('onboarding.step3.validation.exerciseRequired')
  })

  it('accepts valid draft', () => {
    expect(
      validateFirstRoutineDraft({
        name: 'Full Body',
        exerciseCount: 1,
      }),
    ).toBeNull()
  })
})
