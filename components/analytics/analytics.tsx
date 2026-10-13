'use client'

import { OpenPanelComponent } from '@openpanel/nextjs'
import Router from 'next/router'
import { useSyncExternalStore } from 'react'
import { ANALYTICS_APP, readProfileHint } from '../../services/analytics'
import { AnalyticsIdentity } from './analytics-identity'
import { ArrivalEvent } from './arrival-event'
import { SCRUB_SHARE_FRAGMENTS } from './scrub-share-fragments'

// Playwright runs the dev server with NEXT_PUBLIC_E2E_AUTH=1: a test can then
// turn OpenPanel on by setting window.__renownE2eOpenPanel to a client id
// (e2e/verify-page.spec.ts checks no share fragment is recorded). Inert in
// every other build.
const E2E_AUTH = process.env.NEXT_PUBLIC_E2E_AUTH === '1'

/** The OpenPanel client id; read in the browser only. */
function openPanelClientId(): string | undefined {
  const configured = process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID
  if (configured) return configured
  return E2E_AUTH ? (window as { __renownE2eOpenPanel?: string }).__renownE2eOpenPanel : undefined
}

/**
 * A URL that carries a secret and must never be recorded: a /verify share
 * link (its fragment holds what someone pasted) or an invite link (its path
 * holds the token).
 */
function hasPrivateFragment(): boolean {
  return window.location.hash.startsWith('#v=') || window.location.pathname.startsWith('/invite/')
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

/** The cookies, or null while the URL holds a secret (OpenPanel records the full URL). */
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
  // null on the server and during hydration; the browser's cookies afterwards.
  // Also null while the URL holds a secret (a /verify share fragment, an invite token): mounting waits until it is gone.
  const cookies = useSyncExternalStore(subscribe, clientSnapshot, () => null)

  return (
    <>
      <ArrivalEvent />
      {cookies !== null && <OpenPanel cookies={cookies} />}
    </>
  )
}

function OpenPanel({ cookies }: { cookies: string }) {
  const clientId = openPanelClientId()
  if (!clientId) return null
  const profileId = readProfileHint(cookies)

  return (
    <>
      <OpenPanelComponent
        clientId={clientId}
        apiUrl={process.env.NEXT_PUBLIC_OPENPANEL_API_URL || undefined}
        {...(profileId ? { profileId } : {})}
        trackScreenViews
        trackOutgoingLinks
        filter={SCRUB_SHARE_FRAGMENTS}
        globalProperties={{ app: ANALYTICS_APP }}
      />
      <AnalyticsIdentity />
    </>
  )
}

export default Analytics
