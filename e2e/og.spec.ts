import { test, expect } from '@playwright/test'
import { fixtureStub } from './support/stub-switchboard-client'
import { readFont } from '../lib/og/og-font'

// Fixtures use ids no other spec uses (they survive renown-writes.spec.ts's resets).
// The OG route (pages/api/og.tsx) against the stub switchboard.
const ADDRESS = '0x5e00000000000000000000000000000000000c01'
const BROKEN = '0x5e00000000000000000000000000000000000c02'
const EXTERNAL = '0x5e00000000000000000000000000000000000c03'
const TEXT = '0x5e00000000000000000000000000000000000c04'
const HUGE = '0x5e00000000000000000000000000000000000c05'
const EVIL = '0x5e00000000000000000000000000000000000c06'
const LOOP = '0x5e00000000000000000000000000000000000c07'
const WEBP = '0x5e00000000000000000000000000000000000c08'
const AVIF = '0x5e00000000000000000000000000000000000c09'
const SVG = '0x5e00000000000000000000000000000000000c0a'
const BAD_WEBP = '0x5e00000000000000000000000000000000000c0b'
const BOMB = '0x5e00000000000000000000000000000000000c0c'
const WEBP_APP_DID = 'did:key:z6MkSeoWebpAppxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const APP_DID = 'did:key:z6MkSeoAppxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const profile = (documentId: string, avatar: string | null) => ({
  documentId,
  displayName: 'Olga Graph',
  username: null,
  handle: 'olga',
  avatar,
  userImage: null,
})

test.beforeAll(async () => {
  await fixtureStub({ match: 'OgProfile', variables: ADDRESS, response: { data: { renownUsers: [profile('seo-doc-1', null)] } } })
  // Its avatar is not stored on the stub: the image fetch 404s.
  await fixtureStub({
    match: 'OgProfile',
    variables: BROKEN,
    response: { data: { renownUsers: [profile('seo-doc-broken', `attachment://v1:${'a'.repeat(64)}`)] } },
  })
  await fixtureStub({ match: 'OgProfile', variables: EXTERNAL, response: { data: { renownUsers: [{ ...profile('seo-doc-ext', null), userImage: 'https://localhost:1/avatar.png' }] } } })
  for (const [address, doc] of [[TEXT, 'stub-text-doc'], [HUGE, 'stub-huge-doc'], [EVIL, 'stub-evil-doc'], [LOOP, 'stub-loop-doc']]) {
    await fixtureStub({ match: 'OgProfile', variables: address, response: { data: { renownUsers: [profile(doc, `attachment://v1:${'b'.repeat(64)}`)] } } })
  }
  for (const [address, doc] of [[WEBP, 'stub-webp-doc'], [AVIF, 'stub-avif-doc'], [SVG, 'stub-svg-doc'], [BAD_WEBP, 'stub-badwebp-doc'], [BOMB, 'stub-bomb-doc']]) {
    await fixtureStub({ match: 'OgProfile', variables: address, response: { data: { renownUsers: [profile(doc, `attachment://v1:${'c'.repeat(64)}`)] } } })
  }
  await fixtureStub({
    match: 'OgApp',
    variables: WEBP_APP_DID,
    response: { data: { appProfile: { documentId: 'stub-webp-doc', name: 'Webp App', tagline: 'Draws its WebP logo', category: 'Tools', logo: null, logoRef: `attachment://v1:${'2'.repeat(64)}` } } },
  })
  await fixtureStub({
    match: 'OgApp',
    variables: APP_DID,
    response: { data: { appProfile: { documentId: 'stub-app-doc', name: 'Seo App', tagline: 'Found everywhere', category: 'Tools', logo: null, logoRef: `attachment://v1:${'1'.repeat(64)}` } } },
  })
})

test.describe('link-preview images', () => {
  const cardOf = async (request: import('@playwright/test').APIRequestContext, query: string) => {
    const response = await request.get(`/api/og${query}`)
    expect(response.status(), query).toBe(200)
    expect(response.headers()['content-type'], query).toBe('image/png')
    return { variant: response.headers()['x-og-variant'], image: response.headers()['x-og-image'] }
  }
  const variantOf = async (request: import('@playwright/test').APIRequestContext, query: string) => (await cardOf(request, query)).variant

  test('render the default, profile and app cards', async ({ request }) => {
    expect(await variantOf(request, '')).toBe('default')
    expect(await variantOf(request, `?variant=profile&address=${ADDRESS}`)).toBe('profile')
    expect(await variantOf(request, `?variant=app&did=${APP_DID}`)).toBe('app')
  })

  test('never fetch an external avatar URL: the profile card draws a monogram', async ({ request }) => {
    expect(await variantOf(request, `?variant=profile&address=${EXTERNAL}`)).toBe('profile')
  })

  test('draw the stored image: PNG as is, WebP, AVIF and SVG converted to PNG', async ({ request }) => {
    expect(await cardOf(request, `?variant=app&did=${APP_DID}`)).toEqual({ variant: 'app', image: 'drawn' })
    expect(await cardOf(request, `?variant=profile&address=${WEBP}`)).toEqual({ variant: 'profile', image: 'drawn' })
    expect(await cardOf(request, `?variant=app&did=${WEBP_APP_DID}`)).toEqual({ variant: 'app', image: 'drawn' })
    expect(await cardOf(request, `?variant=profile&address=${AVIF}`)).toEqual({ variant: 'profile', image: 'drawn' })
    expect(await cardOf(request, `?variant=profile&address=${SVG}`)).toEqual({ variant: 'profile', image: 'drawn' })
  })

  test('draw the monogram when the image cannot be decoded or is a decompression bomb', async ({ request }) => {
    expect(await cardOf(request, `?variant=profile&address=${BAD_WEBP}`)).toEqual({ variant: 'profile', image: 'monogram' })
    expect(await cardOf(request, `?variant=profile&address=${BOMB}`)).toEqual({ variant: 'profile', image: 'monogram' })
  })

  test('without a stored image the card draws its monogram; the default card has no image', async ({ request }) => {
    expect(await cardOf(request, `?variant=profile&address=${ADDRESS}`)).toEqual({ variant: 'profile', image: 'monogram' })
    expect(await cardOf(request, '')).toEqual({ variant: 'default', image: 'none' })
  })

  test('fall back to the default card on a non-image, an oversized image, a foreign redirect or a redirect loop', async ({ request }) => {
    for (const address of [TEXT, HUGE, EVIL, LOOP]) {
      expect(await variantOf(request, `?variant=profile&address=${address}`), address).toBe('default')
    }
  })

  test('fall back to the default card on bad input, unknown ids and broken images', async ({ request }) => {
    expect(await variantOf(request, '?variant=profile&address=nope')).toBe('default')
    expect(await variantOf(request, '?variant=profile&address=0x5e00000000000000000000000000000000000c99')).toBe('default')
    expect(await variantOf(request, `?variant=profile&address=${BROKEN}`)).toBe('default')
    expect(await variantOf(request, '?variant=app&did=did:web:nope')).toBe('default')
    expect(await variantOf(request, '?variant=bogus')).toBe('default')
  })
})

test.describe('link-preview caching', () => {
  const LONG = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
  const cacheOf = async (request: import('@playwright/test').APIRequestContext, query: string) => {
    const response = await request.get(`/api/og${query}`)
    expect(response.status(), query).toBe(200)
    return response.headers()['cache-control']
  }

  test('cache real cards, monograms and unknown ids at the edge', async ({ request }) => {
    expect(await cacheOf(request, '')).toBe(LONG)
    expect(await cacheOf(request, `?variant=profile&address=${ADDRESS}`)).toBe(LONG)
    expect(await cacheOf(request, `?variant=profile&address=${EXTERNAL}`)).toBe(LONG)
    expect(await cacheOf(request, `?variant=profile&address=${WEBP}`)).toBe(LONG)
    expect(await cacheOf(request, `?variant=app&did=${WEBP_APP_DID}`)).toBe(LONG)
    expect(await cacheOf(request, `?variant=profile&address=${BAD_WEBP}`)).toBe(LONG)
    expect(await cacheOf(request, `?variant=profile&address=${BOMB}`)).toBe(LONG)
    expect(await cacheOf(request, '?variant=profile&address=0x5e00000000000000000000000000000000000c99')).toBe(LONG)
  })

  test('cache a fallback forced by a failure only briefly, and not at the edge', async ({ request }) => {
    for (const address of [BROKEN, TEXT]) {
      expect(await cacheOf(request, `?variant=profile&address=${address}`), address).toBe('public, max-age=60')
    }
  })
})

test('fonts are read from assets/fonts; a missing font is a failure, so the card falls back to the default font', async () => {
  expect((await readFont('Inter-SemiBold.ttf')).byteLength).toBeGreaterThan(100_000)
  await expect(readFont('Inter-SemiBold.ttf', '/nonexistent-font-dir')).rejects.toThrow()
})
