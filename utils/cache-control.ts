/**
 * Cache-Control for a public listing page (/, /apps): cached at the edge only
 * when every read it shows succeeded, so an outage is never served to the next
 * visitor. (The dev server overrides this header; see it on `next start`.)
 */
export function listingCacheControl(complete: boolean): string {
  return complete ? 'public, s-maxage=60, stale-while-revalidate=300' : 'no-store'
}
