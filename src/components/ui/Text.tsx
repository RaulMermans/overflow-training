import type { ComponentProps } from 'react'
import { createText } from '@shopify/restyle'
import { Theme } from '../../theme/restyleTheme'

export const Text = createText<Theme>()

export type TextProps = ComponentProps<typeof Text>
