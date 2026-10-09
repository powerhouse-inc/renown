'use client'

import { OpenPanelComponent } from '@openpanel/nextjs'
import { useSyncExternalStore } from 'react'
import { ANALYTICS_APP, readProfileHint } from '../../services/analytics'
import { AnalyticsIdentity } from './analytics-identity'

// The cookie is read once per render; nothing needs to re-render when it changes.
const noSubscribe = () => () => {}

/**
 * Mounts OpenPanel analytics for Renown.
 *
 * Env-gated: with `NEXT_PUBLIC_OPENPANEL_CLIENT_ID` unset this renders nothing
 * and the SDK script is never loaded — a complete no-op. When configured it
 * enables automatic pageview + outgoing-link tracking, stamps every event with
 * the `app: renown` global property, and wires up user identification.
 *
 * The wallet from the `op_profile` cookie seeds OpenPanel so a returning user's
 * first pageview is attributed instead of anonymous. It is read in the browser
 * after mount, never on the server: server-rendered HTML is cached publicly and
 * must not carry one visitor's address to another. OpenPanel's init script runs
 * after hydration anyway, so mounting it then loses nothing.
 */
export function Analytics() {
  const clientId = process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID
  // null on the server and during hydration; the browser's cookies afterwards.
  const cookies = useSyncExternalStore(noSubscribe, () => document.cookie, () => null)

  if (!clientId || cookies === null) return null
  const profileId = readProfileHint(cookies)

  return (
    <>
      <OpenPanelComponent
        clientId={clientId}
        apiUrl={process.env.NEXT_PUBLIC_OPENPANEL_API_URL || undefined}
        {...(profileId ? { profileId } : {})}
        trackScreenViews
        trackOutgoingLinks
        globalProperties={{ app: ANALYTICS_APP }}
      />
      <AnalyticsIdentity />
    </>
  )
}

export default Analytics
