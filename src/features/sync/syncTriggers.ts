/**
 * Lightweight trigger for sync when mutations queue to outbox.
 * SyncProvider subscribes and runs a sync cycle when triggerSync() is called.
 * Keeps the mutation layer free of React and avoids circular dependencies.
 */

type Listener = () => void

let listeners: Listener[] = []

export function subscribe(listener: Listener): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

export function triggerSync(): void {
  listeners.forEach((l) => {
    try {
      l()
    } catch (e) {
      if (__DEV__) {
        console.warn('[syncTriggers] listener threw:', e)
      }
    }
  })
}
