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

test('hues avoid the muddy olive band, and colours are hex', () => {
  for (let i = 0; i < 400; i++) {
    const { a, b, c } = identityHues(`0x${i.toString(16).padStart(40, '0')}`)
    for (const hue of [a, b, c]) {
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
      expect(hue >= 70 && hue < 125).toBe(false)
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
