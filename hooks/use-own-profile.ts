import { useEffect, useState } from 'react'
import { getProfile, type RenownProfile } from '../services/switchboard'
import { CLIENT_DATA_TIMEOUT_MS, TimeoutError, withTimeout } from '../utils/with-timeout'

export interface OwnProfile {
  /** The profile; null while loading, when there is none, or when the read failed or timed out. */
  profile: RenownProfile | null
  /** True once the read for the current address has answered or timed out (profile may still be null). */
  loaded: boolean
  /** True when the read did not answer within CLIENT_DATA_TIMEOUT_MS: the page says the profile is missing. */
  timedOut: boolean
}

interface Answer {
  address: string
  profile: RenownProfile | null
  timedOut: boolean
}

/** The signed-in wallet's Renown profile. Re-reads when the address changes. */
export function useOwnProfile(address: string | undefined): OwnProfile {
  const [answer, setAnswer] = useState<Answer | null>(null)

  useEffect(() => {
    if (!address) return
    let cancelled = false
    const lower = address.toLowerCase()
    // getProfile never rejects (a failed read is null); only the timeout does.
    withTimeout(getProfile({ driveId: `renown-${lower}`, ethAddress: lower }), CLIENT_DATA_TIMEOUT_MS)
      .then((profile) => {
        if (!cancelled) setAnswer({ address, profile, timedOut: false })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // No address or profile data in the log.
        if (error instanceof TimeoutError) {
          console.warn(`Renown profile read timed out after ${CLIENT_DATA_TIMEOUT_MS} ms`)
          setAnswer({ address, profile: null, timedOut: true })
        } else {
          console.warn('Renown profile read failed unexpectedly', error instanceof Error ? error.name : typeof error)
          setAnswer({ address, profile: null, timedOut: false })
        }
      })
    return () => {
      cancelled = true
    }
  }, [address])

  const current = answer && answer.address === address ? answer : null
  return { profile: current?.profile ?? null, loaded: current !== null, timedOut: current?.timedOut ?? false }
}
