// Renown's public media URLs. Pages and other apps embed
// `<renown origin>/media/<documentId>/<field>`; renown.id answers it from the
// switchboard's media route (renown-package media/media-route.ts), which
// 302s to a short-lived signed URL or 404s when the field is unset.

import { SWITCHBOARD_ENDPOINT } from './switchboard-endpoint'

/** Package routes live under the switchboard's /api/<package name>. */
const PACKAGE_PATH = '/api/@powerhousedao/renown-package'

/** Image fields served publicly: profile avatars, app-profile logos and covers. */
export const MEDIA_FIELDS = ['avatar', 'logo', 'cover'] as const
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

/** First 12 hex digits of an `attachment://v1:<sha256>` ref: a cache-busting key that changes with the image. */
export function mediaVersion(ref: string | null | undefined): string | null {
  return /^attachment:\/\/v1:([0-9a-f]{64})$/.exec(ref ?? '')?.[1].slice(0, 12) ?? null
}

/**
 * Stable, embeddable URL of a document's image (same origin, or absolute with
 * `origin`). Pass the attachment `ref` to append `?v=<12 hex>`, so a replaced
 * image is fetched afresh instead of from a cached redirect; embeds that can't
 * know the ref use the bare form.
 */
export function mediaUrl(documentId: string, field: MediaField, origin = '', ref?: string | null): string {
  const version = mediaVersion(ref)
  return `${origin}/media/${encodeURIComponent(documentId)}/${field}${version ? `?v=${version}` : ''}`
}

/** The URL an app's cover <img> loads (same as AppCover/AppHeroCover), or null without a cover: for a preload hint. */
export function coverImageUrl(app: { documentId: string; coverRef?: string | null } | null | undefined): string | null {
  return app?.coverRef ? mediaUrl(app.documentId, 'cover', '', app.coverRef) : null
}
