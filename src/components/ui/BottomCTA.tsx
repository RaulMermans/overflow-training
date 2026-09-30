import type { ReactNode } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Box, type BoxProps } from './Box'

interface BottomCTAProps {
  children: ReactNode
  horizontalPadding?: BoxProps['paddingHorizontal']
  onLayout?: (event: LayoutChangeEvent) => void
}

export function BottomCTA({ children, horizontalPadding = 'xl', onLayout }: BottomCTAProps) {
  return (
    <SafeAreaView edges={['bottom']} onLayout={onLayout}>
      <Box
        backgroundColor="backgroundSecondary"
        borderTopWidth={1}
        borderTopColor="borderDefault"
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
