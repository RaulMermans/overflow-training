import React from 'react'
import { ThemeProvider } from '@shopify/restyle'
import renderer, { act } from 'react-test-renderer'

type TestNode = { props: { accessibilityRole?: string; onPress?: unknown } }
import { AppHeader } from '../src/components/ui/AppHeader'
import { restyleTheme } from '../src/theme/restyleTheme'

describe('AppHeader actions', () => {
  it('renders left and right actions and calls their handlers', () => {
    const onLeftActionPress = jest.fn()
    const onRightActionPress = jest.fn()
    let tree: ReturnType<typeof renderer.create> | null = null

    act(() => {
      tree = renderer.create(
        <ThemeProvider theme={restyleTheme}>
          <AppHeader
            title="Check-ins"
            subtitle="Track progress"
            leftActionLabel="Back"
            onLeftActionPress={onLeftActionPress}
            rightActionLabel="Add"
            onRightActionPress={onRightActionPress}
          />
        </ThemeProvider>,
      )
    })

    if (!tree) {
      throw new Error('Expected header to render')
    }

    const leftButtons = tree.root.findAll(
      (node: TestNode) =>
        node.props.accessibilityRole === 'button' && node.props.onPress === onLeftActionPress,
    )
    const rightButtons = tree.root.findAll(
      (node: TestNode) =>
        node.props.accessibilityRole === 'button' && node.props.onPress === onRightActionPress,
    )
    expect(leftButtons.length).toBeGreaterThan(0)
    expect(rightButtons.length).toBeGreaterThan(0)

    act(() => {
      leftButtons[0]?.props.onPress?.()
      rightButtons[0]?.props.onPress?.()
    })

    expect(onLeftActionPress).toHaveBeenCalledTimes(1)
    expect(onRightActionPress).toHaveBeenCalledTimes(1)
  })

  it('does not render left action when handler is missing', () => {
    let tree: ReturnType<typeof renderer.create> | null = null

    act(() => {
      tree = renderer.create(
        <ThemeProvider theme={restyleTheme}>
          <AppHeader title="Check-ins" leftActionLabel="Back" />
        </ThemeProvider>,
      )
    })

    if (!tree) {
      throw new Error('Expected header to render')
    }

    const buttons = tree.root.findAll(
      (node: TestNode) =>
        node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    )
    expect(buttons).toHaveLength(0)
  })
})
