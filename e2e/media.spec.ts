import { test, expect, type APIRequestContext } from '@playwright/test'
import { isAllowedMediaTarget, sniffImageType } from '../lib/media-fetch'
import { STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'

// Versioned /media URLs (`?v=<sha256 prefix>`) whose version matches the
// stored object are answered same-origin with the image bytes; anything else
// keeps the 302 to signed storage. Runs against the stub switchboard's media
// route (e2e/support/stub-switchboard.mjs): "stub-blob-<kind>-<tag>" documents
// redirect to its fake content-addressed storage (the switchboard origin,
// allowed), which counts downloads per tag. Serial: the saturation test fills
// the route's fetch slots, which would turn parallel tests' bytes into 302s.
test.describe.configure({ mode: 'serial' })

const IMMUTABLE = 'public, max-age=31536000, immutable'
const SHORT = 'public, max-age=60, stale-while-revalidate=240'
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** A fresh tag per test run: the route's in-process cache never answers for it. */
const tag = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** The storage hash a document's unversioned /media redirect names. */
async function storedHash(request: APIRequestContext, doc: string, field = 'cover'): Promise<string> {
  const response = await request.get(`/media/${doc}/${field}`, { maxRedirects: 0 })
  expect(response.status()).toBe(302)
  const hash = /\/([0-9a-f]{64})(?:\?|$)/.exec(response.headers().location ?? '')?.[1]
  expect(hash).toBeTruthy()
  return hash!
}

async function storageHits(t: string): Promise<number> {
  const response = await fetch(`${STUB_SWITCHBOARD_URL}/__stub/blob-hits?tag=${t}`)
  return ((await response.json()) as { hits: number }).hits
}

function expectSameOriginImage(headers: Record<string, string>, type: string, cacheControl: string): void {
  expect(headers['content-type']).toBe(type)
  expect(headers['cache-control']).toBe(cacheControl)
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['content-security-policy']).toBe("default-src 'none'; sandbox")
  expect(headers['cross-origin-resource-policy']).toBe('same-site')
  expect(headers['content-disposition']).toBe('inline')
}

test('a matching version is served same-origin: immutable, nosniff, sandboxed, same-site', async ({ request }) => {
  const sha = await storedHash(request, 'stub-avatar-doc', 'avatar')
  for (const path of [`/media/stub-avatar-doc/avatar?v=${sha.slice(0, 12)}`, `/media/stub-app-doc/cover?v=${sha}`]) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(200)
    expectSameOriginImage(response.headers(), 'image/png', IMMUTABLE)
    const body = await response.body()
    expect(response.headers()['content-length']).toBe(String(body.byteLength))
    expect([...body.subarray(0, 8)]).toEqual(PNG_SIGNATURE)
  }
})

test('the Content-Type comes from the bytes (WebP)', async ({ request }) => {
  const doc = `stub-blob-webp-${tag()}`
  const sha = await storedHash(request, doc)
  const response = await request.get(`/media/${doc}/cover?v=${sha.slice(0, 12)}`, { maxRedirects: 0 })
  expect(response.status()).toBe(200)
  expectSameOriginImage(response.headers(), 'image/webp', IMMUTABLE)
})

test('a version that does not match the storage key is the unversioned 302, with no storage download', async ({ request }) => {
  const t = tag()
  const doc = `stub-blob-png-${t}`
  const response = await request.get(`/media/${doc}/cover?v=0123456789ab`, { maxRedirects: 0 })
  expect(response.status()).toBe(302)
  expect(response.headers().location).toContain(`/__stub/blob/png/`)
  expect(response.headers()['cache-control']).toBe(SHORT)
  expect(await storageHits(t)).toBe(0)
})

test('concurrent requests for one image share a single storage download, and repeats come from memory', async ({ request }) => {
  const t = tag()
  const doc = `stub-blob-pngdelay-${t}`
  const sha = await storedHash(request, doc)
  const path = `/media/${doc}/cover?v=${sha.slice(0, 12)}`
  const responses = await Promise.all(Array.from({ length: 8 }, () => request.get(path, { maxRedirects: 0 })))
  for (const response of responses) {
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toBe(IMMUTABLE)
  }
  expect(await storageHits(t)).toBe(1)
  expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(200)
  expect(await storageHits(t)).toBe(1)
})

test('HEAD never downloads: the 302 when not in memory, the headers alone when it is', async ({ request }) => {
  const t = tag()
  const doc = `stub-blob-png-${t}`
  const sha = await storedHash(request, doc)
  const path = `/media/${doc}/cover?v=${sha.slice(0, 12)}`
  const cold = await request.head(path, { maxRedirects: 0 })
  expect(cold.status()).toBe(302)
  expect(await storageHits(t)).toBe(0)
  expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(200)
  const warm = await request.head(path, { maxRedirects: 0 })
  expect(warm.status()).toBe(200)
  expectSameOriginImage(warm.headers(), 'image/png', IMMUTABLE)
  expect(await storageHits(t)).toBe(1)
})

test('when every fetch slot is busy a matching version falls back to the 302', async ({ request }) => {
  test.setTimeout(30_000)
  const slow = tag()
  const sha = await storedHash(request, `stub-blob-slow-${slow}a`)
  // 16 distinct slow downloads fill the slots (the route's MAX_CONCURRENT_FETCHES).
  const busy = Array.from({ length: 16 }, (_, i) => request.get(`/media/stub-blob-slow-${slow}${i}/cover?v=${sha.slice(0, 12)}`, { maxRedirects: 0 }))
  // Each slow document is its own storage tag; wait until all 16 downloads are running.
  const running = async () => (await Promise.all(Array.from({ length: 16 }, (_, i) => storageHits(`${slow}${i}`)))).reduce((a, b) => a + b, 0)
  await expect.poll(running, { timeout: 10_000 }).toBe(16)
  const t = tag()
  const response = await request.get(`/media/stub-blob-png-${t}/cover?v=${sha.slice(0, 12)}`, { maxRedirects: 0 })
  expect(response.status()).toBe(302)
  expect(response.headers()['cache-control']).toBe(SHORT)
  expect(await storageHits(t)).toBe(0)
  for (const response of await Promise.all(busy)) expect(response.status()).toBe(200)
})

test('unversioned and malformed-version requests keep the 302 to signed storage', async ({ request }) => {
  for (const path of ['/media/stub-app-doc/cover', '/media/stub-app-doc/cover?v=xyz', '/media/stub-app-doc/cover?v=abc']) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(302)
    expect(response.headers().location, path).toMatch(/\/__stub\/s3\/[0-9a-f]{64}$/)
    expect(response.headers()['cache-control'], path).toBe(SHORT)
  }
})

test('a missing versioned image is the usual cacheable 404, not immutable', async ({ request }) => {
  const response = await request.get('/media/doc-without-avatar/avatar?v=0123456789ab', { maxRedirects: 0 })
  expect(response.status()).toBe(404)
  expect(response.headers()['cache-control']).toBe('public, max-age=60')
})

for (const [label, kind] of [
  ['bytes that are not an image (though labelled image/png)', 'fakepng'],
  ['a plain-text body', 'text'],
  ['bytes that do not hash to their storage key', 'liar'],
  ['a storage key on a host off the allowlist', 'evil'],
  ['an image over 5 MB (streamed, no Content-Length)', 'hugepng'],
  ['a redirect loop', 'loop'],
] as const) {
  test(`a matching version refuses ${label} with an uncached 502`, async ({ request }) => {
    const doc = `stub-blob-${kind}-${tag()}`
    const sha = await storedHash(request, doc)
    const response = await request.get(`/media/${doc}/cover?v=${sha.slice(0, 12)}`, { maxRedirects: 0 })
    expect(response.status()).toBe(502)
    expect(response.headers()['cache-control']).toBe('no-store')
    expect(response.headers()['content-type']).toContain('application/json')
  })
}

test('a switchboard outage on a versioned request is an uncached 502', async ({ request }) => {
  const response = await request.get('/media/stub-broken-doc/cover?v=0123456789ab', { maxRedirects: 0 })
  expect(response.status()).toBe(502)
  expect(response.headers()['cache-control']).toBe('no-store')
})

test('bytes the switchboard serves itself (filesystem storage) are sniffed and sandboxed too', async ({ request }) => {
  const png = await request.get(`/media/stub-fs-png-${tag()}/avatar`, { maxRedirects: 0 })
  expect(png.status()).toBe(200)
  expectSameOriginImage(png.headers(), 'image/png', SHORT)
  const sha = await storedHash(request, 'stub-avatar-doc', 'avatar')
  const versioned = await request.get(`/media/stub-fs-png-${tag()}/avatar?v=${sha.slice(0, 12)}`, { maxRedirects: 0 })
  expect(versioned.status()).toBe(200)
  expectSameOriginImage(versioned.headers(), 'image/png', IMMUTABLE)
  const stale = await request.get(`/media/stub-fs-png-${tag()}/avatar?v=0123456789ab`, { maxRedirects: 0 })
  expectSameOriginImage(stale.headers(), 'image/png', SHORT)
  const head = await request.head(`/media/stub-fs-png-${tag()}/avatar`, { maxRedirects: 0 })
  expect(head.status()).toBe(200)
  expect(head.headers()['content-type']).toBe('image/png')
  for (const path of [`/media/stub-fs-fake-${tag()}/avatar`, `/media/stub-fs-fake-${tag()}/avatar?v=0123456789ab`]) {
    const fake = await request.get(path, { maxRedirects: 0 })
    expect(fake.status(), path).toBe(502)
    expect(fake.headers()['cache-control'], path).toBe('no-store')
  }
})

test('image signatures are sniffed: PNG, JPEG, WebP, GIF only', () => {
  const bytes = (...values: number[]) => Uint8Array.from(values)
  const ascii = (text: string) => Uint8Array.from(Buffer.from(text, 'latin1'))
  expect(sniffImageType(bytes(...PNG_SIGNATURE, 0))).toBe('image/png')
  expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
  expect(sniffImageType(ascii('RIFF\x10\x00\x00\x00WEBPVP8 '))).toBe('image/webp')
  expect(sniffImageType(ascii('GIF89a..'))).toBe('image/gif')
  expect(sniffImageType(ascii('GIF87a..'))).toBe('image/gif')
  expect(sniffImageType(ascii('RIFF\x10\x00\x00\x00WAVEfmt '))).toBeNull()
  expect(sniffImageType(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
  expect(sniffImageType(ascii('<html>'))).toBeNull()
  expect(sniffImageType(bytes())).toBeNull()
})

test('only https storage hosts on the allowlist, on their default port, are followed', () => {
  expect(isAllowedMediaTarget(new URL('https://nbg1.your-objectstorage.com/bucket/key'))).toBe(true)
  expect(isAllowedMediaTarget(new URL('https://nbg1.your-objectstorage.com:443/bucket/key'))).toBe(true)
  expect(isAllowedMediaTarget(new URL('https://nbg1.your-objectstorage.com:8443/bucket/key'))).toBe(false)
  expect(isAllowedMediaTarget(new URL('http://nbg1.your-objectstorage.com/bucket/key'))).toBe(false)
  expect(isAllowedMediaTarget(new URL('https://evil.example/a.png'))).toBe(false)
  expect(isAllowedMediaTarget(new URL('https://nbg1.your-objectstorage.com.evil.example/a.png'))).toBe(false)
})
