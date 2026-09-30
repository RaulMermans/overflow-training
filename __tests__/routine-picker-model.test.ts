import type { RoutineUsageMap } from '../src/lib/routines'
import {
  buildRoutineSections,
  buildRoutinePickerSections,
  normalizeQuery,
  safeTimestamp,
  type RoutinePickerRoutine,
} from '../src/features/calendar/routinePickerModel'

type TestRoutine = RoutinePickerRoutine

const routines: TestRoutine[] = [
  { id: 'pin-z', name: 'Zulu Pin', pinned: true, updatedAt: '2026-01-02T00:00:00.000Z' },
  { id: 'pin-a', name: 'Alpha Pin', pinned: true, updatedAt: '2026-01-02T00:00:00.000Z' },
  { id: 'recent-b', name: 'Beta Recent', updatedAt: '2026-01-06T00:00:00.000Z' },
  { id: 'recent-a', name: 'Alpha Recent', updatedAt: '2026-01-05T00:00:00.000Z' },
  { id: 'recent-c', name: 'Charlie Recent', updatedAt: '2026-01-04T00:00:00.000Z' },
  { id: 'all-c', name: 'Charlie All', updatedAt: '2026-01-03T00:00:00.000Z' },
  { id: 'all-a', name: 'Alpha All', updatedAt: '2026-01-03T00:00:00.000Z' },
  { id: 'all-b', name: 'Bravo All', updatedAt: '2026-01-02T00:00:00.000Z' },
]

const usage: RoutineUsageMap = {
  'pin-a': { usedCount: 10, lastUsedAt: '2026-04-01T00:00:00.000Z' },
  'recent-b': { usedCount: 5, lastUsedAt: '2026-03-01T00:00:00.000Z' },
  'recent-a': { usedCount: 4, lastUsedAt: '2026-02-10T00:00:00.000Z' },
  'recent-c': { usedCount: 4, lastUsedAt: '2026-02-10T00:00:00.000Z' },
}

function sectionIds(sections: ReturnType<typeof buildRoutinePickerSections<TestRoutine>>) {
  return sections.map((section) => ({
    key: section.key,
    ids: section.data.map((routine) => routine.id),
  }))
}

describe('routinePickerModel', () => {
  it('builds pinned/recent/all buckets with pinned excluded from recent/all', () => {
    const buckets = buildRoutineSections({ routines, usage, query: '' })

    expect(buckets.pinned.map((routine) => routine.id)).toEqual(['pin-a', 'pin-z'])
    expect(buckets.recent.map((routine) => routine.id)).toEqual([
      'recent-b',
      'recent-a',
      'recent-c',
    ])
    expect(buckets.all.map((routine) => routine.id)).toEqual(['all-a', 'all-c', 'all-b'])
    expect(buckets.recent.some((routine) => routine.id.startsWith('pin-'))).toBe(false)
    expect(buckets.all.some((routine) => routine.id.startsWith('pin-'))).toBe(false)
  })

  it('puts pinned first and excludes pinned routines from recent/all', () => {
    const sections = buildRoutinePickerSections({ routines, usage, query: '' })

    expect(sections.map((section) => section.key)).toEqual(['pinned', 'recent', 'all'])
    expect(sections[0].data.map((routine) => routine.id)).toEqual(['pin-a', 'pin-z'])

    const nonPinnedIds = new Set(
      sections.slice(1).flatMap((section) => section.data.map((routine) => routine.id)),
    )
    expect(nonPinnedIds.has('pin-a')).toBe(false)
    expect(nonPinnedIds.has('pin-z')).toBe(false)
  })

  it('sorts recent by lastUsedAt desc with deterministic tie-breakers', () => {
    const sections = buildRoutinePickerSections({ routines, usage, query: '' })
    const recent = sections.find((section) => section.key === 'recent')

    expect(recent?.data.map((routine) => routine.id)).toEqual(['recent-b', 'recent-a', 'recent-c'])
  })

  it('sorts all by updatedAt desc, then name, then id', () => {
    const sections = buildRoutinePickerSections({ routines, usage, query: '' })
    const allSection = sections.find((section) => section.key === 'all')

    expect(allSection?.data.map((routine) => routine.id)).toEqual(['all-a', 'all-c', 'all-b'])
  })

  it('filters search case-insensitively while preserving section order and in-section ordering', () => {
    const buckets = buildRoutineSections({ routines, usage, query: 'AlPhA' })
    const base = buildRoutinePickerSections({ routines, usage, query: '' })
    const filtered = buildRoutinePickerSections({ routines, usage, query: 'AlPhA' })
    const filteredAgain = buildRoutinePickerSections({ routines, usage, query: 'alpha' })

    const expected = sectionIds(base)
      .map((section) => ({
        key: section.key,
        ids: section.ids.filter((id) => {
          const routine = routines.find((entry) => entry.id === id)
          return routine ? routine.name.toLocaleLowerCase().includes('alpha') : false
        }),
      }))
      .filter((section) => section.ids.length > 0)

    expect(sectionIds(filtered)).toEqual(expected)
    expect(sectionIds(filteredAgain)).toEqual(expected)
    expect(buckets.pinned.map((routine) => routine.id)).toEqual(['pin-a'])
    expect(buckets.recent.map((routine) => routine.id)).toEqual(['recent-a'])
    expect(buckets.all.map((routine) => routine.id)).toEqual(['all-a'])
  })

  it('keeps search ordering stable across repeated queries', () => {
    const first = buildRoutineSections({ routines, usage, query: 'recent' })
    const second = buildRoutineSections({ routines, usage, query: 'ReCeNt' })

    expect(first).toEqual(second)
  })

  it('normalizes query and parses timestamps defensively', () => {
    expect(normalizeQuery('  AlPhA  ')).toBe('alpha')
    expect(safeTimestamp('not-a-date')).toBe(0)
    expect(safeTimestamp(new Date('2026-01-01T00:00:00.000Z'))).toBeGreaterThan(0)
  })
})
