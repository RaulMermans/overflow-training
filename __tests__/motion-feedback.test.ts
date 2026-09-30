import { triggerGentleHaptic } from '../src/lib/feedback'
import { shouldAnimate } from '../src/lib/motion'

describe('motion and feedback helpers', () => {
  const vibrate = jest.fn()

  beforeEach(() => {
    vibrate.mockClear()
  })

  it('returns motion gate based on reduced motion preference', () => {
    expect(shouldAnimate(false)).toBe(true)
    expect(shouldAnimate(true)).toBe(false)
  })

  it('does not vibrate when reduced motion is enabled', () => {
    triggerGentleHaptic({ reducedMotion: true, platformOS: 'ios', vibrate })
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('does not vibrate on non-ios platforms', () => {
    triggerGentleHaptic({ reducedMotion: false, platformOS: 'android', vibrate })
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('triggers a short vibration on ios when motion is allowed', () => {
    triggerGentleHaptic({ reducedMotion: false, platformOS: 'ios', vibrate })
    expect(vibrate).toHaveBeenCalledWith(8)
  })
})
