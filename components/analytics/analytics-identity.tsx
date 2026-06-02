'use client'

import { useEffect, useRef } from 'react'
import { useSession } from '../../hooks/use-wallet-adapter'
import {
  clearProfileHint,
  useOpenPanelAnalytics,
  writeProfileHint,
} from '../../services/analytics'

/**
 * Drives OpenPanel user identity from the active wallet session.
 *
 * Identifies on login (address `undefined → defined`) and clears on logout
 * (`defined → undefined`). A `prevAddressRef` guards against re-firing on
 * unrelated re-renders — identify/clear run only on an actual transition.
 *
 * The wallet address is the stable profile ID; chain context travels as
 * properties. No credentials/JWTs are ever forwarded.
 *
 * The transition also writes/clears the `op_profile` cookie that seeds the
 * next load's first pageview (see profile-hint.ts).
 */
export function AnalyticsIdentity() {
  const session = useSession()
  const { identify, clear } = useOpenPanelAnalytics()
  const prevAddressRef = useRef<string | null>(null)

  useEffect(() => {
    const address = session?.address ?? null
    if (address === prevAddressRef.current) return
    prevAddressRef.current = address

    if (address && session) {
      identify({
        profileId: address,
        properties: {
          address,
          chainId: session.chainId,
          caip2: session.caip2,
          accountType: session.accountType,
        },
      })
      try {
        writeProfileHint(address)
      } catch (e) {
        console.warn('[analytics] failed to write profile hint', e)
      }
    } else {
      clear()
      try {
        clearProfileHint()
      } catch (e) {
        console.warn('[analytics] failed to clear profile hint', e)
      }
    }
  }, [session, identify, clear])

  return null
}
