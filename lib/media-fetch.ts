// Server-side fetching of Renown media (/media/<doc>/<field>): the switchboard's
// media route answers with a 302 to a short-lived signed URL on the attachment
// storage host. Shared by the link-preview route (lib/og/og-data.ts) and the
// same-origin media route (pages/api/media/[documentId]/[field].ts). Redirects
// are followed by hand, only to allowed hosts, so neither route can be pointed
// at an arbitrary URL.
import { switchboardOrigin } from '../services/media'

/** Redirects followed after the first request (switchboard → storage is one). */
export const MAX_MEDIA_HOPS = 2

/**
 * Hosts a media fetch may be redirected to, besides the switchboard: the
 * attachment storage behind the /media route's signed redirect.
 * Comma-separated hosts in OG_MEDIA_HOSTS (`host` for the default port 443, or
 * `host:port`); the default is the production bucket host
 * (nbg1.your-objectstorage.com, seen by curling a real /media URL). Storage
 * hosts must be https.
 */
export function storageHosts(): string[] {
  return (process.env.OG_MEDIA_HOSTS || 'nbg1.your-objectstorage.com')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
}

/** The switchboard, any of `origins`, or an allowed https storage host. */
export function isAllowedMediaTarget(target: URL, origins: string[] = []): boolean {
  if ([switchboardOrigin(), ...origins].some((origin) => target.origin === new URL(origin).origin)) return true
  // URL.host carries the port only when it is not the scheme default, so a bare entry means port 443 only.
  return target.protocol === 'https:' && storageHosts().includes(target.host.toLowerCase())
}

export class MediaHostNotAllowedError extends Error {}
export class MediaTooLargeError extends Error {}

/**
 * Fetches `url`, following at most `maxHops` (default MAX_MEDIA_HOPS)
 * redirects, each only to an allowed target (throws MediaHostNotAllowedError
 * otherwise, the request URL included). Returns the first non-redirect response.
 */
export async function fetchAllowedMedia(
  url: string | URL,
  { signal, origins = [], maxHops = MAX_MEDIA_HOPS }: { signal: AbortSignal; origins?: string[]; maxHops?: number },
): Promise<{ response: Response }> {
  let target = new URL(url)
  for (let hop = 0; ; hop++) {
    if (!isAllowedMediaTarget(target, origins)) throw new MediaHostNotAllowedError(`Media host not allowed: ${target.host}`)
    const response = await fetch(target, { signal, redirect: 'manual' })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => undefined)
      if (hop >= maxHops) throw new Error('Too many media redirects')
      target = new URL(location, target)
      continue
    }
    return { response }
  }
}

/** Reads a body with a hard byte cap, cancelling the stream past it (MediaTooLargeError). */
export async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new MediaTooLargeError('Image too large')
  }
  if (!response.body) throw new Error('Empty image body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new MediaTooLargeError('Image too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Reads at most `limit` bytes from the start of a body, then cancels the rest (for sniffing without downloading). */
export async function readHead(response: Response, limit = 16): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(0)
  const reader = response.body.getReader()
  const out = new Uint8Array(limit)
  let filled = 0
  try {
    while (filled < limit) {
      const { done, value } = await reader.read()
      if (done) break
      const take = value.subarray(0, limit - filled)
      out.set(take, filled)
      filled += take.length
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return out.subarray(0, filled)
}

/** Raster types the /media route serves, proven by their leading bytes. */
export type SniffedImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** The image type the leading bytes prove (PNG, JPEG, WebP or GIF signature), or null. */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  const at = (offset: number, signature: number[]) => signature.every((b, i) => bytes[offset + i] === b)
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp'
  if (at(0, [0x47, 0x49, 0x46, 0x38]) && (at(4, [0x37, 0x61]) || at(4, [0x39, 0x61]))) return 'image/gif'
  return null
}
