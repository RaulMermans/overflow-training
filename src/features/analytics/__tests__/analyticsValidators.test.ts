// ============================================================
// Contract tests for analytics DTO validators (WS 5.5)
// ============================================================
//
// These tests act as a living contract between the analytics DB
// schema (migration-027) and the client data layer.
//
// If the backend renames or removes a column, the client's
// Number(row.field) coercion produces NaN, and these tests
// ensure that the validator catches it with an actionable message.
//
// Coverage areas:
//   1. Happy path — valid DTOs pass without violations
//   2. NaN detection — Number(undefined) produces NaN
//   3. Negative values — DB-side bug (volume, count, e1RM)
//   4. Invalid ISO dates — timezone / date pipeline regressions
//   5. Empty required strings — user_id, muscle_key, exercise_id
//   6. avg_effort out of [0,10]
//   7. warnIfInvalid helper — logs when invalid, silent when valid
// ============================================================

import {
  validateExerciseE1RMWeeklyRows,
  validateProgressOverviewDTO,
  validateWeeklyMuscleBalanceRows,
  validateWeeklyStrengthVolumeRows,
  validateWeeklyWorkoutsRows,
  warnIfInvalid,
  type ValidationResult,
} from '../analyticsValidators'
import type {
  ExerciseE1RMWeeklyRowDTO,
  ProgressOverviewDTO,
  WeeklyMuscleBalanceRowDTO,
  WeeklyStrengthVolumeRowDTO,
  WeeklyWorkoutsRowDTO,
} from '../analyticsTypes'

// ──────────────────────────────────────────────────────────────
// Fixtures — valid baseline objects
// ──────────────────────────────────────────────────────────────

const VALID_OVERVIEW: ProgressOverviewDTO = {
  range_days: 28,
  workouts: 8,
  workouts_per_week: 2,
  minutes_trained: 320,
  strength_volume_kg: 12000,
  avg_effort: 7.5,
  prs_count: 3,
}

const VALID_WORKOUTS_ROW: WeeklyWorkoutsRowDTO = {
  user_id: 'aaaa-bbbb-cccc-dddd',
  week_start: '2026-01-27',
  workouts_completed: 3,
}

const VALID_STRENGTH_ROW: WeeklyStrengthVolumeRowDTO = {
  user_id: 'aaaa-bbbb-cccc-dddd',
  week_start: '2026-01-27',
  volume_kg: 1500,
  sets_count: 30,
  reps_count: 240,
}

const VALID_MUSCLE_ROW: WeeklyMuscleBalanceRowDTO = {
  user_id: 'aaaa-bbbb-cccc-dddd',
  week_start: '2026-01-27',
  muscle_key: 'chest',
  volume_kg: 600,
  sets_count: 12,
}

const VALID_E1RM_ROW: ExerciseE1RMWeeklyRowDTO = {
  user_id: 'aaaa-bbbb-cccc-dddd',
  exercise_definition_id: 'ex-uuid-1234',
  week_start: '2026-01-27',
  best_e1rm: 120.5,
}

// ──────────────────────────────────────────────────────────────
// Helper: assert a result is valid
// ──────────────────────────────────────────────────────────────

function expectValid(result: ValidationResult) {
  expect(result.valid).toBe(true)
  expect(result.violations).toHaveLength(0)
}

function expectInvalid(result: ValidationResult, minViolations = 1) {
  expect(result.valid).toBe(false)
  expect(result.violations.length).toBeGreaterThanOrEqual(minViolations)
}

// ──────────────────────────────────────────────────────────────
// 1. validateProgressOverviewDTO
// ──────────────────────────────────────────────────────────────

describe('validateProgressOverviewDTO — happy path', () => {
  it('accepts a fully-populated valid DTO', () => {
    expectValid(validateProgressOverviewDTO(VALID_OVERVIEW))
  })

  it('accepts null nullable fields', () => {
    const dto: ProgressOverviewDTO = {
      ...VALID_OVERVIEW,
      workouts_per_week: null,
      minutes_trained: null,
      strength_volume_kg: null,
      avg_effort: null,
    }
    expectValid(validateProgressOverviewDTO(dto))
  })

  it('accepts zero workouts (new user)', () => {
    expectValid(validateProgressOverviewDTO({ ...VALID_OVERVIEW, workouts: 0, prs_count: 0 }))
  })
})

describe('validateProgressOverviewDTO — NaN detection', () => {
  it('detects NaN range_days (e.g. Number(undefined))', () => {
    const dto = { ...VALID_OVERVIEW, range_days: NaN }
    const result = validateProgressOverviewDTO(dto)
    expectInvalid(result)
    expect(result.violations[0]).toContain('range_days')
  })

  it('detects NaN workouts', () => {
    const dto = { ...VALID_OVERVIEW, workouts: NaN }
    expectInvalid(validateProgressOverviewDTO(dto))
  })

  it('detects NaN prs_count', () => {
    const dto = { ...VALID_OVERVIEW, prs_count: NaN }
    const result = validateProgressOverviewDTO(dto)
    expectInvalid(result)
    expect(result.violations[0]).toContain('prs_count')
  })
})

describe('validateProgressOverviewDTO — negative values', () => {
  it('rejects negative workouts', () => {
    expectInvalid(validateProgressOverviewDTO({ ...VALID_OVERVIEW, workouts: -1 }))
  })

  it('rejects negative strength_volume_kg', () => {
    expectInvalid(validateProgressOverviewDTO({ ...VALID_OVERVIEW, strength_volume_kg: -500 }))
  })

  it('rejects negative minutes_trained', () => {
    expectInvalid(validateProgressOverviewDTO({ ...VALID_OVERVIEW, minutes_trained: -10 }))
  })

  it('rejects negative prs_count', () => {
    expectInvalid(validateProgressOverviewDTO({ ...VALID_OVERVIEW, prs_count: -1 }))
  })
})

describe('validateProgressOverviewDTO — avg_effort out of bounds', () => {
  it('rejects avg_effort > 10', () => {
    const result = validateProgressOverviewDTO({ ...VALID_OVERVIEW, avg_effort: 11 })
    expectInvalid(result)
    expect(result.violations[0]).toContain('avg_effort')
  })

  it('rejects avg_effort < 0', () => {
    expectInvalid(validateProgressOverviewDTO({ ...VALID_OVERVIEW, avg_effort: -1 }))
  })

  it('rejects NaN avg_effort', () => {
    expectInvalid(validateProgressOverviewDTO({ ...VALID_OVERVIEW, avg_effort: NaN }))
  })

  it('accepts avg_effort at boundary values 0 and 10', () => {
    expectValid(validateProgressOverviewDTO({ ...VALID_OVERVIEW, avg_effort: 0 }))
    expectValid(validateProgressOverviewDTO({ ...VALID_OVERVIEW, avg_effort: 10 }))
  })
})

// ──────────────────────────────────────────────────────────────
// 2. validateWeeklyWorkoutsRows
// ──────────────────────────────────────────────────────────────

describe('validateWeeklyWorkoutsRows — happy path', () => {
  it('accepts empty array', () => {
    expectValid(validateWeeklyWorkoutsRows([]))
  })

  it('accepts valid rows', () => {
    expectValid(validateWeeklyWorkoutsRows([VALID_WORKOUTS_ROW]))
  })

  it('accepts multiple contiguous week rows', () => {
    const rows: WeeklyWorkoutsRowDTO[] = [
      { ...VALID_WORKOUTS_ROW, week_start: '2026-01-19' },
      { ...VALID_WORKOUTS_ROW, week_start: '2026-01-26' },
    ]
    expectValid(validateWeeklyWorkoutsRows(rows))
  })
})

describe('validateWeeklyWorkoutsRows — contract violations', () => {
  it('detects NaN workouts_completed (missing column rename)', () => {
    const row = { ...VALID_WORKOUTS_ROW, workouts_completed: NaN }
    const result = validateWeeklyWorkoutsRows([row])
    expectInvalid(result)
    expect(result.violations[0]).toContain('workouts_completed')
  })

  it('detects negative workouts_completed', () => {
    expectInvalid(validateWeeklyWorkoutsRows([{ ...VALID_WORKOUTS_ROW, workouts_completed: -1 }]))
  })

  it('detects empty user_id', () => {
    const result = validateWeeklyWorkoutsRows([{ ...VALID_WORKOUTS_ROW, user_id: '' }])
    expectInvalid(result)
    expect(result.violations[0]).toContain('user_id')
  })

  it('detects invalid week_start (not ISO date)', () => {
    const result = validateWeeklyWorkoutsRows([{ ...VALID_WORKOUTS_ROW, week_start: 'not-a-date' }])
    expectInvalid(result)
    expect(result.violations[0]).toContain('week_start')
  })

  it('detects invalid week_start (impossible date)', () => {
    // 2024-02-30 does not exist
    const result = validateWeeklyWorkoutsRows([{ ...VALID_WORKOUTS_ROW, week_start: '2024-02-30' }])
    expectInvalid(result)
  })

  it('reports violation index in message', () => {
    const rows: WeeklyWorkoutsRowDTO[] = [
      VALID_WORKOUTS_ROW,
      { ...VALID_WORKOUTS_ROW, workouts_completed: NaN },
    ]
    const result = validateWeeklyWorkoutsRows(rows)
    expect(result.violations[0]).toContain('row[1]')
  })
})

// ──────────────────────────────────────────────────────────────
// 3. validateWeeklyStrengthVolumeRows
// ──────────────────────────────────────────────────────────────

describe('validateWeeklyStrengthVolumeRows — happy path', () => {
  it('accepts empty array', () => {
    expectValid(validateWeeklyStrengthVolumeRows([]))
  })

  it('accepts valid row with zero volume (deload week)', () => {
    expectValid(
      validateWeeklyStrengthVolumeRows([
        { ...VALID_STRENGTH_ROW, volume_kg: 0, sets_count: 0, reps_count: 0 },
      ]),
    )
  })
})

describe('validateWeeklyStrengthVolumeRows — contract violations', () => {
  it('detects negative volume_kg (DB schema regression)', () => {
    const result = validateWeeklyStrengthVolumeRows([{ ...VALID_STRENGTH_ROW, volume_kg: -100 }])
    expectInvalid(result)
    expect(result.violations[0]).toContain('volume_kg')
  })

  it('detects NaN volume_kg', () => {
    expectInvalid(validateWeeklyStrengthVolumeRows([{ ...VALID_STRENGTH_ROW, volume_kg: NaN }]))
  })

  it('detects negative sets_count', () => {
    expectInvalid(validateWeeklyStrengthVolumeRows([{ ...VALID_STRENGTH_ROW, sets_count: -5 }]))
  })

  it('detects NaN reps_count', () => {
    expectInvalid(validateWeeklyStrengthVolumeRows([{ ...VALID_STRENGTH_ROW, reps_count: NaN }]))
  })

  it('detects invalid week_start', () => {
    expectInvalid(
      validateWeeklyStrengthVolumeRows([{ ...VALID_STRENGTH_ROW, week_start: '26-01-2026' }]),
    )
  })
})

// ──────────────────────────────────────────────────────────────
// 4. validateWeeklyMuscleBalanceRows
// ──────────────────────────────────────────────────────────────

describe('validateWeeklyMuscleBalanceRows — happy path', () => {
  it('accepts empty array', () => {
    expectValid(validateWeeklyMuscleBalanceRows([]))
  })

  it('accepts valid row', () => {
    expectValid(validateWeeklyMuscleBalanceRows([VALID_MUSCLE_ROW]))
  })
})

describe('validateWeeklyMuscleBalanceRows — contract violations', () => {
  it('detects empty muscle_key', () => {
    const result = validateWeeklyMuscleBalanceRows([{ ...VALID_MUSCLE_ROW, muscle_key: '' }])
    expectInvalid(result)
    expect(result.violations[0]).toContain('muscle_key')
  })

  it('detects whitespace-only muscle_key', () => {
    expectInvalid(validateWeeklyMuscleBalanceRows([{ ...VALID_MUSCLE_ROW, muscle_key: '   ' }]))
  })

  it('detects negative volume_kg', () => {
    const result = validateWeeklyMuscleBalanceRows([{ ...VALID_MUSCLE_ROW, volume_kg: -1 }])
    expectInvalid(result)
    expect(result.violations[0]).toContain('volume_kg')
  })

  it('detects NaN volume_kg', () => {
    expectInvalid(validateWeeklyMuscleBalanceRows([{ ...VALID_MUSCLE_ROW, volume_kg: NaN }]))
  })

  it('detects empty user_id (RLS misconfiguration)', () => {
    const result = validateWeeklyMuscleBalanceRows([{ ...VALID_MUSCLE_ROW, user_id: '  ' }])
    expectInvalid(result)
    expect(result.violations[0]).toContain('user_id')
  })
})

// ──────────────────────────────────────────────────────────────
// 5. validateExerciseE1RMWeeklyRows
// ──────────────────────────────────────────────────────────────

describe('validateExerciseE1RMWeeklyRows — happy path', () => {
  it('accepts empty array', () => {
    expectValid(validateExerciseE1RMWeeklyRows([]))
  })

  it('accepts valid row', () => {
    expectValid(validateExerciseE1RMWeeklyRows([VALID_E1RM_ROW]))
  })

  it('accepts a row with best_e1rm just above zero', () => {
    expectValid(validateExerciseE1RMWeeklyRows([{ ...VALID_E1RM_ROW, best_e1rm: 0.1 }]))
  })
})

describe('validateExerciseE1RMWeeklyRows — contract violations', () => {
  it('detects zero best_e1rm (impossible from Epley formula)', () => {
    const result = validateExerciseE1RMWeeklyRows([{ ...VALID_E1RM_ROW, best_e1rm: 0 }])
    expectInvalid(result)
    expect(result.violations[0]).toContain('best_e1rm')
  })

  it('detects negative best_e1rm (DB sign error)', () => {
    const result = validateExerciseE1RMWeeklyRows([{ ...VALID_E1RM_ROW, best_e1rm: -50 }])
    expectInvalid(result)
    expect(result.violations[0]).toContain('best_e1rm')
  })

  it('detects NaN best_e1rm (missing column)', () => {
    expectInvalid(validateExerciseE1RMWeeklyRows([{ ...VALID_E1RM_ROW, best_e1rm: NaN }]))
  })

  it('detects empty exercise_definition_id', () => {
    const result = validateExerciseE1RMWeeklyRows([
      { ...VALID_E1RM_ROW, exercise_definition_id: '' },
    ])
    expectInvalid(result)
    expect(result.violations[0]).toContain('exercise_definition_id')
  })

  it('detects invalid week_start format', () => {
    expectInvalid(validateExerciseE1RMWeeklyRows([{ ...VALID_E1RM_ROW, week_start: '2026/01/27' }]))
  })

  it('reports row index in violation message', () => {
    const rows: ExerciseE1RMWeeklyRowDTO[] = [
      VALID_E1RM_ROW,
      VALID_E1RM_ROW,
      { ...VALID_E1RM_ROW, best_e1rm: -10 },
    ]
    const result = validateExerciseE1RMWeeklyRows(rows)
    expect(result.violations[0]).toContain('row[2]')
  })
})

// ──────────────────────────────────────────────────────────────
// 6. warnIfInvalid helper
// ──────────────────────────────────────────────────────────────

describe('warnIfInvalid', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does NOT log when result is valid', () => {
    warnIfInvalid({ valid: true, violations: [] }, 'test-context')
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('logs once when result has violations', () => {
    warnIfInvalid(
      { valid: false, violations: ['workouts: expected >= 0, got -1'] },
      'rpc_progress_overview',
    )
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('includes context name in the warning message', () => {
    warnIfInvalid({ valid: false, violations: ['something went wrong'] }, 'weekly_workouts')
    const call = (console.warn as jest.Mock).mock.calls[0][0]
    expect(call).toContain('weekly_workouts')
  })

  it('includes violation text in the warning message', () => {
    const violation = 'range_days must be a positive finite number, got: NaN'
    warnIfInvalid({ valid: false, violations: [violation] }, 'ctx')
    const call = (console.warn as jest.Mock).mock.calls[0][0]
    expect(call).toContain(violation)
  })

  it('does NOT throw even when violations are present', () => {
    expect(() => {
      warnIfInvalid({ valid: false, violations: ['bad field'] }, 'ctx')
    }).not.toThrow()
  })
})

// ──────────────────────────────────────────────────────────────
// 7. Multi-row error accumulation
// ──────────────────────────────────────────────────────────────

describe('Multi-row validation — accumulates all violations', () => {
  it('reports violations from multiple rows in a single result', () => {
    const rows: WeeklyMuscleBalanceRowDTO[] = [
      { ...VALID_MUSCLE_ROW, muscle_key: '' }, // row[0] violation
      VALID_MUSCLE_ROW, // row[1] valid
      { ...VALID_MUSCLE_ROW, volume_kg: -200 }, // row[2] violation
    ]
    const result = validateWeeklyMuscleBalanceRows(rows)
    expect(result.valid).toBe(false)
    expect(result.violations).toHaveLength(2)
    expect(result.violations[0]).toContain('row[0]')
    expect(result.violations[1]).toContain('row[2]')
  })
})
