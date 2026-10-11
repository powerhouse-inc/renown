import { test, expect, type Page } from '@playwright/test'
import {
  decorativePaintProblems,
  horizontalOverflow,
  overlappingText,
  settle,
  strayDecorativeLayers,
  surfaceProblems,
  trappedFixedElements,
} from './support/layout-invariants'

// The guards themselves, on small hand-made pages (no server): each rule must
// flag its broken example and pass its fixed twin, so a refactor cannot turn a
// guard into a silent pass.
test.use({ viewport: { width: 390, height: 844 } })

const page_ = (body: string) => `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0 }
  body { font: 16px/1.5 sans-serif; background: #050a1a; color: #f4f7ff }
</style></head><body>${body}</body></html>`

async function show(page: Page, body: string): Promise<void> {
  await page.setContent(page_(body))
}

test('horizontal overflow: a too-wide row is named', async ({ page }) => {
  await show(page, '<div style="width: 600px; height: 20px">wide</div>')
  expect(await horizontalOverflow(page)).toEqual([expect.stringContaining('page is 600 px wide at a 390 px viewport')])
  await show(page, '<div style="max-width: 100%; height: 20px">fits</div>')
  expect(await horizontalOverflow(page)).toEqual([])
})

test('a fixed overlay inside a blurred header is trapped there (the ada56b7 bug)', async ({ page }) => {
  const overlay = '<div style="position: fixed; inset: 0; background: #000">menu</div>'
  await show(page, `<header style="height: 64px; backdrop-filter: blur(8px)">${overlay}</header>`)
  expect(await trappedFixedElements(page)).toEqual([expect.stringContaining('(backdrop-filter: blur(8px)), not the viewport')])
  await show(page, `<header style="height: 64px; backdrop-filter: blur(8px)"></header>${overlay}`)
  expect(await trappedFixedElements(page)).toEqual([])
})

test('an open panel: viewport cover, content inside, opaque background, not covered', async ({ page }) => {
  const drawer = (overlayStyle: string, panelBg: string) =>
    `<div id="overlay" style="${overlayStyle}"><div id="panel" style="position: absolute; inset: 0 0 0 auto; width: 300px; background: ${panelBg}; padding: 16px">
      <p>Apps</p><p>Developers</p><p>Trust</p></div></div>`
  await show(page, drawer('position: fixed; inset: 0', '#050a1a'))
  expect(await surfaceProblems(page, { panel: page.locator('#panel'), overlay: page.locator('#overlay') })).toEqual([])

  await show(page, `<header style="height: 64px; backdrop-filter: blur(8px)">${drawer('position: fixed; inset: 0', '#050a1a')}</header>`)
  const trapped = await surfaceProblems(page, { panel: page.locator('#panel'), overlay: page.locator('#overlay') })
  expect(trapped).toContain('overlay covers 390x64 at 0,0, not the 390x844 viewport')
  expect(trapped).toContain('text "Trust" lies outside the panel box')

  await show(page, drawer('position: fixed; inset: 0', 'rgba(5, 10, 26, 0.4)'))
  expect(await surfaceProblems(page, { panel: page.locator('#panel') })).toContain('text "Apps" has no opaque panel background behind it')

  await show(page, `${drawer('position: fixed; inset: 0', '#050a1a')}<div style="position: fixed; inset: 0; z-index: 9"></div>`)
  expect(await surfaceProblems(page, { panel: page.locator('#panel') })).toContain('text "Apps" is covered by <div>')
})

test('a panel that scrolls by itself is fine; one too short for its content is not', async ({ page }) => {
  const rows = Array.from({ length: 40 }, (_, i) => `<p>Row ${i}</p>`).join('')
  const dialog = (style: string) => `<div id="overlay" style="position: fixed; inset: 0"><div id="panel" style="position: absolute; left: 16px; right: 16px; top: 40px; background: #050a1a; padding: 16px; ${style}">${rows}</div></div>`
  const spec = { panel: page.locator('#panel'), overlay: page.locator('#overlay') }
  await show(page, dialog('max-height: 70vh; overflow-y: auto'))
  expect(await surfaceProblems(page, spec)).toEqual([])
  await show(page, dialog('height: 100px'))
  expect(await surfaceProblems(page, spec)).toContain('panel is 100 px tall but its content needs 1016 px'.replace('1016', String(await page.locator('#panel').evaluate((e) => e.scrollHeight))))
})

test('decorative layers stay inside a clipping panel (the 9676cbe tiles and glow)', async ({ page }) => {
  const panel = (layer: string) => `<div style="margin: 40px 16px; height: 300px; position: relative; overflow: hidden; border-radius: 28px">${layer}<h2>Call to action</h2></div>`
  await show(page, panel('<div aria-hidden="true" style="position: absolute; right: -288px; bottom: -320px; width: 600px; height: 600px; background: #0080ff"></div>'))
  expect(await strayDecorativeLayers(page)).toEqual([expect.stringMatching(/extends 288 px past the right, 320 px past the bottom of its clipping panel/)])
  await show(page, panel('<div aria-hidden="true" style="position: absolute; inset: 0; background: #0080ff"></div>'))
  expect(await strayDecorativeLayers(page)).toEqual([])
})

test('a glow that ends inside its panel must have faded out; a frame must show all the way round', async ({ page }) => {
  const glow = (gradient: string) =>
    `<div style="margin: 40px 16px; height: 300px; position: relative; isolation: isolate; overflow: hidden">
      <div aria-hidden="true" style="position: absolute; left: 0; right: 0; top: 0; height: 150px; z-index: -1; background: ${gradient}"></div></div>`
  await show(page, glow('radial-gradient(50% 60% at 50% 100%, rgba(0, 128, 255, 0.5), transparent)'))
  expect(await decorativePaintProblems(page)).toEqual([expect.stringContaining('has a hard bottom edge inside its panel')])
  await show(page, glow('radial-gradient(40% 40% at 50% 50%, rgba(0, 128, 255, 0.5), transparent)'))
  expect(await decorativePaintProblems(page)).toEqual([])

  const frame = (gradient: string) =>
    `<div style="margin: 40px 16px; padding: 1px; position: relative; isolation: isolate; overflow: hidden; border-radius: 28px">
      <div aria-hidden="true" style="position: absolute; inset: 0; z-index: -1; background: ${gradient}"></div>
      <div style="background: #050a1a; border-radius: 27px; height: 300px">Panel</div></div>`
  await show(page, frame('linear-gradient(120deg, #21ffb4, #0080ff 45%, transparent 80%)'))
  expect(await decorativePaintProblems(page)).toEqual([expect.stringMatching(/frame .* fades out along \d+ % of its edge/)])
  await show(page, frame('linear-gradient(120deg, #21ffb4, #0080ff)'))
  expect(await decorativePaintProblems(page)).toEqual([])
})

test('the paint check can be told it must find a layer, so markup changes cannot make it vacuous', async ({ page }) => {
  await show(page, '<div style="margin: 40px 16px; height: 300px; position: relative; overflow: hidden"><h2>No layer</h2></div>')
  expect(await decorativePaintProblems(page)).toEqual([])
  expect(await decorativePaintProblems(page, { expectProbes: true })).toEqual([expect.stringContaining('found no decorative layer to check')])
})

test('settle waits for finite animations and ignores infinite ones', async ({ page }) => {
  test.setTimeout(15_000)
  await show(page, '<div id="spin">Loading</div><div id="fade">Hello</div>')
  await page.evaluate(() => {
    document.getElementById('spin')!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, iterations: Infinity })
    document.getElementById('fade')!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' })
  })
  await settle(page)
  expect(await page.evaluate(() => document.getElementById('fade')!.getAnimations()[0].playState)).toBe('finished')
})

test('text boxes never overlap; truncated text counts only where it shows', async ({ page }) => {
  await show(page, '<h1 style="font-size: 40px">Heading</h1><p style="margin-top: -40px">Body text</p>')
  expect(await overlappingText(page)).toEqual([expect.stringContaining('text "Heading" overlaps "Body text"')])
  await show(page, '<h1 style="font-size: 40px">Heading</h1><p>Body text</p>')
  expect(await overlappingText(page)).toEqual([])
  await show(page, `<div style="display: flex; gap: 16px; width: 358px"><p style="width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${'did:pkh:eip155:1:0x'.padEnd(60, 'a')}</p><p>Expires</p></div>`)
  expect(await overlappingText(page)).toEqual([])
})
