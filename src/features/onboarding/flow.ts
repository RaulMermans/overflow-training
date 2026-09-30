export const ONBOARDING_STEP_COUNT = 6
export const IDENTITY_STEP_INDEX = 1
export const EQUIPMENT_STEP_INDEX = 4
export const FIRST_ROUTINE_STEP_INDEX = 5

export type FirstRoutineValidationErrorKey =
  | 'onboarding.step3.validation.nameRequired'
  | 'onboarding.step3.validation.exerciseRequired'

interface FirstRoutineDraft {
  name: string
  exerciseCount: number
}

interface OnboardingProgressState {
  stepIndex: number
  hasIntention: boolean
  hasWeeklyGoal: boolean
  hasSavedFirstRoutine: boolean
}

export function validateFirstRoutineDraft(
  draft: FirstRoutineDraft,
): FirstRoutineValidationErrorKey | null {
  if (!draft.name.trim()) return 'onboarding.step3.validation.nameRequired'
  if (draft.exerciseCount < 1) return 'onboarding.step3.validation.exerciseRequired'
  return null
}

export function canAdvanceOnboardingStep(state: OnboardingProgressState): boolean {
  if (state.stepIndex === IDENTITY_STEP_INDEX) return true // identity is optional
  if (state.stepIndex === 2) return state.hasIntention
  if (state.stepIndex === 3) return state.hasWeeklyGoal
  if (state.stepIndex === EQUIPMENT_STEP_INDEX) return true // equipment is optional
  if (state.stepIndex === FIRST_ROUTINE_STEP_INDEX) return state.hasSavedFirstRoutine
  return true
}

export function getNextOnboardingStep(currentStepIndex: number): number {
  return Math.min(ONBOARDING_STEP_COUNT - 1, currentStepIndex + 1)
}

export function canSkipOnboardingStep(): boolean {
  return true
}
