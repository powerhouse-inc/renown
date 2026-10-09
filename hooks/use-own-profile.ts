import { useEffect, useState } from 'react'
import { getProfile, type RenownProfile } from '../services/switchboard'

export interface OwnProfile {
  /** The profile; null while loading, when there is none, or when the read failed. */
  profile: RenownProfile | null
  /** True once the read for the current address has answered (profile may still be null). */
  loaded: boolean
}

/** The signed-in wallet's Renown profile. Re-reads when the address changes. */
export function useOwnProfile(address: string | undefined): OwnProfile {
  const [state, setState] = useState<{ address: string; profile: RenownProfile | null } | null>(null)

  useEffect(() => {
    if (!address) return
    let cancelled = false
    const lower = address.toLowerCase()
    void getProfile({ driveId: `renown-${lower}`, ethAddress: lower }).then((profile) => {
      if (!cancelled) setState({ address, profile })
    })
    return () => {
      cancelled = true
    }
  }, [address])

  const current = state && state.address === address ? state : null
  return { profile: current?.profile ?? null, loaded: current !== null }
}
