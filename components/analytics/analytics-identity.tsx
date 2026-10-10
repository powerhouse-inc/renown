'use client'

import { useRenownAuth } from '@powerhousedao/reactor-browser/renown'
import { useEffect, useRef } from 'react'
import {
  clearProfileHint,
  useOpenPanelAnalytics,
  writeProfileHint,
} from '../../services/analytics'

/**
 * Drives OpenPanel user identity from the Renown session.
 *
 * The Renown session (`<Renown>` in _app) is restored on every page without
 * the wallet stack, so returning users are identified on marketing pages too.
 * Identifies on login (address `undefined → defined`) and clears on logout
 * (`defined → undefined`). A `prevAddressRef` guards against re-firing on
 * unrelated re-renders — identify/clear run only on an actual transition.
 * While the session is still being restored nothing happens, so a returning
 * user is never cleared and re-identified on load.
 *
 * The wallet address is the stable profile ID; chain context travels as
 * properties. No credentials/JWTs are ever forwarded.
 *
 * The transition also writes/clears the `op_profile` cookie that seeds the
 * next load's first pageview (see profile-hint.ts).
 */
export function AnalyticsIdentity() {
  const { status, user } = useRenownAuth()
  const { identify, clear } = useOpenPanelAnalytics()
  const prevAddressRef = useRef<string | null>(null)
  const settled = status === 'authorized' || status === 'not-authorized'
  const address = user?.address ?? null
  const did = user?.did
  const networkId = user?.networkId
  const chainId = user?.chainId

  useEffect(() => {
    if (!settled) return
    if (address === prevAddressRef.current) return
    prevAddressRef.current = address

    if (address) {
      identify({
        profileId: address,
        properties: { address, did, networkId, chainId, caip2: `${networkId}:${chainId}` },
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
  }, [settled, address, did, networkId, chainId, identify, clear])

  return null
}
