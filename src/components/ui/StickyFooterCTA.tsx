import type { ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Box, type BoxProps } from './Box'

interface StickyFooterCTAProps {
  children: ReactNode
  horizontalPadding?: BoxProps['paddingHorizontal']
  backgroundColor?: BoxProps['backgroundColor']
  testID?: string
  floating?: boolean
}

export function StickyFooterCTA({
  children,
  horizontalPadding = 'xl',
  backgroundColor = 'backgroundSecondary',
  testID,
  floating = false,
}: StickyFooterCTAProps) {
  return (
    <SafeAreaView edges={['bottom']} style={floating ? styles.floating : undefined}>
      <Box
        testID={testID}
        backgroundColor={backgroundColor}
        borderTopWidth={1}
        borderTopColor="divider"
        paddingHorizontal={horizontalPadding}
        paddingTop="md"
        paddingBottom="sm"
        flexDirection="row"
        gap="sm"
      >
        {children}
      </Box>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  floating: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
})
