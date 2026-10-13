import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { takeArrival, useOpenPanelAnalytics } from '../../services/analytics'

const OPENPANEL_WAIT_MS = 15_000

/** Calls `run` once OpenPanel's window.op exists (it is set up after hydration); gives up quietly when analytics is off. */
function whenOpenPanelReady(run: () => void): () => void {
  const started = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const attempt = () => {
    if (typeof (window as { op?: unknown }).op === 'function') return run()
    if (Date.now() - started < OPENPANEL_WAIT_MS) timer = setTimeout(attempt, 100)
  }
  attempt()
  return () => clearTimeout(timer)
}

/**
 * Records a one-shot arrival flag (services/analytics/arrival.ts) on the page
 * it lands on, then takes it out of the address bar, so a reload or a shared
 * link does not record it again.
 */
export function ArrivalEvent() {
  const router = useRouter()
  const { track } = useOpenPanelAnalytics()
  const { isReady, asPath } = router

  useEffect(() => {
    if (!isReady) return
    const arrival = takeArrival(asPath)
    if (!arrival) return
    void router.replace(arrival.rest, undefined, { shallow: true, scroll: false })
    const { event } = arrival
    if (!event) return
    return whenOpenPanelReady(() => track(event))
  }, [isReady, asPath, router, track])

  return null
}
