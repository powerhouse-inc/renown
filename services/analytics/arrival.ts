// One-shot arrival flags: an event that happened on a page where analytics
// never runs (an invite link holds a secret, so OpenPanel is not mounted
// there) is recorded by the page the visitor lands on next. The flag rides in
// the destination's query string and is removed as soon as it is read. Pure.
import { ANALYTICS_EVENTS, type AnalyticsEvent } from './events'

const ARRIVALS = {
  joined: { invite: ANALYTICS_EVENTS.orgInviteAccepted },
} as const satisfies Record<string, Record<string, AnalyticsEvent>>

/** The query parameters that carry arrival flags. */
export const ARRIVAL_PARAMS: readonly string[] = Object.keys(ARRIVALS)

type ArrivalFlag = { [K in keyof typeof ARRIVALS]: [K, keyof (typeof ARRIVALS)[K]] }[keyof typeof ARRIVALS]

/** `href` with a one-shot arrival flag, e.g. withArrival('/org/acme/manage/members', 'joined', 'invite'). */
export function withArrival(href: string, ...[name, value]: ArrivalFlag): string {
  return `${href}${href.includes('?') ? '&' : '?'}${name}=${encodeURIComponent(String(value))}`
}

/**
 * The arrival event a URL (a router asPath) carries, and the URL without its
 * flags; null when it carries none. Unknown values are removed and not recorded.
 */
export function takeArrival(asPath: string): { event: AnalyticsEvent | null; rest: string } | null {
  const url = new URL(asPath, 'http://localhost')
  let found = false
  let event: AnalyticsEvent | null = null
  for (const [name, values] of Object.entries(ARRIVALS) as [string, Record<string, AnalyticsEvent>][]) {
    const value = url.searchParams.get(name)
    if (value === null) continue
    found = true
    event ??= Object.hasOwn(values, value) ? values[value] : null
    url.searchParams.delete(name)
  }
  return found ? { event, rest: `${url.pathname}${url.search}${url.hash}` } : null
}
