import { test, expect } from '@playwright/test'
import { MAX_SESSION_LABEL_LENGTH, parseSessionHost, parseSessionLabel } from '../utils/console-link'

// Runs in the Playwright worker (Node), not the browser.
test.describe('parseSessionLabel', () => {
  test('is null without the parameter', () => {
    expect(parseSessionLabel(undefined)).toBeNull()
    expect(parseSessionLabel(null)).toBeNull()
  })

  test('is null for the did:key that ph login sends as its app', () => {
    expect(parseSessionLabel('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')).toBeNull()
    expect(parseSessionLabel('did:key:zDnaerDaTF5BXEavCrfRZEk316dpbLsfPDZ3WJ5hRTPFU2169')).toBeNull()
  })

  test('keeps a label, trimmed, and takes the first of several', () => {
    expect(parseSessionLabel('Studio agent')).toBe('Studio agent')
    expect(parseSessionLabel('  billing ')).toBe('billing')
    expect(parseSessionLabel(['ph-cli', 'other'])).toBe('ph-cli')
    expect(parseSessionLabel('x'.repeat(MAX_SESSION_LABEL_LENGTH))).toHaveLength(MAX_SESSION_LABEL_LENGTH)
  })

  test('refuses a label it cannot show', () => {
    expect(parseSessionLabel('')).toBeUndefined()
    expect(parseSessionLabel('   ')).toBeUndefined()
    expect(parseSessionLabel('x'.repeat(MAX_SESSION_LABEL_LENGTH + 1))).toBeUndefined()
    expect(parseSessionLabel('line\nbreak')).toBeUndefined()
    expect(parseSessionLabel('bell\u0007')).toBeUndefined()
  })
})

test.describe('parseSessionHost', () => {
  test('is null without the parameter', () => {
    expect(parseSessionHost(undefined)).toBeNull()
  })

  test('keeps an http(s) URL without query, fragment or trailing slash', () => {
    expect(parseSessionHost('https://switchboard.example.com')).toBe('https://switchboard.example.com')
    expect(parseSessionHost('https://switchboard.example.com/')).toBe('https://switchboard.example.com')
    expect(parseSessionHost('https://example.com/api/?x=1#y')).toBe('https://example.com/api')
    expect(parseSessionHost('http://localhost:4001')).toBe('http://localhost:4001')
  })

  test('refuses what is not a web address', () => {
    expect(parseSessionHost('')).toBeUndefined()
    expect(parseSessionHost('switchboard.example.com')).toBeUndefined()
    expect(parseSessionHost('javascript:alert(1)')).toBeUndefined()
    expect(parseSessionHost('ftp://example.com')).toBeUndefined()
    expect(parseSessionHost('https://user:pass@example.com')).toBeUndefined()
  })
})
