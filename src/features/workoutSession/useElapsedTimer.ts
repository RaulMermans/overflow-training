import { useEffect, useState } from 'react'

/**
 * Standalone elapsed-time hook.
 *
 * Extracted from the main controller so that the 1-second timer tick
 * only re-renders the component that consumes this hook, rather than
 * the entire 2600-line controller and every downstream consumer.
 */
export function useElapsedTimer(sessionStartedAt: string | null): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!sessionStartedAt) {
      setElapsedSeconds(0)
      return
    }

    const startedMs = new Date(sessionStartedAt).getTime()
    const updateElapsed = () => {
      const diff = Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
      setElapsedSeconds(diff)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [sessionStartedAt])

  return elapsedSeconds
}
