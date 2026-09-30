import React from 'react'
import { ThemeProvider } from '@shopify/restyle'
import { StyleSheet, TextInput, type TextStyle } from 'react-native'
import renderer, { act } from 'react-test-renderer'
import { Input } from '../src/components/ui/Input'
import { restyleTheme } from '../src/theme/restyleTheme'

function flattenInputStyle(style: unknown): TextStyle {
  return StyleSheet.flatten(style as TextStyle)
}

function renderInput(editable = true) {
  let tree: ReturnType<typeof renderer.create> | null = null

  act(() => {
    tree = renderer.create(
      <ThemeProvider theme={restyleTheme}>
        <Input placeholder="Email" editable={editable} />
      </ThemeProvider>,
    )
  })

  if (!tree) {
    throw new Error('Expected input tree to render')
  }

  return tree
}

describe('Input focus and editability', () => {
  it('drops focus styling when input becomes non-editable', () => {
    const tree = renderInput(true)

    const textInput = tree.root.findByType(TextInput)
    act(() => {
      textInput.props.onFocus?.({} as never)
    })

    const focusedStyle = flattenInputStyle(textInput.props.style)
    expect(focusedStyle.borderColor).toBe(restyleTheme.colors.accent)

    act(() => {
      tree.update(
        <ThemeProvider theme={restyleTheme}>
          <Input placeholder="Email" editable={false} />
        </ThemeProvider>,
      )
    })

    const disabledInput = tree.root.findByType(TextInput)
    const disabledStyle = flattenInputStyle(disabledInput.props.style)
    expect(disabledStyle.borderColor).toBe(restyleTheme.colors.borderDefault)
    expect(disabledInput.props.placeholderTextColor).toBe(restyleTheme.colors.textDisabled)
  })

  it('allows focus styling again after re-enabling input', () => {
    const tree = renderInput(false)

    act(() => {
      tree.update(
        <ThemeProvider theme={restyleTheme}>
          <Input placeholder="Email" editable />
        </ThemeProvider>,
      )
    })

    const reEnabledInput = tree.root.findByType(TextInput)
    act(() => {
      reEnabledInput.props.onFocus?.({} as never)
    })

    const focusedStyle = flattenInputStyle(reEnabledInput.props.style)
    expect(focusedStyle.borderColor).toBe(restyleTheme.colors.accent)
  })
})
