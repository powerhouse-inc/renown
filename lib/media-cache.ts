// In-process bookkeeping for the same-origin /media byte route
// (pages/api/media/[documentId]/[field].ts): a small LRU of verified images,
// de-duplication of concurrent fetches, and a cap on fetches in flight, so a
// burst of requests costs at most one storage download per image and never
// more than MAX_CONCURRENT_FETCHES at once.
import type { SniffedImageType } from './media-fetch'

/** Bytes whose sha256 is `hash` and whose signature proved `type`. */
export interface VerifiedImage {
  hash: string
  type: SniffedImageType
  bytes: Buffer
}

export type ProxyOutcome = { kind: 'image'; image: VerifiedImage } | { kind: 'notFound' } | { kind: 'unavailable'; status: number }

export const CACHE_MAX_ENTRIES = 64
export const CACHE_MAX_BYTES = 32 * 1024 * 1024
export const CACHE_TTL_MS = 60_000
export const MAX_CONCURRENT_FETCHES = 16

interface Entry {
  image: VerifiedImage
  expires: number
}

/** Keyed by `<documentId>/<field>`: the image last verified for that slot. */
const cache = new Map<string, Entry>()
let cachedBytes = 0

function drop(key: string): void {
  const entry = cache.get(key)
  if (!entry) return
  cachedBytes -= entry.image.bytes.byteLength
  cache.delete(key)
}

/** The cached image for `key` when its hash starts with `version` and it has not expired. */
export function cachedImage(key: string, version: string, now = Date.now()): VerifiedImage | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expires <= now) {
    drop(key)
    return null
  }
  if (!entry.image.hash.startsWith(version)) return null
  // Most recently used last.
  cache.delete(key)
  cache.set(key, entry)
  return entry.image
}

export function cacheImage(key: string, image: VerifiedImage, now = Date.now()): void {
  if (image.bytes.byteLength > CACHE_MAX_BYTES) return
  drop(key)
  cache.set(key, { image, expires: now + CACHE_TTL_MS })
  cachedBytes += image.bytes.byteLength
  for (const oldest of cache.keys()) {
    if (cache.size <= CACHE_MAX_ENTRIES && cachedBytes <= CACHE_MAX_BYTES) break
    drop(oldest)
  }
}

const inflight = new Map<string, Promise<ProxyOutcome>>()
let active = 0

/**
 * Runs `fetch` for `key` unless the same key is already in flight (then its
 * result is shared). 'saturated' when MAX_CONCURRENT_FETCHES fetches are
 * already running: the caller falls back to the redirect instead.
 */
export function proxiedFetch(key: string, fetch: () => Promise<ProxyOutcome>): Promise<ProxyOutcome> | 'saturated' {
  const existing = inflight.get(key)
  if (existing) return existing
  if (active >= MAX_CONCURRENT_FETCHES) return 'saturated'
  active++
  const run = fetch()
    .catch((error: unknown): ProxyOutcome => {
      console.error('Media fetch failed:', error)
      return { kind: 'unavailable', status: 502 }
    })
    .finally(() => {
      active--
      inflight.delete(key)
    })
  inflight.set(key, run)
  return run
}
