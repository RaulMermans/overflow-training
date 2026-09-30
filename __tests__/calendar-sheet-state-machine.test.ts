import {
  closeSheet,
  createInitialSheetState,
  openRoutinePicker,
  returnToDaySheet,
  type SheetState,
} from '../src/features/calendar/sheetStateMachine'

describe('calendar sheet state machine', () => {
  it('creates a closed day sheet state with seeded date', () => {
    expect(createInitialSheetState('2026-02-27')).toEqual({
      open: false,
      dateKey: '2026-02-27',
      mode: 'day',
    })
  })

  it('opens routine picker in-place without closing the sheet', () => {
    const current: SheetState = {
      open: true,
      dateKey: '2026-02-27',
      mode: 'day',
    }

    expect(openRoutinePicker(current)).toEqual({
      open: true,
      dateKey: '2026-02-27',
      mode: 'pickRoutine',
    })
  })

  it('returns from picker to day mode without closing the sheet', () => {
    const picker: SheetState = {
      open: true,
      dateKey: '2026-02-27',
      mode: 'pickRoutine',
    }

    expect(returnToDaySheet(picker)).toEqual({
      open: true,
      dateKey: '2026-02-27',
      mode: 'day',
    })
  })

  it('closes the sheet while preserving date context', () => {
    const current: SheetState = {
      open: true,
      dateKey: '2026-02-27',
      mode: 'pickRoutine',
    }

    expect(closeSheet(current)).toEqual({
      open: false,
      dateKey: '2026-02-27',
      mode: 'pickRoutine',
    })
  })

  it('supports nullable dateKey without crashing routine picker transitions', () => {
    const current: SheetState = {
      open: true,
      dateKey: null,
      mode: 'day',
    }

    expect(openRoutinePicker(current)).toEqual({
      open: true,
      dateKey: null,
      mode: 'pickRoutine',
    })
  })
})
