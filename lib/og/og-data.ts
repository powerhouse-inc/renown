// Data for the link-preview route (pages/api/og.tsx, edge runtime): plain
// fetch only. Every failure throws; the route answers with the default card.
import { APP_DID_RE } from '../../services/app-profiles'
import { mediaUrl, switchboardOrigin } from '../../services/media'
import { SWITCHBOARD_ENDPOINT } from '../../services/switchboard-endpoint'

export const OG_FETCH_TIMEOUT_MS = 2500
const ADDRESS_RE = /^0x[0-9a-f]{40}$/
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif'])

export type OgCard =
  | { variant: 'default' }
  | { variant: 'profile'; name: string; handle: string | null; address: string; image: string | null }
  | { variant: 'app'; name: string; tagline: string | null; category: string | null; logo: string | null }

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

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Fetches an image as a data URL (PNG/JPEG/GIF, at most 4 MB); throws on anything else. */
export async function fetchImageDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(OG_FETCH_TIMEOUT_MS), redirect: 'follow' })
  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!response.ok || !IMAGE_TYPES.has(type)) throw new Error(`Unusable image (${response.status} ${type})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Image too large')
  return `data:${type};base64,${toBase64(bytes)}`
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
  const imageUrl = profile.avatar
    ? mediaUrl(profile.documentId, 'avatar', origin, profile.avatar)
    : profile.userImage && /^https:\/\//i.test(profile.userImage)
      ? profile.userImage
      : null
  return {
    variant: 'profile',
    name: profile.displayName || profile.username || `${lower.slice(0, 6)}…${lower.slice(-4)}`,
    handle: profile.handle,
    address: lower,
    image: imageUrl ? await fetchImageDataUrl(imageUrl) : null,
  }
}

interface AppRow {
  documentId: string
  name: string | null
  tagline: string | null
  category: string | null
  logo: string | null
  logoRef: string | null
}

/** The app card for an app DID; null when there is no such app. */
export async function loadAppCard(did: string, origin: string): Promise<OgCard | null> {
  if (!APP_DID_RE.test(did)) return null
  const data = await graphql<{ appProfile: AppRow | null }>(
    `${switchboardOrigin()}/graphql/renown-stats`,
    `query OgApp($appDid: String!) { appProfile(appDid: $appDid) { documentId name tagline category logo logoRef } }`,
    { appDid: did },
  )
  const app = data.appProfile
  if (!app) return null
  const logoUrl = app.logoRef
    ? mediaUrl(app.documentId, 'logo', origin, app.logoRef)
    : app.logo && /^https:\/\//i.test(app.logo)
      ? app.logo
      : null
  return {
    variant: 'app',
    name: app.name || 'Untitled app',
    tagline: app.tagline,
    category: app.category,
    logo: logoUrl ? await fetchImageDataUrl(logoUrl) : null,
  }
}
