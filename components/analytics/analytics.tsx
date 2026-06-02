'use client'

import { OpenPanelComponent } from '@openpanel/nextjs'
import { ANALYTICS_APP } from '../../services/analytics'
import { AnalyticsIdentity } from './analytics-identity'

/**
 * Mounts OpenPanel analytics for Renown.
 *
 * Env-gated: with `NEXT_PUBLIC_OPENPANEL_CLIENT_ID` unset this renders nothing
 * and the SDK script is never loaded — a complete no-op. When configured it
 * enables automatic pageview + outgoing-link tracking, stamps every event with
 * the `app: renown` global property, and wires up user identification.
 *
 * `initialProfileId` is the wallet from the `op_profile` cookie (read in
 * `_app.getInitialProps`); it seeds OpenPanel so a returning user's first
 * pageview is attributed instead of anonymous.
 */
export function Analytics({
  initialProfileId,
}: {
  initialProfileId?: string
}) {
  const clientId = process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID
  if (!clientId) return null

  return (
    <>
      <OpenPanelComponent
        clientId={clientId}
        apiUrl={process.env.NEXT_PUBLIC_OPENPANEL_API_URL || undefined}
        {...(initialProfileId ? { profileId: initialProfileId } : {})}
        trackScreenViews
        trackOutgoingLinks
        globalProperties={{ app: ANALYTICS_APP }}
      />
      <AnalyticsIdentity />
    </>
  )
}

export default Analytics
