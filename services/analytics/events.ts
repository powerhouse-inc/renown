/**
 * Central registry of analytics event names — the single source of truth for
 * Renown's OpenPanel taxonomy. Call sites reference {@link ANALYTICS_EVENTS}
 * (never raw strings) so names stay consistent and discoverable.
 *
 * Every event also carries the {@link ANALYTICS_APP} global property, set once
 * on the OpenPanel mount, so Renown's events are distinguishable from sibling
 * Powerhouse products in the shared dashboard.
 *
 * Naming convention (shared with Vetra): lowercase, fully dot-namespaced
 * `<area>.<action>` — no underscores, no app prefix (the `app` global property
 * segments the app).
 */
export const ANALYTICS_APP = 'renown'

export const ANALYTICS_EVENTS = {
  loginMethodSelected: 'login.method.selected',
  loginCancelled: 'login.cancelled',
  loginFailed: 'login.failed',
  authorizationConfirm: 'authorization.confirm.clicked',
  credentialRevoked: 'credential.revoked',
  credentialVerified: 'credential.verified',
  consoleCompleted: 'console.authorization.completed',
  consoleFailed: 'console.authorization.failed',
  returnToApp: 'app.return.clicked',
  signOut: 'auth.sign.out',
} as const

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]
