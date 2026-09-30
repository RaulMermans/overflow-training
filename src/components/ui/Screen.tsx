import type { ReactNode } from 'react'
import type { Edge } from 'react-native-safe-area-context'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { ScrollViewProps, ViewStyle } from 'react-native'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useTheme } from '@shopify/restyle'
import type { Theme } from '../../theme/restyleTheme'
import { SunriseWash } from './SunriseWash'

type SpacingKey = keyof Theme['spacing']
type ColorKey = keyof Theme['colors']

interface ScreenProps {
  children: ReactNode
  scroll?: boolean
  edges?: Edge[]
  backgroundColor?: ColorKey
  horizontalPadding?: SpacingKey
  bottomPadding?: SpacingKey
  maxContentWidth?: number
  contentAlign?: 'stretch' | 'center'
  wash?: boolean
  refreshControl?: ScrollViewProps['refreshControl']
}

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  backgroundColor = 'background',
  horizontalPadding = 'xl',
  bottomPadding = '4xl',
  maxContentWidth,
  contentAlign = 'stretch',
  wash = true,
  refreshControl,
}: ScreenProps) {
  const theme = useTheme<Theme>()
  const shouldRenderWash = wash && backgroundColor === 'background'
  const alignAxis: ViewStyle['alignItems'] = contentAlign === 'center' ? 'center' : 'stretch'
  const contentContainerStyle: ViewStyle = {
    paddingHorizontal: theme.spacing[horizontalPadding],
    paddingBottom: theme.spacing[bottomPadding],
    alignItems: alignAxis,
    flexGrow: 1,
  }
  const innerContentStyle: ViewStyle = {
    width: '100%' as const,
    maxWidth: maxContentWidth,
    alignSelf: alignAxis,
    flex: scroll ? undefined : 1,
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors[backgroundColor] }]}
      edges={edges}
    >
      {shouldRenderWash ? <SunriseWash /> : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={contentContainerStyle}
          style={styles.container}
          refreshControl={refreshControl}
        >
          <View style={innerContentStyle}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.container, contentContainerStyle]}>
          <View style={innerContentStyle}>{children}</View>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
