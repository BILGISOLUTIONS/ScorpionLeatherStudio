import { useEffect, useState } from 'react'

export type BuildSaveState = 'saving' | 'saved' | 'unavailable'

export function useBuildLocalSave(key: string, value: unknown, delayMs = 180): BuildSaveState {
  const [state, setState] = useState<BuildSaveState>('saving')

  useEffect(() => {
    setState('saving')
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
        setState('saved')
      } catch {
        setState('unavailable')
      }
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [delayMs, key, value])

  return state
}
