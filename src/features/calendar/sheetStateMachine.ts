export type SheetMode = 'day' | 'pickRoutine'

export type SheetState = {
  open: boolean
  dateKey: string | null
  mode: SheetMode
}

export function createInitialSheetState(dateKey: string): SheetState {
  return {
    open: false,
    dateKey,
    mode: 'day',
  }
}

export function openDaySheet(dateKey: string): SheetState {
  return {
    open: true,
    dateKey,
    mode: 'day',
  }
}

export function openRoutinePicker(current: SheetState, dateKey?: string): SheetState {
  return {
    open: true,
    dateKey: dateKey ?? current.dateKey,
    mode: 'pickRoutine',
  }
}

export function returnToDaySheet(current: SheetState): SheetState {
  return {
    ...current,
    open: true,
    mode: 'day',
  }
}

export function closeSheet(current: SheetState): SheetState {
  return {
    ...current,
    open: false,
  }
}
