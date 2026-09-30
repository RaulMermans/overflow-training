import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function shouldAnimate(reducedMotion: boolean): boolean {
  return !reducedMotion
}

export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    let isMounted = true

    if (typeof AccessibilityInfo.isReduceMotionEnabled === 'function') {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((value) => {
          if (isMounted) {
            setReducedMotion(value)
          }
        })
        .catch(() => {
          // Keep default false when the platform does not expose this setting.
        })
    }

    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
      setReducedMotion(value)
    })

    return () => {
      isMounted = false
      subscription?.remove()
    }
  }, [])

  return reducedMotion
}
