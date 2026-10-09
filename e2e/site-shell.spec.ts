import { test, expect } from '@playwright/test'

// Header, footer and mobile drawer, on the 404 page (site layout, no data).
const PAGE = '/no-such-page'

test.describe('site header', () => {
  test('shows the primary nav, theme toggle and sign-in', async ({ page }) => {
    await page.goto(PAGE)
    const nav = page.getByRole('banner').getByRole('navigation', { name: 'Main' })
    for (const [label, href] of [
      ['Apps', '/apps'],
      ['Developers', '/developers'],
      ['Trust', '/trust'],
      ['Ecosystem', '/ecosystem'],
    ]) {
      await expect(nav.getByRole('link', { name: label })).toHaveAttribute('href', href)
    }
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Renown home' })).toHaveAttribute('href', '/')
    await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeVisible()
    await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 30_000 })
  })

  test('the skip link jumps to the main content', async ({ page }) => {
    await page.goto(PAGE)
    // Hydrated once the session check settles; Tab before that can land anywhere.
    await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await expect(skip).toHaveAttribute('href', '#main')
    await expect(page.locator('main#main')).toHaveCount(1)
  })
})

test.describe('site footer', () => {
  test('links products, developers, ecosystem and legal pages', async ({ page }) => {
    await page.goto(PAGE)
    const footer = page.getByRole('contentinfo')
    const expected: Array<[string, string]> = [
      ['Apps', '/apps'],
      ['Your Renown', '/me'],
      ['App stats docs', 'https://www.vetra.io/docs/app-stats'],
      ['GitHub', 'https://github.com/powerhouse-inc'],
      ['Vetra', 'https://www.vetra.io'],
      ['Powerhouse', 'https://www.powerhouse.inc'],
      ['Privacy', 'https://www.vetra.io/privacy-policy'],
      ['Terms', 'https://www.vetra.io/terms-and-conditions'],
      ['Powerhouse on X', 'https://x.com/PowerhouseDAO'],
    ]
    for (const [name, href] of expected) {
      await expect(footer.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
    }
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('rel', /noopener/)
    await expect(footer).toContainText(`© ${new Date().getFullYear()} Powerhouse`)
  })
})

test.describe('mobile drawer', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('opens from the keyboard, traps focus, and Esc returns focus to the toggle', async ({ page }) => {
    await page.goto(PAGE)
    await expect(page.getByRole('banner').getByRole('navigation', { name: 'Main' })).toBeHidden()
    const toggle = page.getByRole('button', { name: 'Open menu' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.focus()
    await page.keyboard.press('Enter')

    const drawer = page.getByRole('dialog', { name: 'Menu' })
    await expect(drawer).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(drawer.getByRole('button', { name: 'Close menu' })).toBeFocused()
    await expect(drawer.getByRole('link', { name: 'Ecosystem' })).toHaveAttribute('href', '/ecosystem')

    // Shift+Tab from the first element wraps to the last one inside the drawer.
    await page.keyboard.press('Shift+Tab')
    expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(toggle).toBeFocused()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})

test.describe('auth screens keep the minimal chrome', () => {
  for (const path of ['/console?session=chrome-test', '/oidc/login', '/?app=did:web:chrome.example']) {
    test(`${path} has no site nav, footer or header sign-in`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeVisible()
      // / still draws the PH icons backdrop with the same label: the logo is the last one.
      await expect(page.locator('svg[aria-label="Renown"]').last()).toBeVisible()
      await expect(page.getByRole('banner')).toHaveCount(0)
      await expect(page.getByRole('contentinfo')).toHaveCount(0)
      await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Skip to content' })).toHaveCount(0)
    })
  }
})
