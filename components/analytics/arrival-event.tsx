import { useRouter } from 'next/router'
import { useEffect, useRef } from 'react'
import { ARRIVAL_PARAMS, takeArrival, useOpenPanelAnalytics, type AnalyticsEvent } from '../../services/analytics'

const OPENPANEL_WAIT_MS = 10_000
const RETRY_MS = 100

// Playwright runs the dev server with NEXT_PUBLIC_E2E_AUTH=1: a test can then
// hold OpenPanel back (window.__renownE2eHoldAnalytics) to prove an arrival
// event survives a slow tracker. Inert in every other build.
const E2E_AUTH = process.env.NEXT_PUBLIC_E2E_AUTH === '1'

function openPanelReady(): boolean {
  if (E2E_AUTH && (window as { __renownE2eHoldAnalytics?: boolean }).__renownE2eHoldAnalytics) return false
  return typeof (window as { op?: unknown }).op === 'function'
}

/**
 * Records a one-shot arrival flag (services/analytics/arrival.ts) on the page
 * it lands on, then takes it out of the address bar, so a reload or a shared
 * link does not record it again. The flag is captured before the address bar
 * changes, and the event waits (up to 10 s) for OpenPanel independently of
 * later route changes.
 */
export function ArrivalEvent() {
  const router = useRouter()
  const { track } = useOpenPanelAnalytics()
  const { isReady, asPath } = router
  const trackRef = useRef(track)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    trackRef.current = track
  }, [track])

  // Only on unmount: a route change must not cancel a pending event.
  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (!isReady) return
    const arrival = takeArrival(asPath)
    if (!arrival) return
    const event: AnalyticsEvent | null = arrival.event
    if (event) {
      const started = Date.now()
      clearTimeout(timer.current)
      const attempt = () => {
        if (openPanelReady()) return trackRef.current(event)
        if (Date.now() - started < OPENPANEL_WAIT_MS) timer.current = setTimeout(attempt, RETRY_MS)
      }
      attempt()
    }
    // Same page (router.pathname, which is /404 for an unknown path), new address: a
    // shallow replace that never falls back to a full reload.
    const query = Object.fromEntries(Object.entries(router.query).filter(([key]) => !ARRIVAL_PARAMS.includes(key)))
    void router.replace({ pathname: router.pathname, query }, arrival.rest, { shallow: true, scroll: false })
  }, [isReady, asPath, router])

  return null
}
