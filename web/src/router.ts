import { useSyncExternalStore } from 'react'

// ponytail: a handful of routes on the History API; reach for a router library if nesting or loaders appear.
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  window.addEventListener('popstate', fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('popstate', fn)
  }
}

export const usePath = () => useSyncExternalStore(subscribe, () => window.location.pathname)

export function navigate(to: string) {
  if (to === window.location.pathname) return
  window.history.pushState(null, '', to)
  listeners.forEach((fn) => fn())
  window.scrollTo(0, 0)
}
