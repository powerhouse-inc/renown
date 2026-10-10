// Data for the link-preview route (pages/api/og.tsx, Node runtime). A failed
// lookup or fetch throws, and the route answers with the default card; an image
// that cannot be decoded draws the card with its monogram instead.
import { APP_DID_RE } from '../../services/app-profiles'
import { mediaUrl, switchboardOrigin } from '../../services/media'
import { fetchAllowedMedia, readCapped } from '../media-fetch'
import { SWITCHBOARD_ENDPOINT } from '../../services/switchboard-endpoint'
import { CARD_BOX, identityArtDataUrl } from './og-art'
import { AVATAR_BOX, LOGO_BOX, toPngDataUrl, type ImageBox } from './og-image'
import { profileCardText } from './og-profile-text'

export const OG_FETCH_TIMEOUT_MS = 2500
const ADDRESS_RE = /^0x[0-9a-f]{40}$/
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
// Every image is converted to PNG before drawing (lib/og/og-image.ts).
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'])

/** What a card is drawn on: the app's cover, the seed's identity art, or the plain frame. */
export interface OgBackground {
  kind: 'cover' | 'art'
  /** PNG data URL at card size. */
  src: string
}

export type OgCard =
  | { variant: 'default' }
  | {
      variant: 'profile'
      name: string
      handle: string | null
      /** "@handle" under the name, or null when the name already is the handle. */
      handleLine: string | null
      /** "0x…… on Renown", or null when the name already is the short address. */
      addressLine: string | null
      address: string
      image: string | null
      background: OgBackground | null
    }
  | { variant: 'app'; name: string; tagline: string | null; category: string | null; logo: string | null; background: OgBackground | null; degraded?: boolean }

async function artBackground(seed: string): Promise<OgBackground | null> {
  const src = await identityArtDataUrl(seed)
  return src ? { kind: 'art', src } : null
}

/** The media route answered 404/410: there is no such image (a valid answer, not an outage). */
export class ImageNotFoundError extends Error {}

async function graphql<T>(endpoint: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(OG_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`GraphQL ${response.status}`)
  const body = (await response.json()) as { data?: T; errors?: unknown[] }
  if (!body.data || body.errors?.length) throw new Error('GraphQL error')
  return body.data
}

/**
 * Fetches a media image (PNG/JPEG/GIF/WebP/AVIF/SVG, at most 4 MB) as a PNG
 * data URL that fits `box`; null when the bytes cannot be decoded or the image
 * is too large to decode (the card draws its monogram); throws on anything else.
 * Redirects are followed by hand: at most two hops, each only to the site's
 * public `origin`, the switchboard or a storage host (lib/media-fetch.ts).
 */
export async function fetchImageDataUrl(url: string, origin: string, box: ImageBox): Promise<string | null> {
  const signal = AbortSignal.timeout(OG_FETCH_TIMEOUT_MS)
  const { response } = await fetchAllowedMedia(url, { signal, origins: [origin] })
  if (response.status === 404 || response.status === 410) throw new ImageNotFoundError(`Image not found (${response.status})`)
  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!response.ok || !IMAGE_TYPES.has(type)) throw new Error(`Unusable image (${response.status} ${type})`)
  const bytes = await readCapped(response, MAX_IMAGE_BYTES)
  try {
    return await toPngDataUrl(bytes, box)
  } catch (error) {
    // Corrupt bytes or a decompression bomb: a valid answer, not an outage.
    console.warn('og: image could not be converted, drawing the monogram:', error instanceof Error ? error.message : error)
    return null
  }
}

interface ProfileRow {
  documentId: string
  displayName: string | null
  username: string | null
  handle: string | null
  avatar: string | null
  userImage: string | null
}

/** The profile card for a wallet; null when there is no such profile. */
export async function loadProfileCard(address: string, origin: string): Promise<OgCard | null> {
  const lower = address.toLowerCase()
  if (!ADDRESS_RE.test(lower)) return null
  const data = await graphql<{ renownUsers: ProfileRow[] }>(
    SWITCHBOARD_ENDPOINT,
    `query OgProfile($input: RenownUsersInput!) { renownUsers(input: $input) { documentId displayName username handle avatar userImage } }`,
    { input: { driveId: `renown-${lower}`, ethAddresses: [lower] } },
  )
  const profile = data.renownUsers[0]
  if (!profile) return null
  // Only images stored with Renown (the /media route); external avatar URLs are never fetched.
  // Unversioned /media URLs: the 302 to storage, not the same-origin bytes route (which serves only
  // PNG/JPEG/WebP/GIF; the card converts more), and no cache key is needed server-side.
  const imageUrl = profile.avatar ? mediaUrl(profile.documentId, 'avatar', origin) : null
  const [image, background] = await Promise.all([
    imageUrl ? fetchImageDataUrl(imageUrl, origin, AVATAR_BOX) : Promise.resolve(null),
    artBackground(lower),
  ])
  return {
    variant: 'profile',
    // Named like the profile page: a legacy username that is just a short address never wins over the handle.
    ...profileCardText(profile, lower),
    handle: profile.handle,
    address: lower,
    image,
    background,
  }
}

interface AppRow {
  documentId: string
  name: string | null
  tagline: string | null
  category: string | null
  logo: string | null
  logoRef: string | null
  coverRef: string | null
}

/** The app card for an app DID; null when there is no such app. */
export async function loadAppCard(did: string, origin: string): Promise<OgCard | null> {
  if (!APP_DID_RE.test(did)) return null
  const data = await graphql<{ appProfile: AppRow | null }>(
    `${switchboardOrigin()}/graphql/renown-stats`,
    `query OgApp($appDid: String!) { appProfile(appDid: $appDid) { documentId name tagline category logo logoRef coverRef } }`,
    { appDid: did },
  )
  const app = data.appProfile
  if (!app) return null
  // Unversioned, like the profile avatar above.
  const logoUrl = app.logoRef ? mediaUrl(app.documentId, 'logo', origin) : null
  const coverUrl = app.coverRef ? mediaUrl(app.documentId, 'cover', origin) : null
  // A missing or undecodable cover is decoration (the identity art stands in, cached normally);
  // a cover that could not be fetched (timeout, 5xx, network, disallowed host) also falls back
  // to the art but marks the card degraded so it is not cached as a success.
  let degraded = false
  const [logo, cover, art] = await Promise.all([
    logoUrl ? fetchImageDataUrl(logoUrl, origin, LOGO_BOX) : Promise.resolve(null),
    coverUrl
      ? fetchImageDataUrl(coverUrl, origin, CARD_BOX).catch((error) => {
          if (!(error instanceof ImageNotFoundError)) {
            console.error('og: cover fetch failed, drawing the identity art:', error)
            degraded = true
          }
          return null
        })
      : Promise.resolve(null),
    artBackground(did),
  ])
  return {
    variant: 'app',
    name: app.name || 'Untitled app',
    tagline: app.tagline,
    category: app.category,
    logo,
    background: cover ? { kind: 'cover', src: cover } : art,
    ...(degraded ? { degraded } : {}),
  }
}
