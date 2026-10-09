// Renown's public media URLs. Pages and other apps embed
// `<renown origin>/media/<documentId>/<field>`; renown.id answers it from the
// switchboard's media route (renown-package media/media-route.ts), which
// 302s to a short-lived signed URL or 404s when the field is unset.

const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT || 'http://localhost:4001/graphql'

/** Package routes live under the switchboard's /api/<package name>. */
const PACKAGE_PATH = '/api/@powerhousedao/renown-package'

/** Image fields served publicly. App-profile `logo`/`cover` join in phase 2. */
export const MEDIA_FIELDS = ['avatar'] as const
export type MediaField = (typeof MEDIA_FIELDS)[number]

export function isMediaField(value: string): value is MediaField {
  return (MEDIA_FIELDS as readonly string[]).includes(value)
}

/** Origin of the switchboard, from the GraphQL endpoint (`…/graphql`). */
export function switchboardOrigin(endpoint = SWITCHBOARD_ENDPOINT): string {
  return endpoint.replace(/\/+$/, '').replace(/\/graphql$/, '')
}

/** Base URL of renown-package's HTTP routes on the switchboard. */
export function packageRoutesBase(endpoint = SWITCHBOARD_ENDPOINT): string {
  return `${switchboardOrigin(endpoint)}${PACKAGE_PATH}`
}

/** Stable, embeddable URL of a document's image (same origin, or absolute with `origin`). */
export function mediaUrl(documentId: string, field: MediaField, origin = ''): string {
  return `${origin}/media/${encodeURIComponent(documentId)}/${field}`
}
