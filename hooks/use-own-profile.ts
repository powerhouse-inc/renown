import { useEffect, useState } from 'react'
import { getProfile, type RenownProfile } from '../services/switchboard'

/**
 * The signed-in wallet's Renown profile (null while loading, when there is
 * none, or when the read failed). Re-reads when the address changes.
 */
export function useOwnProfile(address: string | undefined): RenownProfile | null {
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

  return state && state.address === address ? state.profile : null
}
