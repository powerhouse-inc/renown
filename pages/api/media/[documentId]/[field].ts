// GET /media/<documentId>/<field> (rewritten here by next.config.ts).
//
// Unversioned: asks the switchboard's media route and passes its answer on — a
// 302 to a short-lived signed URL, or (on a switchboard storing files on disk)
// the bytes, served only when their signature proves an image. The redirect is
// cacheable for a minute; a missing image is a cacheable 404 so <img> falls
// back quickly.
//
// Versioned (`?v=<hex>`, the attachment-hash prefix pages append, see
// services/media.ts mediaUrl): when `v` names the stored image, the bytes are
// answered same-origin and immutable, so the browser's LCP image needs no
// second host, TLS handshake or redirect round trip. See handleVersioned.
import { createHash } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { cachedImage, cacheImage, proxiedFetch, type ProxyOutcome, type VerifiedImage } from '../../../../lib/media-cache'
import { fetchAllowedMedia, MediaHostNotAllowedError, MediaTooLargeError, readCapped, readHead, sniffImageType } from '../../../../lib/media-fetch'
import { isMediaField, mediaUrl, packageRoutesBase, type MediaField } from '../../../../services/media'

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=240'
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const DOCUMENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/
/** mediaUrl appends the first 12 hex digits of the sha256; longer prefixes are accepted too. */
const VERSION_RE = /^[0-9a-f]{12,64}$/
/** Storage object keys end in the sha256 of the bytes (`<prefix>/<aa>/<bb>/<sha256>`). */
const KEY_HASH_RE = /\/([0-9a-f]{64})$/
/** Uploads are capped at 2 MB by renown-package; anything past this is refused. */
const MAX_MEDIA_BYTES = 5 * 1024 * 1024
const FETCH_TIMEOUT_MS = 5000

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

function redirect(res: NextApiResponse, location: string): void {
  res.setHeader('Cache-Control', CACHE_CONTROL)
  res.redirect(302, location)
}

/** Headers of every image answered from this origin: proven type, no sniffing, no document context, no cross-site embedding. */
function setImageHeaders(res: NextApiResponse, type: string, cacheControl: string, length: number | null): void {
  res.setHeader('Cache-Control', cacheControl)
  res.setHeader('Content-Type', type)
  if (length !== null) res.setHeader('Content-Length', String(length))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  res.setHeader('Content-Disposition', 'inline')
}

function sendImage(req: NextApiRequest, res: NextApiResponse, image: VerifiedImage, cacheControl: string): void {
  setImageHeaders(res, image.type, cacheControl, image.bytes.byteLength)
  if (req.method === 'HEAD') {
    res.status(200).end()
    return
  }
  res.status(200).send(image.bytes)
}

function sendOutcome(req: NextApiRequest, res: NextApiResponse, outcome: ProxyOutcome, version: string): void {
  if (outcome.kind === 'notFound') return notFound(res)
  if (outcome.kind === 'unavailable') return unavailable(res, outcome.status)
  const exact = outcome.image.hash.startsWith(version)
  sendImage(req, res, outcome.image, exact ? IMMUTABLE_CACHE_CONTROL : CACHE_CONTROL)
}

/** Reads, sniffs and hashes an image body (at most MAX_MEDIA_BYTES); `expectedHash` must match when given. */
async function verifyBody(response: Response, expectedHash: string | null): Promise<ProxyOutcome> {
  if (response.status === 404 || response.status === 410) {
    await response.body?.cancel().catch(() => undefined)
    return { kind: 'notFound' }
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    return { kind: 'unavailable', status: response.status }
  }
  let bytes: Uint8Array
  try {
    bytes = await readCapped(response, MAX_MEDIA_BYTES)
  } catch (error) {
    console.error('Media read failed:', error instanceof MediaTooLargeError ? error.message : error)
    return { kind: 'unavailable', status: 502 }
  }
  const type = sniffImageType(bytes)
  if (!type) {
    console.error('Media is not a PNG/JPEG/WebP/GIF image; refusing to serve it')
    return { kind: 'unavailable', status: 502 }
  }
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (expectedHash && hash !== expectedHash) {
    console.error(`Media bytes do not match their storage key (${expectedHash.slice(0, 12)}); refusing to serve them`)
    return { kind: 'unavailable', status: 502 }
  }
  return { kind: 'image', image: { hash, type, bytes: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) } }
}

/** Downloads a stored object from storage (one more redirect at most, allowed hosts only). */
async function fetchStored(target: URL, hash: string): Promise<ProxyOutcome> {
  try {
    const { response } = await fetchAllowedMedia(target, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), maxHops: 1 })
    return await verifyBody(response, hash)
  } catch (error) {
    console.error('Media fetch failed:', error instanceof MediaHostNotAllowedError ? error.message : error)
    return { kind: 'unavailable', status: 502 }
  }
}

/**
 * Answers `?v=<hex>`.
 *
 * - A cached image for this slot whose sha256 starts with `v` is answered at once.
 * - Otherwise one switchboard request. Its 302 names the storage object, whose
 *   key ends in the sha256 of the bytes (content-addressed storage). When `v`
 *   is not a prefix of that hash, or the key carries no hash, or this is a
 *   HEAD, the answer is the unversioned one (the same 302): a random `v` costs
 *   no storage download.
 * - A matching `v` downloads the object once (concurrent requests share the
 *   download; at most MAX_CONCURRENT_FETCHES run at once, past that the
 *   answer is the 302 again), follows redirects only to the switchboard or
 *   allowed https storage hosts, caps it at MAX_MEDIA_BYTES within
 *   FETCH_TIMEOUT_MS, requires a PNG/JPEG/WebP/GIF signature (the sniffed type
 *   is the Content-Type) and requires sha256(bytes) to equal the key hash.
 *   Then it is answered immutable and kept in the in-process cache.
 * - A switchboard answering the bytes itself (filesystem storage) gets the same
 *   checks and sharing; immutable only when sha256(bytes) starts with `v`.
 * - Failures are never immutable: missing is the usual cacheable 404, anything
 *   else a no-store 502/503.
 */
async function handleVersioned(req: NextApiRequest, res: NextApiResponse, documentId: string, field: MediaField, upstreamUrl: string, version: string): Promise<void> {
  const slot = `${documentId}/${field}`
  const hit = cachedImage(slot, version)
  if (hit) return sendImage(req, res, hit, IMMUTABLE_CACHE_CONTROL)

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (error) {
    console.error('Media lookup failed:', error)
    return unavailable(res)
  }

  const location = upstream.headers.get('location')
  if (upstream.status === 302 && location) {
    let target: URL
    try {
      target = new URL(location, upstreamUrl)
    } catch {
      return unavailable(res)
    }
    const hash = KEY_HASH_RE.exec(target.pathname)?.[1]
    if (!hash || !hash.startsWith(version) || req.method === 'HEAD') return redirect(res, location)
    const outcome = proxiedFetch(`${slot}/${hash}`, () => fetchStored(target, hash))
    if (outcome === 'saturated') return redirect(res, location)
    const result = await outcome
    if (result.kind === 'image') cacheImage(slot, result.image)
    return sendOutcome(req, res, result, version)
  }

  if (upstream.status === 200) {
    if (req.method === 'HEAD') return passThroughHead(res, upstream)
    let consumed = false
    const outcome = proxiedFetch(`${slot}/v:${version}`, () => {
      consumed = true
      return verifyBody(upstream, null)
    })
    if (!consumed) await upstream.body?.cancel().catch(() => undefined)
    // Saturated: the unversioned URL, which streams the bytes with the short cache.
    if (outcome === 'saturated') return redirect(res, mediaUrl(documentId, field))
    const result = await outcome
    if (result.kind === 'image' && result.image.hash.startsWith(version)) cacheImage(slot, result.image)
    return sendOutcome(req, res, result, version)
  }

  await upstream.body?.cancel().catch(() => undefined)
  if (upstream.status >= 500) return unavailable(res, upstream.status)
  notFound(res)
}

/** HEAD on bytes the switchboard serves itself: sniff the first bytes only, never download the body. */
async function passThroughHead(res: NextApiResponse, upstream: Response): Promise<void> {
  const length = Number(upstream.headers.get('content-length'))
  const type = sniffImageType(await readHead(upstream))
  if (!type) return unavailable(res)
  setImageHeaders(res, type, CACHE_CONTROL, Number.isFinite(length) && length > 0 ? length : null)
  res.status(200).end()
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
  // The version is checked against the stored hash, never forwarded: the upstream route ignores queries.
  const version = typeof req.query.v === 'string' && VERSION_RE.test(req.query.v) ? req.query.v : null
  if (version) return handleVersioned(req, res, documentId, field, upstreamUrl, version)

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
  if (upstream.status === 302 && location) return redirect(res, location)
  if (upstream.status === 200) {
    // Filesystem storage: the bytes come through here, so they get the same proof as versioned ones.
    if (req.method === 'HEAD') return passThroughHead(res, upstream)
    const result = await verifyBody(upstream, null)
    if (result.kind === 'notFound') return notFound(res)
    if (result.kind === 'unavailable') return unavailable(res, result.status)
    return sendImage(req, res, result.image, CACHE_CONTROL)
  }
  await upstream.body?.cancel().catch(() => undefined)
  if (upstream.status >= 500) return unavailable(res, upstream.status)
  notFound(res)
}
