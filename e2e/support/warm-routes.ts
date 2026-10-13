// Playwright globalSetup: compiles every page route of the dev server once,
// before the first test. `next dev` compiles a route on its first request
// (webpack, seconds to tens of seconds under load); a test whose first
// navigation lands on a cold route races that compile (net::ERR_ABORTED, a
// heading that appears only after the test timeout). Failures here are
// ignored: a route that cannot be fetched fails its own tests, with a clear error.
const BASE = 'http://localhost:3000'
const ROUTES = [
  '/',
  '/apps',
  '/people',
  '/orgs',
  '/trust',
  '/developers',
  '/ecosystem',
  '/verify',
  '/me',
  '/notifications',
  '/console',
  '/profile/edit',
  '/profile/warm-up',
  '/app/did:key:z6MkWarmUpAppxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1',
  '/org/new',
  '/org/warm-up',
  '/org/warm-up/manage',
  '/org/warm-up/manage/members',
  '/invite/warm-up',
  '/admin/reports',
  '/oidc/login',
]

export default async function warmRoutes(): Promise<void> {
  for (const route of ROUTES) {
    try {
      await fetch(`${BASE}${route}`, { signal: AbortSignal.timeout(110_000) })
    } catch {
      // see above
    }
  }
}
