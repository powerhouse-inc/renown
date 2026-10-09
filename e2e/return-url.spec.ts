import { test, expect } from '@playwright/test'
import { parseReturnUrl } from '../utils/return-url'

// Runs in the Playwright worker (Node), not the browser.
test.describe('parseReturnUrl', () => {
  test('keeps http(s) URLs', () => {
    expect(parseReturnUrl('https://connect.example.com/done?x=1')).toBe('https://connect.example.com/done?x=1')
    expect(parseReturnUrl('http://localhost:3000/done')).toBe('http://localhost:3000/done')
  })

  test('drops absent, empty, relative and malformed values', () => {
    expect(parseReturnUrl(undefined)).toBeUndefined()
    expect(parseReturnUrl('')).toBeUndefined()
    expect(parseReturnUrl('/done')).toBeUndefined()
    expect(parseReturnUrl('not a url')).toBeUndefined()
  })

  test('drops non-http schemes', () => {
    expect(parseReturnUrl('javascript:alert(1)')).toBeUndefined()
    expect(parseReturnUrl('data:text/html,hi')).toBeUndefined()
  })

  test('takes the first value of a repeated parameter', () => {
    expect(parseReturnUrl(['https://a.example/', 'https://b.example/'])).toBe('https://a.example/')
  })
})
