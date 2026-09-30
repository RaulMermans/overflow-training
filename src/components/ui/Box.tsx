import type { ComponentProps } from 'react'
import { createBox } from '@shopify/restyle'
import { Theme } from '../../theme/restyleTheme'

export const Box = createBox<Theme>()

export type BoxProps = ComponentProps<typeof Box>
