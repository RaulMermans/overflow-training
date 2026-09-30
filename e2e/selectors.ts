/**
 * Centralized E2E testIDs for Maestro and other E2E tooling.
 * Maps to accessibilityIdentifier on iOS.
 */
export const SELECTORS = {
  // Auth
  login: {
    emailInput: 'login:emailInput',
    passwordInput: 'login:passwordInput',
    submitButton: 'login:submitButton',
  },
  signup: {
    displayNameInput: 'signup:displayNameInput',
    emailInput: 'signup:emailInput',
    passwordInput: 'signup:passwordInput',
    confirmPasswordInput: 'signup:confirmPasswordInput',
    submitButton: 'signup:submitButton',
  },
  // Routines
  routines: {
    newRoutineButton: 'routines:newRoutineButton',
    emptyCreateRoutine: 'routines:emptyCreateRoutine',
    routineRow: (id: string) => `routines:routineRow:${id}`,
    startRoutineButton: (id: string) => `routines:startRoutineButton:${id}`,
  },
  routineNew: {
    nameInput: 'routineNew:nameInput',
    saveButton: 'routineNew:saveButton',
  },
  exerciseSearch: {
    exerciseRow: 'exerciseSearch:exerciseRow',
  },
  // Calendar
  calendar: {
    monthPrev: 'calendar:monthPrev',
    monthNext: 'calendar:monthNext',
    monthLabel: 'calendar:monthLabel',
    daySheet: 'calendar:daySheet',
    routinePicker: 'calendar:routinePicker',
    dayCell: 'calendar:dayCell',
    day: (dateKey: string) => `calendar:day:${dateKey}`,
    routineRow: (routineId: string) => `calendar:routineRow:${routineId}`,
    routineRowAny: 'calendar:routineRow',
    clearPlanButton: 'calendar:clearPlanButton',
    startWorkoutButton: 'calendar:startWorkoutButton',
    addPlanButton: 'calendar:addPlanButton',
  },
  // Workout tab
  workout: {
    primaryActionCard: 'workout:primaryActionCard',
    startScheduledButton: 'workout:startScheduledButton',
    resumeButton: 'workout:resumeButton',
  },
  // Workout session
  workoutSession: {
    root: 'workoutSession:root',
    finishButton: 'workoutSession:finishButton',
    finishSubmitButton: 'workoutSession:finishSubmitButton',
    addSetButton: 'workoutSession:addSetButton',
  },
  // Sync
  syncPill: {
    chip: 'syncPill:chip',
  },
  // Profile
  profile: {
    signOutButton: 'profile:signOutButton',
    workoutsCount: 'profile:workoutsCount',
  },
} as const
