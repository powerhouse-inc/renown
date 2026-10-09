// Shared helpers for the site-polish specs: theme, axe and screenshots.
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, type TestInfo } from '@playwright/test'

export type Theme = 'light' | 'dark'

/** Pins next-themes to `theme` for every page load of this page's context. */
export async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('theme', value)
    } catch {
      // storage blocked: the emulated colour scheme still applies
    }
  }, theme)
}

/** Fails on serious or critical axe violations (WCAG 2.x A/AA rules). */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    // Third-party wallet modals are not part of the page under test.
    .exclude('[data-rk]')
    .analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`),
  ).toEqual([])
}

/** Full-page screenshots at 390 and 1280 px, attached to the test report. */
export async function attachScreenshots(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(200)
    const body = await page.screenshot({ fullPage: true })
    await testInfo.attach(`${name}-${width}.png`, { body, contentType: 'image/png' })
  }
}
