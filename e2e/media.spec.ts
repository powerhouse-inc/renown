import { test, expect, type APIRequestContext } from '@playwright/test'
import { isAllowedMediaTarget, sniffImageType } from '../lib/media-fetch'

// Versioned /media URLs (`?v=<sha256 prefix>`) are answered same-origin with
// the image bytes; unversioned ones keep the 302 to signed storage. Runs
// against the stub switchboard's media route (e2e/support/stub-switchboard.mjs),
// which redirects to its own fake storage (the switchboard origin, allowed).

const IMMUTABLE = 'public, max-age=31536000, immutable'
const SHORT = 'public, max-age=60, stale-while-revalidate=240'

/** sha256 of the stub's stored avatar, read from the unversioned redirect. */
async function stubAvatarSha(request: APIRequestContext): Promise<string> {
  const response = await request.get('/media/stub-avatar-doc/avatar', { maxRedirects: 0 })
  const sha = /\/__stub\/s3\/([0-9a-f]{64})$/.exec(response.headers().location ?? '')?.[1]
  expect(sha).toBeTruthy()
  return sha!
}

test('a versioned image is served same-origin, immutable, nosniff and sandboxed', async ({ request }) => {
  const sha = await stubAvatarSha(request)
  for (const path of [`/media/stub-avatar-doc/avatar?v=${sha.slice(0, 12)}`, `/media/stub-app-doc/cover?v=${sha.slice(0, 12)}`]) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(200)
    const headers = response.headers()
    expect(headers['content-type']).toBe('image/png')
    expect(headers['cache-control']).toBe(IMMUTABLE)
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['content-security-policy']).toBe("default-src 'none'; sandbox")
    const body = await response.body()
    expect(headers['content-length']).toBe(String(body.byteLength))
    expect([...body.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  }
})

test('the full hash is accepted as a version too', async ({ request }) => {
  const sha = await stubAvatarSha(request)
  const response = await request.get(`/media/stub-avatar-doc/avatar?v=${sha}`, { maxRedirects: 0 })
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe(IMMUTABLE)
})

test('a version that does not match the bytes gets the image, but never the immutable cache', async ({ request }) => {
  const response = await request.get('/media/stub-avatar-doc/avatar?v=0123456789ab', { maxRedirects: 0 })
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  expect(response.headers()['cache-control']).toBe(SHORT)
})

test('the Content-Type comes from the bytes, not the upstream header (WebP)', async ({ request }) => {
  const response = await request.get('/media/stub-webp-doc/cover?v=0123456789ab', { maxRedirects: 0 })
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/webp')
})

test('unversioned (and malformed-version) requests keep the 302 to signed storage', async ({ request }) => {
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

for (const [label, doc] of [
  ['bytes that are not an image (though labelled image/png)', 'stub-fakepng-doc'],
  ['a plain-text body', 'stub-text-doc'],
  ['a redirect to a host off the allowlist', 'stub-evil-doc'],
  ['an image over 5 MB (streamed, no Content-Length)', 'stub-hugepng-doc'],
  ['a redirect loop', 'stub-loop-doc'],
  ['a switchboard outage', 'stub-broken-doc'],
] as const) {
  test(`a versioned request refuses ${label} with an uncached 502`, async ({ request }) => {
    const response = await request.get(`/media/${doc}/cover?v=0123456789ab`, { maxRedirects: 0 })
    expect(response.status()).toBe(502)
    expect(response.headers()['cache-control']).toBe('no-store')
    expect(response.headers()['content-type']).toContain('application/json')
  })
}

test('image signatures are sniffed: PNG, JPEG, WebP, GIF only', () => {
  const bytes = (...values: number[]) => Uint8Array.from(values)
  const ascii = (text: string) => Uint8Array.from(Buffer.from(text, 'latin1'))
  expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png')
  expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
  expect(sniffImageType(ascii('RIFF\x10\x00\x00\x00WEBPVP8 '))).toBe('image/webp')
  expect(sniffImageType(ascii('GIF89a..'))).toBe('image/gif')
  expect(sniffImageType(ascii('GIF87a..'))).toBe('image/gif')
  expect(sniffImageType(ascii('RIFF\x10\x00\x00\x00WAVEfmt '))).toBeNull()
  expect(sniffImageType(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
  expect(sniffImageType(ascii('<html>'))).toBeNull()
  expect(sniffImageType(bytes())).toBeNull()
})

test('only https storage hosts on the allowlist are followed', () => {
  expect(isAllowedMediaTarget(new URL('https://nbg1.your-objectstorage.com/bucket/key'))).toBe(true)
  expect(isAllowedMediaTarget(new URL('http://nbg1.your-objectstorage.com/bucket/key'))).toBe(false)
  expect(isAllowedMediaTarget(new URL('https://evil.example/a.png'))).toBe(false)
  expect(isAllowedMediaTarget(new URL('https://nbg1.your-objectstorage.com.evil.example/a.png'))).toBe(false)
})
