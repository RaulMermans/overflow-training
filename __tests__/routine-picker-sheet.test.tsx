import React from 'react'
import { ThemeProvider } from '@shopify/restyle'
import renderer, { act } from 'react-test-renderer'
import { ScrollView } from 'react-native'
import { RoutinePickerSheet } from '../src/features/calendar/components/RoutinePickerSheet'
import { Button } from '../src/components/ui/Button'
import { I18nContext, type I18nContextValue } from '../src/i18n/I18nProvider'
import { createTranslator } from '../src/i18n'
import { restyleTheme } from '../src/theme/restyleTheme'
import type { Routine } from '../src/lib/routines'

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual<typeof import('react')>('react')
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native')

  return {
    Ionicons: ({ name }: { name: string }) => React.createElement(Text, null, name),
  }
})

function makeI18nContextValue(): I18nContextValue {
  return {
    language: 'en',
    setLanguage: async () => undefined,
    t: createTranslator('en'),
  }
}

function makeRoutine(id: string, name: string): Routine {
  return {
    id,
    name,
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    items: [
      {
        exerciseDefinitionId: `exercise-${id}`,
        orderIndex: 0,
        section: 'main',
      },
    ],
  }
}

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof RoutinePickerSheet>> = {},
): ReturnType<typeof renderer.create> {
  const routine = makeRoutine('routine-1', 'Golden Routine')

  return renderer.create(
    <ThemeProvider theme={restyleTheme}>
      <I18nContext.Provider value={makeI18nContextValue()}>
        <RoutinePickerSheet
          targetDateKey="2026-03-10"
          sections={[
            {
              key: 'all',
              title: 'All routines',
              data: [routine],
            },
          ]}
          selectedRoutineId={null}
          isScheduling={false}
          isLoadingRoutines={false}
          errorMessage={null}
          query=""
          onQueryChange={() => undefined}
          formatCalendarDate={() => 'Tuesday, March 10'}
          onSelectRoutine={() => undefined}
          onScheduleRoutine={() => undefined}
          onRetryLoad={() => undefined}
          onCreateRoutine={() => undefined}
          onBack={() => undefined}
          onClose={() => undefined}
          {...overrides}
        />
      </I18nContext.Provider>
    </ThemeProvider>,
  )
}

describe('RoutinePickerSheet', () => {
  it('renders an explicit failure state with retry action', () => {
    const onRetryLoad = jest.fn()
    let tree: ReturnType<typeof renderer.create> | null = null

    act(() => {
      tree = renderSheet({
        sections: [],
        errorMessage: 'We could not load your latest routines right now.',
        onRetryLoad,
      })
    })

    if (!tree) {
      throw new Error('Expected picker to render')
    }

    const errorState = tree.root.findByProps({ testID: 'calendar:routinePicker:errorState' })
    const retryButton = tree.root.findByProps({ testID: 'calendar:routinePicker:retryButton' })

    expect(errorState).toBeTruthy()

    act(() => {
      retryButton.props.onPress()
    })

    expect(onRetryLoad).toHaveBeenCalledTimes(1)
  })

  it('renders an explicit empty state when there are no routines', () => {
    let tree: ReturnType<typeof renderer.create> | null = null

    act(() => {
      tree = renderSheet({
        sections: [],
      })
    })

    if (!tree) {
      throw new Error('Expected picker to render')
    }

    expect(tree.root.findByProps({ testID: 'calendar:routinePicker:emptyState' })).toBeTruthy()
  })

  it('renders an explicit search no-results state', () => {
    let tree: ReturnType<typeof renderer.create> | null = null

    act(() => {
      tree = renderSheet({
        sections: [],
        query: 'zzz',
      })
    })

    if (!tree) {
      throw new Error('Expected picker to render')
    }

    expect(tree.root.findByProps({ testID: 'calendar:routinePicker:noSearchResults' })).toBeTruthy()
  })

  it('renders both generic and explicit routine row selectors', () => {
    let tree: ReturnType<typeof renderer.create> | null = null

    act(() => {
      tree = renderSheet()
    })

    if (!tree) {
      throw new Error('Expected picker to render')
    }

    expect(tree.root.findAllByProps({ testID: 'calendar:routineRow' }).length).toBeGreaterThan(0)
    expect(tree.root.findByProps({ testID: 'calendar:routineRow:routine-1' })).toBeTruthy()
  })

  it('keeps the routine list inside a scroll container with footer actions present', () => {
    let tree: ReturnType<typeof renderer.create> | null = null

    act(() => {
      tree = renderSheet({
        sections: [
          {
            key: 'recent',
            title: 'Recent',
            data: [makeRoutine('routine-1', 'Golden Routine')],
          },
          {
            key: 'all',
            title: 'All routines',
            data: [makeRoutine('routine-2', 'Silver Routine')],
          },
        ],
      })
    })

    if (!tree) {
      throw new Error('Expected picker to render')
    }

    expect(tree.root.findByType(ScrollView)).toBeTruthy()
    expect(
      tree.root
        .findAllByType(Button)
        .some((node: { props: { title?: string } }) => node.props.title === 'New routine'),
    ).toBe(true)
    expect(
      tree.root
        .findAllByType(Button)
        .some((node: { props: { title?: string } }) => node.props.title === 'Back'),
    ).toBe(true)
  })

  it('enables scheduling only after a routine is selected', () => {
    const scheduleCalls: Array<[string, string]> = []
    const onScheduleRoutine: React.ComponentProps<
      typeof RoutinePickerSheet
    >['onScheduleRoutine'] = (routineId, targetDateKey) => {
      scheduleCalls.push([routineId, targetDateKey])
    }
    let tree: ReturnType<typeof renderer.create> | null = null

    act(() => {
      tree = renderSheet({
        selectedRoutineId: 'routine-1',
        onScheduleRoutine,
      })
    })

    if (!tree) {
      throw new Error('Expected picker to render')
    }

    const cta = tree.root.findByProps({ testID: 'calendar:scheduleRoutineButton' })

    expect(cta.props.disabled).toBe(false)

    act(() => {
      cta.props.onPress()
    })

    expect(scheduleCalls).toEqual([['routine-1', '2026-03-10']])
  })
})
