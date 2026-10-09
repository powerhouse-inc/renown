import { test, expect } from '@playwright/test'
import { buildConnectLink } from '../utils/connect-link'

// Runs in the Playwright worker (Node), not the browser.
const ORIGIN = 'https://www.renown.id'
const DID = 'did:key:zDnaed4wPy35wBBJVLZL1XPRQWKpQeeb3JRgMdmHQsLe7KJyi'

test.describe('buildConnectLink', () => {
  test('builds a minimal connect link', () => {
    const result = buildConnectLink({ origin: ORIGIN, appDid: DID, returnUrl: '', expiresInDays: '' })
    expect(result.url).toBe(`${ORIGIN}/?connect=${encodeURIComponent(DID)}`)
    expect(result.effectiveDays).toBe(7)
    expect(result.errors).toEqual({})
  })

  test('encodes the return URL and keeps an explicit validity', () => {
    const result = buildConnectLink({ origin: `${ORIGIN}/`, appDid: ` ${DID} `, returnUrl: 'https://app.example/cb?x=1', expiresInDays: '30' })
    const url = new URL(result.url ?? '')
    expect(url.origin).toBe(ORIGIN)
    expect(url.searchParams.get('connect')).toBe(DID)
    expect(url.searchParams.get('returnUrl')).toBe('https://app.example/cb?x=1')
    expect(url.searchParams.get('expiresInDays')).toBe('30')
  })

  test('clamps long validity to 365 days and says so', () => {
    const result = buildConnectLink({ origin: ORIGIN, appDid: DID, returnUrl: '', expiresInDays: '9999' })
    expect(result.clamped).toBe(true)
    expect(result.effectiveDays).toBe(365)
    expect(new URL(result.url ?? '').searchParams.get('expiresInDays')).toBe('365')
  })

  test('rejects what the sign-in flow would drop or misread', () => {
    expect(buildConnectLink({ origin: ORIGIN, appDid: '', returnUrl: '', expiresInDays: '' }).errors.appDid).toBe('Enter your app DID.')
    expect(buildConnectLink({ origin: ORIGIN, appDid: 'did:web:x', returnUrl: '', expiresInDays: '' }).errors.appDid).toMatch(/did:key/)
    for (const returnUrl of ['/relative', 'javascript:alert(1)', 'not a url']) {
      const result = buildConnectLink({ origin: ORIGIN, appDid: DID, returnUrl, expiresInDays: '' })
      expect(result.url, returnUrl).toBeNull()
      expect(result.errors.returnUrl).toMatch(/absolute http/)
    }
    for (const expiresInDays of ['0', '-3', '1.5', 'week']) {
      const result = buildConnectLink({ origin: ORIGIN, appDid: DID, returnUrl: '', expiresInDays })
      expect(result.url, expiresInDays).toBeNull()
      expect(result.errors.expiresInDays).toMatch(/1 to 365/)
    }
  })
})
