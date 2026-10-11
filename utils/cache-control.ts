/**
 * Cache-Control for a public listing page (/, /apps): cached at the edge only
 * when every read it shows succeeded, so an outage is never served to the next
 * visitor. (The dev server overrides this header; see it on `next start`.)
 */
export function listingCacheControl(complete: boolean): string {
  return complete ? 'public, s-maxage=60, stale-while-revalidate=300' : 'no-store'
}

/**
 * Cache-Control for /people. Search results name people who may turn their
 * listing off at any moment, so a result page is never stored; the bare page
 * lists nobody and is cached like the other listings.
 */
export function peopleCacheControl(query: string, complete: boolean): string {
  return query ? 'no-store' : listingCacheControl(complete)
}
