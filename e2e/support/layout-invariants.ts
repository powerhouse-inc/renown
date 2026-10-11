// Geometric layout guards (used by e2e/layout-invariants.spec.ts, the page suite, and proven by e2e/layout-invariants-guards.spec.ts). Each check returns
// human-readable problems (empty = fine) instead of asserting, so one test can
// report every broken rule of a page at once. No pixel baselines: the checks
// read boxes and computed styles, and the two paint checks compare the page
// with and without one decorative layer (never with a stored image).
import type { Locator, Page } from '@playwright/test'
import sharp from 'sharp'

/** Pixels a box may stick out by (sub-pixel layout, borders). */
const SLACK = 1

/**
 * The page scrolls sideways: the document is wider than the viewport. Names
 * the widest elements so the culprit is easy to find.
 */
export async function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate((slack) => {
    const doc = document.documentElement
    const width = doc.clientWidth
    if (doc.scrollWidth <= width + slack) return []
    const offenders = Array.from(document.body.querySelectorAll<HTMLElement>('*'))
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter(({ right }) => right > width + slack)
      .sort((a, b) => b.right - a.right)
      .slice(0, 3)
      .map(({ el, right }) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} ends at ${Math.round(right)} px`)
    return [`page is ${doc.scrollWidth} px wide at a ${width} px viewport: ${offenders.join('; ')}`]
  }, SLACK)
}

/**
 * Every position: fixed element is positioned against the viewport. An
 * ancestor with a transform, filter, backdrop-filter, perspective, containment
 * or will-change of those becomes the containing block instead, and the
 * "fixed" element is then clipped to that ancestor (the mobile menu inside the
 * blurred header, ada56b7).
 */
export async function trappedFixedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const capturing = (cs: CSSStyleDeclaration): string | null => {
      if (cs.transform !== 'none') return `transform: ${cs.transform}`
      if (cs.translate !== 'none') return `translate: ${cs.translate}`
      if (cs.rotate !== 'none') return `rotate: ${cs.rotate}`
      if (cs.scale !== 'none') return `scale: ${cs.scale}`
      if (cs.perspective !== 'none') return `perspective: ${cs.perspective}`
      if (cs.filter !== 'none') return `filter: ${cs.filter}`
      if (cs.backdropFilter !== 'none') return `backdrop-filter: ${cs.backdropFilter}`
      if (/paint|layout|strict|content/.test(cs.contain)) return `contain: ${cs.contain}`
      if (/transform|filter|perspective|translate|rotate|scale/.test(cs.willChange)) return `will-change: ${cs.willChange}`
      if (cs.containerType !== 'normal') return `container-type: ${cs.containerType}`
      return null
    }
    const describe = (el: Element) => {
      const label = el.getAttribute('aria-label') || el.id || String(el.className).slice(0, 50)
      return `<${el.tagName.toLowerCase()}> "${label}"`
    }
    const problems: string[] = []
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const cs = getComputedStyle(el)
      if (cs.position !== 'fixed' || cs.display === 'none') continue
      const box = el.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue
      for (let up = el.parentElement; up && up !== document.documentElement; up = up.parentElement) {
        const reason = capturing(getComputedStyle(up))
        if (reason) {
          problems.push(`fixed ${describe(el)} is positioned against ${describe(up)} (${reason}), not the viewport`)
          break
        }
      }
    }
    return problems
  })
}

/** What an open overlay, sheet, drawer or dialog must satisfy. */
export interface SurfaceSpec {
  /** The panel that holds the content (dialog, drawer panel, sheet). */
  panel: Locator
  /** An element that must cover the whole viewport while open (the drawer's overlay), if any. */
  overlay?: Locator
}

/**
 * An open surface: its overlay covers the viewport; the panel is at least as
 * tall as its content (or fills the viewport and scrolls); every line of text
 * inside sits inside the panel and on an opaque background that belongs to
 * the panel; nothing else is painted on top of its text.
 */
export async function surfaceProblems(page: Page, { panel, overlay }: SurfaceSpec): Promise<string[]> {
  const problems: string[] = []
  const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: window.innerHeight }))
  if (overlay) {
    const box = await overlay.boundingBox()
    if (!box) problems.push('overlay is not rendered')
    else if (box.x > SLACK || box.y > SLACK || box.width < viewport.width - SLACK || box.height < viewport.height - SLACK) {
      problems.push(`overlay covers ${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)}, not the ${viewport.width}x${viewport.height} viewport`)
    }
  }
  const inside = await panel.evaluate((root, slack) => {
    const found: string[] = []
    const rootBox = root.getBoundingClientRect()
    const vh = window.innerHeight
    // A panel that scrolls by itself (max-height + overflow-y: auto) legitimately has more content than box.
    const rootStyle = getComputedStyle(root)
    const scrolls = (rootStyle.overflowY === 'auto' || rootStyle.overflowY === 'scroll') && root.scrollHeight > root.clientHeight + slack
    if (!scrolls && root.scrollHeight > root.clientHeight + slack && rootBox.height < vh - slack) {
      found.push(`panel is ${Math.round(rootBox.height)} px tall but its content needs ${root.scrollHeight} px`)
    }
    // Computed colours come as rgb(), rgba(), or oklch()/color() with an optional "/ alpha".
    const alpha = (colour: string) => {
      if (colour === 'transparent') return 0
      const slash = colour.match(/\/\s*([\d.]+)(%?)\s*\)$/)
      if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1)
      const rgba = colour.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/)
      return rgba ? parseFloat(rgba[1]) : 1
    }
    const contains = (box: DOMRect, x: number, y: number) => x >= box.left - slack && x <= box.right + slack && y >= box.top - slack && y <= box.bottom + slack
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim()
      const host = node.parentElement
      if (!text || !host) continue
      const style = getComputedStyle(host)
      if (style.visibility === 'hidden' || host.closest('[aria-hidden="true"]')) continue
      // Text cut off by a clipping box inside the panel (truncation, scrolling) only counts where it shows.
      let clip = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity }
      for (let up: Element | null = host; up && up !== root; up = up.parentElement) {
        const cs = getComputedStyle(up)
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
        const b = up.getBoundingClientRect()
        clip = { left: Math.max(clip.left, b.left), right: Math.min(clip.right, b.right), top: Math.max(clip.top, b.top), bottom: Math.min(clip.bottom, b.bottom) }
      }
      // Rows scrolled out of view inside the panel's own scroll box only count where they show.
      if (scrolls) clip = { ...clip, top: Math.max(clip.top, rootBox.top), bottom: Math.min(clip.bottom, rootBox.bottom) }
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const r of Array.from(range.getClientRects())) {
        const line = { left: Math.max(r.left, clip.left), right: Math.min(r.right, clip.right), top: Math.max(r.top, clip.top), bottom: Math.min(r.bottom, clip.bottom), width: 0, height: 0 }
        line.width = line.right - line.left
        line.height = line.bottom - line.top
        if (line.width < 1 || line.height < 1) continue
        const snippet = `"${text.slice(0, 30)}"`
        if (line.top < rootBox.top - slack || line.bottom > rootBox.bottom + slack || line.left < rootBox.left - slack || line.right > rootBox.right + slack) {
          found.push(`text ${snippet} lies outside the panel box`)
          continue
        }
        const x = line.left + line.width / 2
        const y = line.top + line.height / 2
        if (y < 0 || y > vh) continue
        // The nearest box behind the text that paints an opaque colour, within the panel.
        let backdrop: Element | null = null
        for (let el: Element | null = host; el; el = el === root ? null : el.parentElement) {
          const cs = getComputedStyle(el)
          if (alpha(cs.backgroundColor) >= 0.95 && parseFloat(cs.opacity) >= 0.95 && contains(el.getBoundingClientRect(), x, y)) {
            backdrop = el
            break
          }
        }
        if (!backdrop) found.push(`text ${snippet} has no opaque panel background behind it`)
        const hit = document.elementFromPoint(x, y)
        if (hit && !root.contains(hit)) found.push(`text ${snippet} is covered by <${hit.tagName.toLowerCase()}>`)
      }
    }
    return found
  }, SLACK)
  return [...problems, ...new Set(inside)]
}

/**
 * Decorative layers (aria-hidden, absolutely positioned) inside a panel that
 * clips (overflow other than visible) stay inside the panel's box: a layer
 * that relies on the clip shows hard cut-off edges or stray tiles (the old
 * final call-to-action, 9676cbe).
 */
export async function strayDecorativeLayers(page: Page): Promise<string[]> {
  return page.evaluate((slack) => {
    const problems: string[] = []
    const clips = (el: Element) => {
      const cs = getComputedStyle(el)
      return cs.overflowX !== 'visible' || cs.overflowY !== 'visible'
    }
    for (const layer of Array.from(document.querySelectorAll('[aria-hidden="true"]'))) {
      const cs = getComputedStyle(layer)
      if (cs.position !== 'absolute' || cs.display === 'none') continue
      const box = layer.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      let panel = layer.parentElement
      while (panel && panel !== document.body && !clips(panel)) panel = panel.parentElement
      if (!panel || panel === document.body) continue
      const frame = panel.getBoundingClientRect()
      const past = {
        top: frame.top - box.top,
        right: box.right - frame.right,
        bottom: box.bottom - frame.bottom,
        left: frame.left - box.left,
      }
      const sides = Object.entries(past).filter(([, by]) => by > slack)
      if (sides.length) {
        const where = sides.map(([side, by]) => `${Math.round(by)} px past the ${side}`).join(', ')
        problems.push(`decorative <${layer.tagName.toLowerCase()}.${String(layer.className).slice(0, 50)}> extends ${where} of its clipping panel <${panel.tagName.toLowerCase()}.${String(panel.className).slice(0, 50)}>`)
      }
    }
    return problems
  }, SLACK)
}

/**
 * Lines of text never overlap lines of another element. Compares the middle
 * band of each line box (tight leading makes neighbouring glyph boxes touch),
 * clipped by every ancestor that clips. `scope` limits the check (an open
 * surface); by default the whole page.
 */
export async function overlappingText(page: Page, scope?: Locator): Promise<string[]> {
  const root = scope ?? page.locator('body')
  return root.evaluate((rootEl) => {
    interface Line {
      owner: Element
      left: number
      right: number
      top: number
      bottom: number
      text: string
    }
    const lines: Line[] = []
    const visible = (el: Element) => {
      for (let up: Element | null = el; up; up = up.parentElement) {
        const cs = getComputedStyle(up)
        if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false
      }
      return true
    }
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim()
      const owner = node.parentElement
      if (!text || !owner || owner.closest('svg, [aria-hidden="true"], script, style, noscript, template') || !visible(owner)) continue
      // Visible area: the intersection of every clipping ancestor's box.
      let clip = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity }
      for (let up: Element | null = owner; up; up = up.parentElement) {
        const cs = getComputedStyle(up)
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
        const b = up.getBoundingClientRect()
        clip = { left: Math.max(clip.left, b.left), right: Math.min(clip.right, b.right), top: Math.max(clip.top, b.top), bottom: Math.min(clip.bottom, b.bottom) }
      }
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const r of Array.from(range.getClientRects())) {
        const band = r.height * 0.2
        const line = {
          owner,
          text: text.slice(0, 30),
          left: Math.max(r.left, clip.left),
          right: Math.min(r.right, clip.right),
          top: Math.max(r.top + band, clip.top),
          bottom: Math.min(r.bottom - band, clip.bottom),
        }
        if (line.right - line.left > 2 && line.bottom - line.top > 2) lines.push(line)
      }
    }
    const problems: string[] = []
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i]
        const b = lines[j]
        if (a.owner === b.owner) continue
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (w > 2 && h > 2) problems.push(`text "${a.text}" overlaps "${b.text}" by ${Math.round(w)}x${Math.round(h)} px`)
      }
    }
    return [...new Set(problems)]
  })
}

/** A screenshot as raw RGB. */
async function rgb(png: Buffer) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width }
}

interface PaintProbe {
  /** Index into the page's aria-hidden elements (data-layout-probe). */
  id: number
  label: string
  /** Region to screenshot, in page coordinates. */
  clip: { x: number; y: number; width: number; height: number }
  /** Inner edges of the layer (inside the panel, not on its border), as 2 px strips relative to clip. */
  edges: { side: string; x: number; y: number; width: number; height: number }[]
  /** For a frame: where to start sampling its ring (just outside the panel) and the inward direction, relative to clip. */
  ring: { x: number; y: number; dx: number; dy: number }[]
}

/**
 * Two paint checks on decorative layers inside clipping panels, made by
 * screenshotting the panel with and without the layer (no stored images):
 * - a layer edge that lies inside the panel must have faded out (no hard edge,
 *   like the old final call-to-action's half-height glow);
 * - a frame (a layer that shows only as a 1-2 px ring around an opaque inner
 *   panel) must be visible all the way round (not fade to nothing).
 * With `expectProbes`, finding no layer to check is itself a problem, so a page
 * known to have one cannot pass vacuously after a markup change.
 */
export async function decorativePaintProblems(page: Page, { expectProbes = false }: { expectProbes?: boolean } = {}): Promise<string[]> {
  const probes = await page.evaluate(() => {
    const out: PaintProbe[] = []
    const clips = (el: Element) => {
      const cs = getComputedStyle(el)
      return cs.overflowX !== 'visible' || cs.overflowY !== 'visible'
    }
    const opaque = (el: Element) => {
      const colour = getComputedStyle(el).backgroundColor
      if (colour === 'transparent') return false
      const slash = colour.match(/\/\s*([\d.]+)(%?)\s*\)$/)
      if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1) >= 0.95
      const rgba = colour.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/)
      return rgba ? parseFloat(rgba[1]) >= 0.95 : true
    }
    const layers = Array.from(document.querySelectorAll('[aria-hidden="true"]'))
    layers.forEach((layer, id) => {
      const cs = getComputedStyle(layer)
      if (cs.position !== 'absolute' || cs.display === 'none') return
      const box = layer.getBoundingClientRect()
      if (box.width < 8 || box.height < 8) return
      let panel = layer.parentElement
      while (panel && panel !== document.body && !clips(panel)) panel = panel.parentElement
      if (!panel || panel === document.body) return
      const frame = panel.getBoundingClientRect()
      // Whole pixels around the panel, with a 2 px margin (layout is fractional, screenshots are not).
      const px = Math.floor(frame.left + scrollX) - 2
      const py = Math.floor(frame.top + scrollY) - 2
      const clip = { x: px, y: py, width: Math.ceil(frame.right + scrollX) + 2 - px, height: Math.ceil(frame.bottom + scrollY) + 2 - py }
      const ox = frame.left + scrollX - px
      const oy = frame.top + scrollY - py
      const x0 = Math.ceil(ox + Math.max(0, box.left - frame.left))
      const x1 = Math.floor(ox + Math.min(frame.width, box.right - frame.left))
      const y0 = Math.ceil(oy + Math.max(0, box.top - frame.top))
      const y1 = Math.floor(oy + Math.min(frame.height, box.bottom - frame.top))
      if (x1 - x0 < 8 || y1 - y0 < 8) return
      const edges: PaintProbe['edges'] = []
      if (box.top - frame.top > 2) edges.push({ side: 'top', x: x0, y: y0, width: x1 - x0, height: 2 })
      if (frame.bottom - box.bottom > 2) edges.push({ side: 'bottom', x: x0, y: y1 - 2, width: x1 - x0, height: 2 })
      if (box.left - frame.left > 2) edges.push({ side: 'left', x: x0, y: y0, width: 2, height: y1 - y0 })
      if (frame.right - box.right > 2) edges.push({ side: 'right', x: x1 - 2, y: y0, width: 2, height: y1 - y0 })
      // A frame: the layer fills the panel, and the panel's only other child is an opaque inner box inset by 1-2 px,
      // so the layer shows as a thin ring. Sample the ring every 12 px, skipping the rounded corners.
      const ring: PaintProbe['ring'] = []
      const pad = parseFloat(getComputedStyle(panel).paddingTop)
      const inner = Array.from(panel.children).filter((child) => child !== layer && !child.matches('[aria-hidden="true"]'))
      if (edges.length === 0 && pad >= 1 && pad <= 2 && inner.length === 1 && opaque(inner[0])) {
        const radius = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0
        const top = Math.floor(oy) - 1
        const bottom = Math.ceil(oy + frame.height)
        const left = Math.floor(ox) - 1
        const right = Math.ceil(ox + frame.width)
        for (let x = Math.ceil(ox + radius); x < ox + frame.width - radius; x += 12) {
          ring.push({ x, y: top, dx: 0, dy: 1 }, { x, y: bottom, dx: 0, dy: -1 })
        }
        for (let y = Math.ceil(oy + radius); y < oy + frame.height - radius; y += 12) {
          ring.push({ x: left, y, dx: 1, dy: 0 }, { x: right, y, dx: -1, dy: 0 })
        }
      }
      if (edges.length === 0 && ring.length === 0) return
      layer.setAttribute('data-layout-probe', String(id))
      out.push({ id, label: `<${layer.tagName.toLowerCase()}.${String(layer.className).slice(0, 50)}>`, clip, edges, ring })
    })
    return out
  })

  const problems: string[] = []
  if (expectProbes && probes.length === 0) problems.push('the paint check found no decorative layer to check on this page')
  for (const probe of probes) {
    const layer = page.locator(`[data-layout-probe="${probe.id}"]`)
    const shown = await rgb(await page.screenshot({ clip: probe.clip, fullPage: true, animations: 'disabled' }))
    const previous = await layer.evaluate((el) => {
      const style = (el as HTMLElement).style
      const before = { value: style.getPropertyValue('opacity'), priority: style.getPropertyPriority('opacity') }
      style.setProperty('opacity', '0', 'important')
      return before
    })
    const hidden = await rgb(await page.screenshot({ clip: probe.clip, fullPage: true, animations: 'disabled' }))
    await layer.evaluate((el, before) => {
      const style = (el as HTMLElement).style
      if (before.value) style.setProperty('opacity', before.value, before.priority)
      else style.removeProperty('opacity')
    }, previous)
    const diff = (x: number, y: number) => {
      const i = (y * shown.width + x) * 3
      return (Math.abs(shown.data[i] - hidden.data[i]) + Math.abs(shown.data[i + 1] - hidden.data[i + 1]) + Math.abs(shown.data[i + 2] - hidden.data[i + 2])) / 3
    }
    for (const edge of probe.edges) {
      // The strongest 16 px stretch of the edge strip.
      const along = edge.width > edge.height ? edge.width : edge.height
      const values: number[] = []
      for (let t = 0; t < along; t++) {
        let sum = 0
        for (let d = 0; d < 2; d++) sum += edge.width > edge.height ? diff(edge.x + t, edge.y + d) : diff(edge.x + d, edge.y + t)
        values.push(sum / 2)
      }
      let worst = 0
      for (let t = 0; t + 16 <= values.length; t++) worst = Math.max(worst, values.slice(t, t + 16).reduce((a, b) => a + b, 0) / 16)
      if (worst > 6) problems.push(`decorative ${probe.label} has a hard ${edge.side} edge inside its panel (changes the page by ${worst.toFixed(1)} levels there)`)
    }
    if (probe.ring.length) {
      // The ring may straddle two pixel rows: take the strongest of 4 px from just outside the panel inwards.
      const strength = ({ x, y, dx, dy }: PaintProbe['ring'][number]) => Math.max(...[0, 1, 2, 3].map((k) => diff(x + k * dx, y + k * dy)))
      const faint = probe.ring.filter((point) => strength(point) < 6).length
      if (faint / probe.ring.length > 0.1) problems.push(`frame ${probe.label} fades out along ${Math.round((100 * faint) / probe.ring.length)} % of its edge`)
    }
  }
  await page.evaluate(() => document.querySelectorAll('[data-layout-probe]').forEach((el) => el.removeAttribute('data-layout-probe')))
  return problems
}

/** Fonts loaded, network idle, and entry animations (reduced motion still runs short fades) finished. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  // Only finite ones: an infinite animation (a spinner, a pulse) never finishes and would hang the test.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => {
          const timing = a.effect?.getComputedTiming()
          return timing !== undefined && timing.endTime !== Infinity && timing.iterations !== Infinity
        })
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
}
