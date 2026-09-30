import { Box, type BoxProps } from './Box'

export function Divider(props: Omit<BoxProps, 'children'>) {
  return <Box borderBottomWidth={1} borderBottomColor="borderSubtle" {...props} />
}
