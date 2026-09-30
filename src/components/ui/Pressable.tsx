import type { ComponentProps } from 'react'
import {
  backgroundColor,
  border,
  createRestyleComponent,
  layout,
  opacity,
  spacing,
  type BackgroundColorProps,
  type BorderProps,
  type LayoutProps,
  type OpacityProps,
  type SpacingProps,
} from '@shopify/restyle'
import { Pressable as RNPressable } from 'react-native'
import type { Theme } from '../../theme/restyleTheme'

type RestyleProps = SpacingProps<Theme> &
  LayoutProps<Theme> &
  BackgroundColorProps<Theme> &
  BorderProps<Theme> &
  OpacityProps<Theme>

export type PressableProps = ComponentProps<typeof RNPressable> & RestyleProps

export const Pressable = createRestyleComponent<PressableProps, Theme>(
  [spacing, layout, backgroundColor, border, opacity],
  RNPressable,
)
