import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { fixtureStub } from './support/stub-switchboard-client'
import { profileFooter } from '../lib/og/og-footer'
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
const LONG_NAME = '0x5e00000000000000000000000000000000000c0d'
const LONG_WORD = '0x5e00000000000000000000000000000000000c0e'
const LONG_APP_DID = 'did:key:z6MkSeoLongAppxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
// 120 characters of real words, and one 120-character word.
const LONG_TEXT = 'Quarterly Treasury Reconciliation Dashboard for Decentralised Autonomous Organisations and Their Many Contributors World'
const LONG_RUN = 'W'.repeat(120)
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
  await fixtureStub({
    match: 'OgProfile',
    variables: LONG_NAME,
    response: { data: { renownUsers: [{ ...profile('stub-webp-doc', `attachment://v1:${'c'.repeat(64)}`), displayName: LONG_TEXT, handle: 'h'.repeat(120) }] } },
  })
  await fixtureStub({ match: 'OgProfile', variables: LONG_WORD, response: { data: { renownUsers: [{ ...profile('seo-doc-long', null), displayName: LONG_RUN }] } } })
  await fixtureStub({
    match: 'OgApp',
    variables: LONG_APP_DID,
    response: { data: { appProfile: { documentId: 'stub-webp-doc', name: LONG_TEXT, tagline: LONG_TEXT, category: LONG_TEXT, logo: null, logoRef: `attachment://v1:${'2'.repeat(64)}` } } },
  })
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

/**
 * Pixels of card text (ink #F4F7FF or muted #94A3B8; every channel > 140) in the
 * right 48 px or the bottom 40 px of the card, where no text belongs: text that
 * runs past its box shows up there. The background and the green/blue accents
 * have a channel <= 140.
 */
async function textPixelsInMargins(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let count = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x < info.width - 48 && y < info.height - 40) continue
      const i = (y * info.width + x) * 3
      if (data[i] > 140 && data[i + 1] > 140 && data[i + 2] > 140) count++
    }
  }
  return count
}

test.describe('link-preview text', () => {
  test('the profile footer shortens a long handle and keeps a short one', () => {
    expect(profileFooter('h'.repeat(120))).toBe(`renown.id/@${'h'.repeat(24)}…`)
    expect(profileFooter('alice')).toBe('renown.id/@alice')
    expect(profileFooter(null)).toBe('renown.id')
  })

  for (const [label, query] of [
    ['a 120-character app name, tagline and category', `?variant=app&did=${LONG_APP_DID}`],
    ['a 120-character display name and handle', `?variant=profile&address=${LONG_NAME}`],
    ['a 120-character name without spaces', `?variant=profile&address=${LONG_WORD}`],
  ]) {
    test(`clamps ${label} inside the card`, async ({ request }) => {
      const response = await request.get(`/api/og${query}`)
      expect(response.status()).toBe(200)
      expect(response.headers()['x-og-variant']).not.toBe('default')
      expect(await textPixelsInMargins(await response.body())).toBe(0)
    })
  }

  test('a short card keeps its text margins clear too', async ({ request }) => {
    const response = await request.get(`/api/og?variant=app&did=${APP_DID}`)
    expect(await textPixelsInMargins(await response.body())).toBe(0)
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

test.describe('link-preview backgrounds', () => {
  const COVER_APP_DID = 'did:key:z6MkSeoCoverAppxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
  const BROKEN_COVER_DID = 'did:key:z6MkSeoBrokenCoverxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
  test.beforeAll(async () => {
    const row = (documentId: string, coverRef: string) => ({ documentId, name: 'Cover App', tagline: 'Has a cover', category: 'Tools', logo: null, logoRef: null, coverRef })
    // stub-app-doc serves a cover; doc-og-nocover has none (its /media cover 404s).
    await fixtureStub({ match: 'OgApp', variables: COVER_APP_DID, response: { data: { appProfile: row('stub-app-doc', `attachment://v1:${'2'.repeat(64)}`) } } })
    await fixtureStub({ match: 'OgApp', variables: BROKEN_COVER_DID, response: { data: { appProfile: row('doc-og-nocover', `attachment://v1:${'9'.repeat(64)}`) } } })
  })

  for (const [label, query, background] of [
    ['a profile is drawn on its identity art', `?variant=profile&address=${ADDRESS}`, 'art'],
    ['an app without a cover is drawn on its identity art', `?variant=app&did=${APP_DID}`, 'art'],
    ['an app with a cover is drawn on the cover', `?variant=app&did=${COVER_APP_DID}`, 'cover'],
    ['an app whose cover cannot be fetched falls back to its identity art', `?variant=app&did=${BROKEN_COVER_DID}`, 'art'],
    ['the default card has no backdrop', '?variant=default', 'none'],
  ] as const) {
    test(label, async ({ request }) => {
      const response = await request.get(`/api/og${query}`)
      expect(response.status()).toBe(200)
      expect(response.headers()['x-og-background']).toBe(background)
      expect(response.headers()['cache-control']).toBe('public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
    })
  }

  test('the same profile always gets the same card, and two profiles differ', async ({ request }) => {
    const a = await (await request.get(`/api/og?variant=profile&address=${ADDRESS}`)).body()
    const again = await (await request.get(`/api/og?variant=profile&address=${ADDRESS}`)).body()
    const other = await (await request.get(`/api/og?variant=profile&address=${WEBP}`)).body()
    expect(again.equals(a)).toBe(true)
    expect(other.equals(a)).toBe(false)
  })
})

test.describe('link-preview avatars are the real picture', () => {
  const PHOTO_PNG = '0x5e00000000000000000000000000000000000c10'
  const PHOTO_WEBP = '0x5e00000000000000000000000000000000000c11'
  test.beforeAll(async () => {
    await fixtureStub({ match: 'OgProfile', variables: PHOTO_PNG, response: { data: { renownUsers: [profile('stub-photopng-doc', `attachment://v1:${'d'.repeat(64)}`)] } } })
    await fixtureStub({ match: 'OgProfile', variables: PHOTO_WEBP, response: { data: { renownUsers: [profile('stub-photowebp-doc', `attachment://v1:${'e'.repeat(64)}`)] } } })
  })

  // The avatar circle is 220 px at x 72..292, centred vertically; the stub photo is
  // four vertical colour bands (red, green, blue, yellow). Count how many of the
  // bands show up in a strip across the middle of the circle.
  for (const [label, address] of [['PNG', PHOTO_PNG], ['WebP', PHOTO_WEBP]]) {
    test(`a multi-colour ${label} avatar draws as the image, not a flat colour`, async ({ request }) => {
      const response = await request.get(`/api/og?variant=profile&address=${address}`)
      expect(response.headers()['x-og-image']).toBe('drawn')
      const { data, info } = await sharp(await response.body()).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      const bands = new Set<string>()
      const y = Math.round(info.height / 2)
      for (let x = 100; x < 265; x++) {
        const i = (y * info.width + x) * 3
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
        if (r > 180 && g < 90 && b < 90) bands.add('red')
        if (g > 150 && r < 90 && b < 120) bands.add('green')
        if (b > 180 && r < 90 && g < 140) bands.add('blue')
        if (r > 200 && g > 170 && b < 90) bands.add('yellow')
      }
      expect([...bands].sort()).toEqual(['blue', 'green', 'red', 'yellow'])
    })
  }
})
