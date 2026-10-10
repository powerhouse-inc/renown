// GET /media/<documentId>/<field> (rewritten here by next.config.ts).
//
// Unversioned: asks the switchboard's media route and passes its answer on — a
// 302 to a short-lived signed URL, or (on a switchboard storing files on disk)
// the bytes. The redirect is cacheable for a minute; a missing image is a
// cacheable 404 so <img> falls back quickly.
//
// Versioned (`?v=<hex>`, the attachment-hash prefix pages append, see
// services/media.ts mediaUrl): fetches the bytes server-side and answers them
// same-origin, so the browser's LCP image needs no second host, TLS handshake
// or redirect round trip. See serveVersioned for the guards.
import { createHash } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchAllowedMedia, MediaHostNotAllowedError, MediaTooLargeError, readCapped, sniffImageType } from '../../../../lib/media-fetch'
import { isMediaField, packageRoutesBase } from '../../../../services/media'

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=240'
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const DOCUMENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/
/** mediaUrl appends the first 12 hex digits of the sha256; longer prefixes are accepted too. */
const VERSION_RE = /^[0-9a-f]{12,64}$/
/** Uploads are capped at 2 MB by renown-package; anything past this is refused. */
const MAX_MEDIA_BYTES = 5 * 1024 * 1024
const PROXY_TIMEOUT_MS = 5000

// Bytes are capped at MAX_MEDIA_BYTES above; Next's 4 MB response warning does not apply.
export const config = { api: { responseLimit: false } }

function notFound(res: NextApiResponse): void {
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.status(404).json({ error: 'Not found' })
}

function unavailable(res: NextApiResponse, status = 502): void {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status === 503 ? 503 : 502).json({ error: 'Media unavailable' })
}

/**
 * Serves a versioned image's bytes same-origin.
 *
 * - Redirects are followed by hand (lib/media-fetch.ts): at most two hops,
 *   only to the switchboard or an https storage host in OG_MEDIA_HOSTS.
 * - At most MAX_MEDIA_BYTES, read as a capped stream, within PROXY_TIMEOUT_MS.
 * - The bytes must carry a PNG/JPEG/WebP/GIF signature; the Content-Type is
 *   the sniffed one, never the upstream header. Served with nosniff and a
 *   sandboxing CSP, so even a mislabelled file cannot run as a document.
 * - `immutable` only when sha256(bytes) starts with `v`. Storage is
 *   content-addressed (the object key and the attachment ref are the sha256
 *   of the bytes, and the upload pins that checksum), so a match proves these
 *   are the bytes the URL names. A mismatch (a page rendered before the image
 *   was replaced) still gets the current image, with the short cache only.
 * - Failures are never immutable: missing is the usual cacheable 404,
 *   anything else (disallowed host, too large, not an image, timeout,
 *   upstream 5xx) a no-store 502/503.
 */
async function serveVersioned(res: NextApiResponse, upstreamUrl: string, version: string): Promise<void> {
  let response: Response
  try {
    ;({ response } = await fetchAllowedMedia(upstreamUrl, { signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) }))
  } catch (error) {
    console.error('Media fetch failed:', error instanceof MediaHostNotAllowedError ? error.message : error)
    return unavailable(res)
  }
  if (response.status === 404 || response.status === 410) {
    await response.body?.cancel().catch(() => undefined)
    return notFound(res)
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    return unavailable(res, response.status)
  }
  let bytes: Uint8Array
  try {
    bytes = await readCapped(response, MAX_MEDIA_BYTES)
  } catch (error) {
    console.error('Media read failed:', error instanceof MediaTooLargeError ? error.message : error)
    return unavailable(res)
  }
  const type = sniffImageType(bytes)
  if (!type) {
    console.error('Media is not a PNG/JPEG/WebP/GIF image; refusing to serve it')
    return unavailable(res)
  }
  const hash = createHash('sha256').update(bytes).digest('hex')
  res.setHeader('Cache-Control', hash.startsWith(version) ? IMMUTABLE_CACHE_CONTROL : CACHE_CONTROL)
  res.setHeader('Content-Type', type)
  res.setHeader('Content-Length', String(bytes.byteLength))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
  res.status(200).send(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const documentId = String(req.query.documentId ?? '')
  const field = String(req.query.field ?? '')
  if (!DOCUMENT_ID_RE.test(documentId) || !isMediaField(field)) return notFound(res)
  const upstreamUrl = `${packageRoutesBase()}/media/${encodeURIComponent(documentId)}/${field}`
  // The version is checked against the bytes, never forwarded: the upstream route ignores queries.
  const version = typeof req.query.v === 'string' && VERSION_RE.test(req.query.v) ? req.query.v : null
  if (version) return serveVersioned(res, upstreamUrl, version)

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, { redirect: 'manual' })
  } catch (error) {
    console.error('Media lookup failed:', error)
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).json({ error: 'Media unavailable' })
    return
  }

  const location = upstream.headers.get('location')
  if (upstream.status === 302 && location) {
    res.setHeader('Cache-Control', CACHE_CONTROL)
    res.redirect(302, location)
    return
  }
  if (upstream.status === 200) {
    res.setHeader('Cache-Control', CACHE_CONTROL)
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.status(200).send(Buffer.from(await upstream.arrayBuffer()))
    return
  }
  if (upstream.status >= 500) return unavailable(res, upstream.status)
  notFound(res)
}
