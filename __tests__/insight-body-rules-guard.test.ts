import { BODY_RULES } from '../src/features/analytics/insights/insightRules'

describe('BODY_RULES deferred guard', () => {
  it('remains empty until check-in analytics hook is wired', () => {
    // Guard: BODY_RULES must stay empty until the check-in data layer
    // and analytics hooks are fully implemented. If this test fails,
    // ensure BD-01/BD-02 rules have complete data sources and UI wiring
    // before shipping — partial activation will show broken insights.
    expect(BODY_RULES).toHaveLength(0)
  })
})
