import { useEffect } from 'react'

export function useDebouncedLocalStorage(key: string, value: unknown, delayMs = 180) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // Persistence is a convenience and must never block configuration.
      }
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [delayMs, key, value])
}
