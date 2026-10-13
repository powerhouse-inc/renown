import { useEffect, useState } from 'react'
import { orgHandleProblem } from '../../lib/orgs/handles'
import { orgHandleAvailability } from '../../services/orgs'

export type HandleState = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'reserved' | 'unknown'

/** Whether `handle` (normalised) is free, asked 400 ms after the last change. */
export function useOrgHandleAvailability(handle: string): HandleState {
  const [answer, setAnswer] = useState<{ handle: string; state: HandleState } | null>(null)
  const checkable = handle !== '' && orgHandleProblem(handle) === null

  useEffect(() => {
    if (!checkable) return
    let cancelled = false
    const timer = setTimeout(() => {
      orgHandleAvailability(handle).then(
        (result) => {
          if (cancelled) return
          const state: HandleState = result.available
            ? 'available'
            : result.reason === 'RESERVED'
              ? 'reserved'
              : result.reason === 'INVALID'
                ? 'invalid'
                : 'taken'
          setAnswer({ handle, state })
        },
        () => {
          if (!cancelled) setAnswer({ handle, state: 'unknown' })
        },
      )
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [handle, checkable])

  if (!handle) return 'idle'
  if (!checkable) return 'invalid'
  return answer?.handle === handle ? answer.state : 'checking'
}
