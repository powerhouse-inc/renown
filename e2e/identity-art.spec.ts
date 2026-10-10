import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { identityAccent, identityArt, identityHues, oklchHex } from '../lib/identity-art'

// lib/identity-art.ts: pure, so these run without a page.
const A = '0x2bbea0145d6fb9c6709a74c1179ca0be71bb3ac6'
const B = '0x2bbea0145d6fb9c6709a74c1179ca0be71bb3ac7'
const APP = 'did:key:zDnaed4wPy35wBBJVLZL1XPRQWKpQeeb3JRgMdmHQsLe7KJyi'
const SIZE = { width: 1200, height: 320 }

test('the same seed always draws the same picture, case-insensitively', () => {
  expect(identityArt(A, { ...SIZE, theme: 'dark' })).toBe(identityArt(A, { ...SIZE, theme: 'dark' }))
  expect(identityArt(A.toUpperCase().replace('0X', '0x'), { ...SIZE, theme: 'dark' })).toBe(identityArt(A, { ...SIZE, theme: 'dark' }))
})

test('different seeds, themes and id prefixes draw different pictures', () => {
  const a = identityArt(A, { ...SIZE, theme: 'dark' })
  expect(identityArt(B, { ...SIZE, theme: 'dark' })).not.toBe(a)
  expect(identityArt(APP, { ...SIZE, theme: 'dark' })).not.toBe(a)
  expect(identityArt(A, { ...SIZE, theme: 'light' })).not.toBe(a)
  expect(identityArt(A, { ...SIZE, theme: 'dark', idPrefix: 'other' })).toContain('id="other-dark-base"')
})

test('the SVG never contains the seed and stays small', () => {
  for (const seed of [A, APP, '<script>alert(1)</script>']) {
    const svg = identityArt(seed, { ...SIZE, theme: 'light' })
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).not.toContain(seed)
    expect(svg).not.toMatch(/<script|on\w+=/i)
    expect(svg.length).toBeLessThan(8000)
  }
})

/** #rrggbb to OKLCH (lightness, chroma, hue in degrees). */
function toOklch(hex: string): { l: number; c: number; h: number } {
  const lin = [1, 3, 5].map((k) => {
    const v = parseInt(hex.slice(k, k + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const [r, g, b] = lin
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  return { l, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 }
}

const mix = (x: string, y: string) =>
  `#${[1, 3, 5].map((k) => Math.round((parseInt(x.slice(k, k + 2), 16) + parseInt(y.slice(k, k + 2), 16)) / 2).toString(16).padStart(2, '0')).join('')}`

test('hues avoid the olive/brown band, stay apart, and no used colour (or glow mix) turns olive', () => {
  const dist = (x: number, y: number) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y))
  const inBand = (h: number) => h >= 50 && h < 140
  for (let i = 0; i < 400; i++) {
    const seed = `0x${(i * 2654435761 >>> 0).toString(16).padStart(8, '0')}${i.toString(16).padStart(32, '0')}`
    const { a, b, c } = identityHues(seed)
    for (const hue of [a, b, c]) {
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
      expect(inBand(hue)).toBe(false)
    }
    expect(dist(a, b)).toBeGreaterThanOrEqual(25)
    expect(dist(a, c)).toBeGreaterThanOrEqual(25)
    for (const theme of ['light', 'dark'] as const) {
      const svg = identityArt(seed, { ...SIZE, theme })
      const colours = [...new Set(svg.match(/#[0-9a-f]{6}/g) ?? [])]
      const glows = [...svg.matchAll(/<radialGradient id="[^"]+-g[ab]"><stop offset="0" stop-color="(#[0-9a-f]{6})"/g)].map((m) => m[1])
      expect(glows).toHaveLength(2)
      for (const colour of [...colours, mix(glows[0], glows[1])]) {
        const { l, c: chroma, h } = toOklch(colour)
        // Light peach/cream tints (L > 0.8) are fine; mid and dark tones in the band read as olive or brown.
        if (chroma > 0.04 && l < 0.8) expect(inBand(h), `${seed} ${theme} ${colour} hue ${h.toFixed(0)}`).toBe(false)
      }
    }
  }
  expect(identityAccent(A)).toMatch(/^#[0-9a-f]{6}$/)
  expect(oklchHex(1, 0, 0)).toBe('#ffffff')
  expect(oklchHex(0, 0, 0)).toBe('#000000')
})

test('sharp rasterises the art (link-preview cards draw it)', async () => {
  const svg = identityArt(APP, { width: 1200, height: 630, theme: 'dark' })
  const { info } = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true })
  expect([info.width, info.height]).toEqual([1200, 630])
})
