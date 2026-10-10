import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { fixtureStub } from './support/stub-switchboard-client'
import { profileFooter } from '../lib/og/og-footer'
import { profileCardText } from '../lib/og/og-profile-text'
import { fetchImageDataUrl } from '../lib/og/og-data'
import { AVATAR_BOX, toPngDataUrl } from '../lib/og/og-image'
import { drawWithFallback, STATIC_CARD_PNG } from '../lib/og/og-fallback'
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

  test('a legacy profile (username is a short address, handle set) is titled by its handle, as on its page', () => {
    const address = '0x2BbEa0145d6fB9C6709A74C1179cA0bE71Bb3aC6'
    expect(profileCardText({ displayName: null, username: '0x2BbE...3aC6', handle: 'frank' }, address)).toEqual({
      name: 'frank',
      handleLine: null,
      addressLine: '0x2bbe…3ac6 on Renown',
    })
    expect(profileCardText({ displayName: null, username: '0x2bbe…3ac6', handle: null }, address)).toEqual({
      name: '0x2bbe…3ac6',
      handleLine: null,
      addressLine: null,
    })
    expect(profileCardText({ displayName: 'Olga Graph', username: null, handle: 'olga' }, address)).toEqual({
      name: 'Olga Graph',
      handleLine: '@olga',
      addressLine: '0x2bbe…3ac6 on Renown',
    })
    expect(profileCardText({ displayName: 'Frank', username: null, handle: 'frank' }, address).handleLine).toBeNull()
    expect(profileCardText({ displayName: null, username: 'frank.eth', handle: null }, address).name).toBe('frank.eth')
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

test.describe('link-preview cover legibility and failures', () => {
  const did = (name: string) => `did:key:z6MkSeo${name}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.slice(0, 48) + '1'
  const WHITE = did('WhiteCover')
  const YELLOW = did('YeowCover')
  const PHOTO = did('PhotoCover')
  const FAIL = did('BrknCover')
  test.beforeAll(async () => {
    const row = (documentId: string) => ({ documentId, name: 'Treasury Console', tagline: 'Reconcile every wallet in one place', category: 'Finance', logo: null, logoRef: null, coverRef: `attachment://v1:${'4'.repeat(64)}` })
    for (const [d, doc] of [[WHITE, 'stub-whitecover-doc'], [YELLOW, 'stub-yellowcover-doc'], [PHOTO, 'stub-photocover-doc'], [FAIL, 'stub-broken-doc']]) {
      await fixtureStub({ match: 'OgApp', variables: d, response: { data: { appProfile: row(doc) } } })
    }
  })

  // The scrim is lightest at the right edge: sample the text-free strip there. Anything the
  // backdrop shows at the lightest end must still leave #94A3B8 text readable (backdrop <= 60 grey).
  for (const [label, d] of [['white', WHITE], ['yellow', YELLOW], ['banded', PHOTO]] as const) {
    test(`a ${label} cover keeps the text region dark`, async ({ request }) => {
      const response = await request.get(`/api/og?variant=app&did=${d}`)
      expect(response.headers()['x-og-background']).toBe('cover')
      const { data, info } = await sharp(await response.body()).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      let max = 0
      for (let y = 100; y < 520; y++) {
        for (let x = 960; x < 1150; x++) {
          const i = (y * info.width + x) * 3
          max = Math.max(max, data[i], data[i + 1], data[i + 2])
        }
      }
      expect(max).toBeLessThan(60)
    })
  }

  test('a cover that cannot be fetched draws the identity art but is cached as degraded', async ({ request }) => {
    const response = await request.get(`/api/og?variant=app&did=${FAIL}`)
    expect(response.status()).toBe(200)
    expect(response.headers()['x-og-variant']).toBe('app')
    expect(response.headers()['x-og-background']).toBe('art')
    expect(response.headers()['cache-control']).toBe('public, max-age=60')
  })
})

test.describe('link-preview image conversion is CPU-bounded', () => {
  // An SVG under the byte and pixel caps that takes librsvg several seconds to render.
  const heavySvg = () => {
    let shapes = ''
    for (let i = 0; i < 12000; i++) {
      shapes += `<circle cx="${(i * 37) % 6000}" cy="${(i * 91) % 6000}" r="${200 + (i % 300)}" fill="rgba(${i % 255},100,200,0.3)" filter="url(#f)"/>`
    }
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="6000"><filter id="f"><feGaussianBlur stdDeviation="30"/></filter>${shapes}</svg>`)
  }

  test('a conversion past the timeout fails, and the image fetch answers null (the card draws its monogram)', async () => {
    test.setTimeout(60_000)
    const svg = heavySvg()
    expect(svg.byteLength).toBeLessThan(4 * 1024 * 1024)
    await expect(toPngDataUrl(svg, AVATAR_BOX)).rejects.toThrow(/timeout/)
    const realFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(svg, { status: 200, headers: { 'content-type': 'image/svg+xml' } })
    try {
      expect(await fetchImageDataUrl('http://og.test/media/doc/avatar', 'http://og.test', AVATAR_BOX)).toBeNull()
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

test.describe('link-preview drawing failures never fail the route', () => {
  const profileCard = { variant: 'profile', name: 'Olga', handle: null, handleLine: null, addressLine: null, address: ADDRESS, image: null, background: null } as const
  const ok = Buffer.from('drawn')

  test('a card that cannot be drawn falls back to the default card', async () => {
    const calls: string[] = []
    const drawn = await drawWithFallback(profileCard, 'fonts', async (card, fonts) => {
      calls.push(`${card.variant}:${fonts}`)
      if (card.variant === 'profile') throw new Error('satori')
      return ok
    })
    expect(drawn).toEqual({ png: ok, card: { variant: 'default' }, degraded: true, static: false })
    expect(calls).toEqual(['profile:fonts', 'default:fonts'])
  })

  test('a default card that fails with the custom fonts is retried once without them', async () => {
    const calls: string[] = []
    const drawn = await drawWithFallback(profileCard, 'fonts', async (card, fonts) => {
      calls.push(`${card.variant}:${fonts}`)
      if (fonts) throw new Error('font')
      return ok
    })
    expect(drawn).toEqual({ png: ok, card: { variant: 'default' }, degraded: true, static: false })
    expect(calls).toEqual(['profile:fonts', 'default:fonts', 'default:null'])
  })

  test('when nothing can be drawn the answer is the static card-sized PNG', async () => {
    const calls: string[] = []
    const drawn = await drawWithFallback(profileCard, 'fonts', async (card, fonts) => {
      calls.push(`${card.variant}:${fonts}`)
      throw new Error('broken')
    })
    expect(drawn).toEqual({ png: STATIC_CARD_PNG, card: { variant: 'default' }, degraded: true, static: true })
    expect(calls).toEqual(['profile:fonts', 'default:fonts', 'default:null'])
    expect(await sharp(STATIC_CARD_PNG).metadata()).toMatchObject({ format: 'png', width: 1200, height: 630 })
  })

  test('without custom fonts the default card is tried once, and a good card is drawn as is', async () => {
    let calls = 0
    const failing = await drawWithFallback(profileCard, null, async () => {
      calls++
      throw new Error('broken')
    })
    expect(failing.static).toBe(true)
    expect(calls).toBe(2)
    expect(await drawWithFallback(profileCard, null, async () => ok)).toEqual({ png: ok, card: profileCard, degraded: false, static: false })
  })
})
