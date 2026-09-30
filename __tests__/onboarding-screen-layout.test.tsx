import React from 'react'
import { ScrollView } from 'react-native'
import { ThemeProvider } from '@shopify/restyle'
import renderer, { act } from 'react-test-renderer'
import OnboardingScreen from '../app/(app)/onboarding'
import { Button } from '../src/components/ui/Button'
import { BottomCTA } from '../src/components/ui/BottomCTA'
import { restyleTheme } from '../src/theme/restyleTheme'

const mockReplace = jest.fn()

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react')

  return {
    Redirect: () => React.createElement(React.Fragment, null),
    useRouter: () => ({ replace: mockReplace }),
  }
})

jest.mock('../src/auth/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: 'user@example.com',
      user_metadata: { display_name: 'Raul' },
    },
  }),
}))

jest.mock('../src/components/ui/ExerciseSearch', () => () => null)

jest.mock('../src/lib/profilePreferences', () => ({
  loadProfilePreferences: async () => ({ units: 'kg', restTimerSeconds: 90 }),
  saveProfilePreferences: async () => undefined,
}))

jest.mock('../src/lib/onboardingProfile', () => ({
  saveOnboardingProfile: async () => undefined,
  loadOnboardingProfile: async () => ({
    focus: [],
    experience: 'beginner',
    equipment: [],
  }),
  VALID_EQUIPMENT: [
    'bodyweight',
    'dumbbells',
    'barbell',
    'cables',
    'machines',
    'bands',
    'kettlebell',
  ],
}))

jest.mock('../src/i18n/useI18n', () => ({
  useI18n: () => ({
    language: 'en',
    setLanguage: async () => undefined,
    t: (key: string, params?: Record<string, string>) => {
      if (key === 'common.continue') return 'Continue'
      if (key === 'common.back') return 'Back'
      if (key === 'common.skip') return 'Skip'
      if (key === 'common.language') return 'Language'
      if (key === 'onboarding.stepIndicator') {
        return `Step ${params?.current ?? '1'} of ${params?.total ?? '4'}`
      }

      return key
    },
  }),
}))

describe('OnboardingScreen layout', () => {
  beforeEach(() => {
    mockReplace.mockReset()
  })

  it('keeps the focus-selection step inside a scroll container with a bottom action bar', () => {
    let tree: ReturnType<typeof renderer.create> | null = null

    act(() => {
      tree = renderer.create(
        <ThemeProvider theme={restyleTheme}>
          <OnboardingScreen />
        </ThemeProvider>,
      )
    })

    if (!tree) {
      throw new Error('Expected onboarding screen to render')
    }

    const continueButton = tree.root
      .findAllByType(Button)
      .find((node: { props: { title?: string } }) => node.props.title === 'Continue')

    if (!continueButton) {
      throw new Error('Expected continue button on onboarding intro step')
    }

    act(() => {
      continueButton.props.onPress()
    })

    expect(tree.root.findByType(ScrollView)).toBeTruthy()
    expect(tree.root.findByType(BottomCTA)).toBeTruthy()
    expect(
      tree.root.findAllByType(Button).some((node: { props: { title?: string } }) => {
        return node.props.title === 'Continue'
      }),
    ).toBe(true)
    expect(
      tree.root.findAll((node: { props: { children?: unknown } }) => node.props.children === 'Back')
        .length,
    ).toBeGreaterThan(0)
    expect(
      tree.root.findAll((node: { props: { children?: unknown } }) => node.props.children === 'Skip')
        .length,
    ).toBeGreaterThan(0)
  })

  it('uses a single save CTA on the routine step instead of stacking footer and in-content primaries', () => {
    let tree: ReturnType<typeof renderer.create> | null = null

    act(() => {
      tree = renderer.create(
        <ThemeProvider theme={restyleTheme}>
          <OnboardingScreen />
        </ThemeProvider>,
      )
    })

    if (!tree) {
      throw new Error('Expected onboarding screen to render')
    }

    const findButton = (title: string) =>
      tree.root.findAllByType(Button).find((node: { props: { title?: string } }) => {
        return node.props.title === title
      })

    // Advance past step 0 (welcome) to step 1 (identity)
    act(() => {
      findButton('Continue')?.props.onPress()
    })

    // Advance past step 1 (identity — optional) to step 2 (intention)
    act(() => {
      findButton('Continue')?.props.onPress()
    })

    const intentionOption = tree.root
      .findAll((node: { props: { onPress?: unknown; minHeight?: number; style?: unknown } }) => {
        return typeof node.props.onPress === 'function'
      })
      .find((node: { props: { minHeight?: number; style?: unknown } }) => {
        return node.props.minHeight === 64 && !node.props.style
      })

    if (!intentionOption) {
      throw new Error('Expected onboarding intention option')
    }

    act(() => {
      intentionOption.props.onPress()
    })

    act(() => {
      findButton('Continue')?.props.onPress()
    })

    const rhythmOption = tree.root
      .findAll((node: { props: { onPress?: unknown; minHeight?: number; style?: unknown } }) => {
        return typeof node.props.onPress === 'function'
      })
      .find((node: { props: { minHeight?: number; style?: { width?: string } } }) => {
        return node.props.minHeight === 64 && node.props.style?.width === '47%'
      })

    if (!rhythmOption) {
      throw new Error('Expected onboarding rhythm option')
    }

    act(() => {
      rhythmOption.props.onPress()
    })

    act(() => {
      findButton('Continue')?.props.onPress()
    })

    // Step 4 is now equipment — advance past it to reach the routine step
    act(() => {
      findButton('Continue')?.props.onPress()
    })

    const saveButtons = tree.root
      .findAllByType(Button)
      .filter(
        (node: { props: { title?: string } }) => node.props.title === 'onboarding.step3.saveCta',
      )

    expect(saveButtons).toHaveLength(1)
    expect(
      tree.root.findAllByType(Button).some((node: { props: { title?: string } }) => {
        return node.props.title === 'onboarding.finishCta'
      }),
    ).toBe(false)
    expect(tree.root.findAllByType(BottomCTA)).toHaveLength(1)
  })
})
