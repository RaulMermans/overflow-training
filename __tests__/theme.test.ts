// Theme tokens smoke test - validates test runner and design tokens exist
import { colors } from '../src/theme/tokens'

describe('theme/tokens', () => {
  it('exports colors.bg.primary', () => {
    expect(colors.bg).toBeDefined()
    expect(colors.bg.primary).toBeDefined()
    expect(typeof colors.bg.primary).toBe('string')
  })

  it('exports colors.accent.primary', () => {
    expect(colors.accent).toBeDefined()
    expect(colors.accent.primary).toBeDefined()
    expect(typeof colors.accent.primary).toBe('string')
  })
})
