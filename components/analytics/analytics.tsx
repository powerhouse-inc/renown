'use client'

import { OpenPanelComponent } from '@openpanel/nextjs'
import Router from 'next/router'
import { useSyncExternalStore } from 'react'
import { ANALYTICS_APP, readProfileHint } from '../../services/analytics'
import { AnalyticsIdentity } from './analytics-identity'

/** A /verify share link: its fragment carries what someone pasted and must never be recorded. */
function hasPrivateFragment(): boolean {
  return window.location.hash.startsWith('#v=')
}

// Re-read after each route or hash change: /verify drops its share fragment
// with router.replace, which Next treats as a hash change.
function subscribe(onChange: () => void): () => void {
  Router.events.on('routeChangeComplete', onChange)
  Router.events.on('hashChangeComplete', onChange)
  return () => {
    Router.events.off('routeChangeComplete', onChange)
    Router.events.off('hashChangeComplete', onChange)
  }
}

/** The cookies, or null while the URL holds a private fragment (OpenPanel records the full URL). */
function clientSnapshot(): string | null {
  return hasPrivateFragment() ? null : document.cookie
}

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
  // Also null while a /verify share fragment is in the URL: mounting waits until it is gone.
  const cookies = useSyncExternalStore(subscribe, clientSnapshot, () => null)

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
