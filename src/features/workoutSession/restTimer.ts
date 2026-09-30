export const MIN_REST_TIMER_SECONDS = 15

export interface RestTimerState {
  remainingSeconds: number
  isRunning: boolean
}

function normalizeSeconds(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

export function shouldStartRestTimer(seconds: number): boolean {
  return normalizeSeconds(seconds) >= MIN_REST_TIMER_SECONDS
}

export function formatRestCountdown(seconds: number): string {
  const safeSeconds = normalizeSeconds(seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const remaining = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

export function startRestTimer(seconds: number): RestTimerState {
  return {
    remainingSeconds: normalizeSeconds(seconds),
    isRunning: true,
  }
}

export function tickRestTimer(state: RestTimerState): RestTimerState {
  if (!state.isRunning) return state
  if (state.remainingSeconds <= 0) {
    return { remainingSeconds: 0, isRunning: false }
  }

  const remainingSeconds = state.remainingSeconds - 1
  return {
    remainingSeconds,
    isRunning: remainingSeconds > 0,
  }
}

export function pauseRestTimer(state: RestTimerState): RestTimerState {
  return {
    ...state,
    isRunning: false,
  }
}

export function resumeRestTimer(state: RestTimerState): RestTimerState {
  if (state.remainingSeconds <= 0) return state
  return {
    ...state,
    isRunning: true,
  }
}

export function addRestTimerSeconds(
  state: RestTimerState,
  additionalSeconds: number,
): RestTimerState {
  const extra = normalizeSeconds(additionalSeconds)
  if (extra === 0) return state

  return {
    ...state,
    remainingSeconds: state.remainingSeconds + extra,
  }
}

export function subtractRestTimerSeconds(
  state: RestTimerState,
  subtractSeconds: number,
): RestTimerState {
  const delta = normalizeSeconds(subtractSeconds)
  if (delta === 0) return state

  const remainingSeconds = Math.max(0, state.remainingSeconds - delta)
  return {
    ...state,
    remainingSeconds,
    isRunning: remainingSeconds > 0 && state.isRunning,
  }
}

export function skipRestTimer(state: RestTimerState): RestTimerState {
  return {
    ...state,
    remainingSeconds: 0,
    isRunning: false,
  }
}
