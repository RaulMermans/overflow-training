import type { ReactNode } from 'react'
import { BottomCTA } from './BottomCTA'

interface BottomActionBarProps {
  children: ReactNode
}

export function BottomActionBar({ children }: BottomActionBarProps) {
  return <BottomCTA>{children}</BottomCTA>
}
