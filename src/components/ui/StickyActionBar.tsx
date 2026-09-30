import type { ReactNode } from 'react'
import { BottomCTA } from './BottomCTA'

interface StickyActionBarProps {
  children: ReactNode
}

export function StickyActionBar({ children }: StickyActionBarProps) {
  return <BottomCTA>{children}</BottomCTA>
}
