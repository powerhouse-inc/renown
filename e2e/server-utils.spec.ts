import { test, expect } from '@playwright/test'
import { highlight, highlightAll } from '../lib/highlight'
import { TimeoutError, withTimeout } from '../utils/with-timeout'

// Runs in the Playwright worker (Node), not the browser.
test.describe('withTimeout', () => {
  test('passes a fast result through', async () => {
    expect(await withTimeout(Promise.resolve(42), 50)).toBe(42)
  })

  test('rejects a slow promise with TimeoutError', async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve('late'), 200))
    await expect(withTimeout(slow, 20)).rejects.toBeInstanceOf(TimeoutError)
  })

  test('keeps the original rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom')
  })
})

test.describe('highlight', () => {
  test('emits dual-theme shiki HTML and trims the source', async () => {
    const result = await highlight('\n  const a = 1\n', 'ts')
    expect(result.code).toBe('const a = 1')
    expect(result.html).toContain('class="shiki')
    expect(result.html).toContain('--shiki-light:')
    expect(result.html).toContain('--shiki-dark:')
  })

  test('escapes markup in the source', async () => {
    const result = await highlight('const html = "<script>alert(1)</script>"', 'ts')
    expect(result.html).not.toContain('<script>')
  })

  test('highlightAll keeps the keys', async () => {
    const all = await highlightAll({ a: { code: 'pnpm add x', lang: 'bash' }, b: { code: 'query { a }', lang: 'graphql' } })
    expect(Object.keys(all)).toEqual(['a', 'b'])
    expect(all.b.html).toContain('shiki')
  })
})
