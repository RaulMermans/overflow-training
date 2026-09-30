import { motion } from '../src/theme/tokens'

describe('theme motion tokens', () => {
  it('contains microinteraction duration tokens in expected range', () => {
    expect(motion.duration.cardEnter).toBeGreaterThanOrEqual(150)
    expect(motion.duration.cardEnter).toBeLessThanOrEqual(250)
    expect(motion.duration.setPulse).toBeGreaterThanOrEqual(120)
    expect(motion.duration.prGlow).toBeGreaterThanOrEqual(150)
  })

  it('contains scale and opacity token groups', () => {
    expect(motion.scale.press).toBeLessThan(1)
    expect(motion.scale.pulseTo).toBeGreaterThan(1)
    expect(motion.opacity.glowFrom).toBe(0)
    expect(motion.opacity.glowTo).toBeGreaterThan(motion.opacity.glowFrom)
  })
})
