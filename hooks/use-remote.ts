import { useCallback, useEffect, useState } from 'react'
import { toOrgApiError, type OrgApiError } from '../services/orgs'

export type Remote<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: OrgApiError }

interface Answer<T> {
  /** The key the answer belongs to. */
  base: string
  /** The key plus the reload attempt. */
  full: string
  state: Remote<T>
}

/**
 * One async read, keyed: a new key starts over, `reload` re-reads and keeps
 * showing the last value until the new one arrives, `set` replaces the value
 * (after a write returned it). State is only set in promise callbacks. `load`
 * must be stable (useCallback). A null key reads nothing (loading).
 */
export function useRemote<T>(key: string | null, load: () => Promise<T>): { state: Remote<T>; reload: () => void; set: (value: T) => void } {
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState<Answer<T> | null>(null)
  const full = key === null ? null : `${key}#${attempt}`

  useEffect(() => {
    if (key === null || full === null) return
    let cancelled = false
    load().then(
      (value) => {
        if (!cancelled) setAnswer({ base: key, full, state: { status: 'ready', value } })
      },
      (error: unknown) => {
        if (!cancelled) setAnswer({ base: key, full, state: { status: 'error', error: toOrgApiError(error) } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, full, load])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const set = useCallback(
    (value: T) => {
      if (key !== null && full !== null) setAnswer({ base: key, full, state: { status: 'ready', value } })
    },
    [key, full],
  )

  let state: Remote<T> = { status: 'loading' }
  if (answer && answer.full === full) state = answer.state
  else if (answer && answer.base === key && answer.state.status === 'ready') state = answer.state
  return { state, reload, set }
}
