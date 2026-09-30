import fs from 'node:fs'
import path from 'node:path'

describe('today workout layout ordering', () => {
  const workoutScreenPath = path.join(__dirname, '..', 'app', '(app)', '(tabs)', 'workout.tsx')
  const source = fs.readFileSync(workoutScreenPath, 'utf8')

  it('renders week insights before primary action card', () => {
    const weekInsightsIndex = source.indexOf('<WeekInsightsCard')
    const noRoutinesSetupIndex = source.indexOf('<NoRoutinesSetupCard')
    const primaryActionIndex = source.indexOf('<PrimaryActionCard')

    expect(weekInsightsIndex).toBeGreaterThan(-1)
    expect(noRoutinesSetupIndex).toBeGreaterThan(-1)
    expect(primaryActionIndex).toBeGreaterThan(-1)
    expect(weekInsightsIndex).toBeLessThan(primaryActionIndex)
    expect(weekInsightsIndex).toBeLessThan(noRoutinesSetupIndex)
    expect(noRoutinesSetupIndex).toBeLessThan(primaryActionIndex)
  })
})
