import {
  addRestTimerSeconds,
  formatRestCountdown,
  pauseRestTimer,
  resumeRestTimer,
  shouldStartRestTimer,
  skipRestTimer,
  startRestTimer,
  subtractRestTimerSeconds,
  tickRestTimer,
} from '../src/features/workoutSession/restTimer'

describe('workoutSession/restTimer', () => {
  it('formats countdown as mm:ss', () => {
    expect(formatRestCountdown(0)).toBe('00:00')
    expect(formatRestCountdown(9)).toBe('00:09')
    expect(formatRestCountdown(75)).toBe('01:15')
  })

  it('starts only when rest timer preference is at least 15 seconds', () => {
    expect(shouldStartRestTimer(14)).toBe(false)
    expect(shouldStartRestTimer(15)).toBe(true)
  })

  it('supports pause and resume transitions', () => {
    const running = startRestTimer(90)
    const paused = pauseRestTimer(running)
    const resumed = resumeRestTimer(paused)

    expect(paused.isRunning).toBe(false)
    expect(resumed.isRunning).toBe(true)
    expect(resumed.remainingSeconds).toBe(90)
  })

  it('ticks down to zero and stops running', () => {
    const started = startRestTimer(1)
    const finished = tickRestTimer(started)

    expect(finished.remainingSeconds).toBe(0)
    expect(finished.isRunning).toBe(false)
  })

  it('adds time and supports skipping', () => {
    const started = startRestTimer(30)
    const extended = addRestTimerSeconds(started, 15)
    const skipped = skipRestTimer(extended)

    expect(extended.remainingSeconds).toBe(45)
    expect(skipped.remainingSeconds).toBe(0)
    expect(skipped.isRunning).toBe(false)
  })

  it('subtracts time and clamps to zero', () => {
    const started = startRestTimer(30)
    const reduced = subtractRestTimerSeconds(started, 15)
    const clamped = subtractRestTimerSeconds(reduced, 30)

    expect(reduced.remainingSeconds).toBe(15)
    expect(reduced.isRunning).toBe(true)
    expect(clamped.remainingSeconds).toBe(0)
    expect(clamped.isRunning).toBe(false)
  })
})
