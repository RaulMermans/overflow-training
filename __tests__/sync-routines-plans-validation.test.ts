/**
 * Tests for validatePlanDayPayload after the template_json removal.
 *
 * These tests guard against regressions from the plan_days dual-representation
 * fix (migration-018): `template_json` was removed from `PlanDayPayloadForValidation`
 * and the `invalid_plan_template_json` quarantine reason was deleted.
 */

import {
  validatePlanDayPayload,
  type PlanDayPayloadForValidation,
} from '../src/features/sync/routinesPlans/validation'

const VALID_UUID_1 = '550e8400-e29b-41d4-a716-446655440000'
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440001'
const VALID_UUID_3 = '550e8400-e29b-41d4-a716-446655440002'

function validPayload(
  overrides: Partial<PlanDayPayloadForValidation> = {},
): PlanDayPayloadForValidation {
  return {
    date: '2024-01-15',
    routineId: VALID_UUID_1,
    client_uuid: VALID_UUID_2,
    weekday: 1, // Monday
    routine_id: VALID_UUID_3,
    order: 0,
    updated_at: '2024-01-15T00:00:00.000Z',
    created_at: '2024-01-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('validatePlanDayPayload', () => {
  describe('template_json removal (migration-018 regression guard)', () => {
    it('accepts a fully valid payload — no template_json field required', () => {
      const payload = validPayload()
      // Confirm template_json is not in the interface
      expect('template_json' in payload).toBe(false)
      expect(validatePlanDayPayload(payload)).toBeNull()
    })

    it('never returns invalid_plan_template_json as a quarantine reason', () => {
      // The template_json validation block was deleted. A valid payload must
      // not trigger this (now-removed) quarantine reason under any circumstance.
      expect(validatePlanDayPayload(validPayload())?.reason).not.toBe('invalid_plan_template_json')
    })

    it('rejects routine_id = null with invalid_plan_remote_routine_id', () => {
      const result = validatePlanDayPayload(validPayload({ routine_id: null }))
      expect(result).not.toBeNull()
      expect(result?.reason).toBe('invalid_plan_remote_routine_id')
    })
  })

  describe('valid payloads', () => {
    it('returns null for a complete, valid payload', () => {
      expect(validatePlanDayPayload(validPayload())).toBeNull()
    })

    it('accepts weekday = 0 (Sunday)', () => {
      expect(validatePlanDayPayload(validPayload({ weekday: 0 }))).toBeNull()
    })

    it('accepts weekday = 6 (Saturday)', () => {
      expect(validatePlanDayPayload(validPayload({ weekday: 6 }))).toBeNull()
    })

    it('accepts order = 0', () => {
      expect(validatePlanDayPayload(validPayload({ order: 0 }))).toBeNull()
    })

    it('accepts large order values', () => {
      expect(validatePlanDayPayload(validPayload({ order: 99 }))).toBeNull()
    })
  })

  describe('quarantines invalid date', () => {
    it('quarantines empty date', () => {
      const result = validatePlanDayPayload(validPayload({ date: '' }))
      expect(result).not.toBeNull()
      expect(result?.entityType).toBe('plan_day')
      expect(result?.reason).toBe('invalid_plan_date')
    })

    it('quarantines non-ISO date', () => {
      const result = validatePlanDayPayload(validPayload({ date: '15/01/2024' }))
      expect(result?.reason).toBe('invalid_plan_date')
    })
  })

  describe('quarantines missing routineId', () => {
    it('quarantines empty routineId', () => {
      const result = validatePlanDayPayload(validPayload({ routineId: '' }))
      expect(result?.reason).toBe('missing_plan_routine_id')
    })
  })

  describe('quarantines invalid client_uuid', () => {
    it('quarantines empty client_uuid', () => {
      const result = validatePlanDayPayload(validPayload({ client_uuid: '' }))
      expect(result?.reason).toBe('invalid_plan_day_client_uuid')
    })

    it('quarantines non-UUID client_uuid', () => {
      const result = validatePlanDayPayload(validPayload({ client_uuid: 'not-a-uuid' }))
      expect(result?.reason).toBe('invalid_plan_day_client_uuid')
    })
  })

  describe('quarantines invalid weekday', () => {
    it('quarantines weekday = 7', () => {
      const result = validatePlanDayPayload(validPayload({ weekday: 7 }))
      expect(result?.reason).toBe('invalid_plan_weekday')
    })

    it('quarantines weekday = -1', () => {
      const result = validatePlanDayPayload(validPayload({ weekday: -1 }))
      expect(result?.reason).toBe('invalid_plan_weekday')
    })
  })

  describe('quarantines invalid order', () => {
    it('quarantines negative order', () => {
      const result = validatePlanDayPayload(validPayload({ order: -1 }))
      expect(result?.reason).toBe('invalid_plan_order')
    })

    it('quarantines fractional order', () => {
      const result = validatePlanDayPayload(validPayload({ order: 1.5 }))
      expect(result?.reason).toBe('invalid_plan_order')
    })
  })

  describe('quarantines invalid routine_id', () => {
    it('quarantines non-UUID routine_id when set', () => {
      const result = validatePlanDayPayload(validPayload({ routine_id: 'not-a-uuid' }))
      expect(result?.reason).toBe('invalid_plan_remote_routine_id')
    })

    it('rejects routine_id = null with invalid_plan_remote_routine_id', () => {
      const result = validatePlanDayPayload(validPayload({ routine_id: null }))
      expect(result).not.toBeNull()
      expect(result?.reason).toBe('invalid_plan_remote_routine_id')
    })
  })

  describe('quarantines invalid timestamps', () => {
    it('quarantines malformed updated_at', () => {
      const result = validatePlanDayPayload(validPayload({ updated_at: 'not-a-date' }))
      expect(result?.reason).toBe('invalid_plan_updated_at')
    })

    it('quarantines malformed created_at', () => {
      const result = validatePlanDayPayload(validPayload({ created_at: 'not-a-date' }))
      expect(result?.reason).toBe('invalid_plan_created_at')
    })
  })
})
