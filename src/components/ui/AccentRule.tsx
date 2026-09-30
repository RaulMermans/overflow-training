import { Box } from './Box'

interface AccentRuleProps {
  width?: number
  centered?: boolean
}

export function AccentRule({ width = 80, centered = false }: AccentRuleProps) {
  return (
    <Box
      height={3}
      width={width}
      backgroundColor="accent"
      borderRadius="full"
      alignSelf={centered ? 'center' : 'flex-start'}
    />
  )
}
