// Identity art: a deterministic "constellation" for a wallet address or an app
// DID, drawn as an SVG string. The same seed always gives the same picture, so
// every profile and app looks like itself even without an avatar or a cover.
// Pure (no DOM, no randomness): used by the profile and app pages (inline) and
// by the link-preview cards (pages/api/og.tsx rasterises it with sharp, which
// is why colours are concrete hex values and not CSS variables).

export type IdentityArtTheme = 'light' | 'dark'

export interface IdentityArtOptions {
  width: number
  height: number
  theme: IdentityArtTheme
  /** Prefix for the SVG's gradient ids; must differ between pictures on one page. */
  idPrefix?: string
}

export interface IdentityHues {
  /** Main hue (0-359): the core glow. */
  a: number
  /** Neighbour hue: the second glow and most nodes. */
  b: number
  /** Accent hue, used sparingly (two or three nodes). */
  c: number
}

/** FNV-1a over the lowercased seed: stable across runtimes, no crypto needed. */
export function seedHash(seed: string): number {
  let h = 0x811c9dc5
  for (const char of seed.toLowerCase()) {
    h ^= char.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** mulberry32: a tiny seeded PRNG returning floats in [0, 1). */
function prng(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Olive and mustard (OKLCH hue 70-125) read as dirty on light backgrounds: such hues move to the nearer edge (amber or green). */
function clean(hue: number): number {
  const h = ((hue % 360) + 360) % 360
  if (h < 70 || h >= 125) return h
  return h < 97 ? 66 : 128
}

/** The seed's three hues. */
export function identityHues(seed: string): IdentityHues {
  const rand = prng(seedHash(seed))
  const a = clean(Math.floor(rand() * 360))
  const b = clean(a + (rand() < 0.5 ? -1 : 1) * (35 + Math.floor(rand() * 50)))
  const c = clean(a + 150 + Math.floor(rand() * 60))
  return { a, b, c }
}

/** OKLCH (l 0-1, c ~0-0.37, h degrees) to #rrggbb, gamut-clipped. Perceptually even lightness across hues. */
export function oklchHex(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180
  const A = c * Math.cos(rad)
  const B = c * Math.sin(rad)
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  return `#${linear
    .map((v) => {
      const x = Math.min(1, Math.max(0, v))
      const srgb = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
      return Math.round(srgb * 255)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')}`
}

const r1 = (n: number) => Math.round(n * 10) / 10

interface Palette {
  base: string
  baseEdge: string
  glowA: string
  glowB: string
  glowOpacity: number
  node: string
  accent: string
  line: string
  lineOpacity: number
  ring: string
  star: string
  core: [string, string]
}

function palette(hues: IdentityHues, theme: IdentityArtTheme): Palette {
  if (theme === 'dark') {
    return {
      base: oklchHex(0.19, 0.045, hues.a),
      baseEdge: oklchHex(0.13, 0.03, hues.b),
      glowA: oklchHex(0.62, 0.17, hues.a),
      glowB: oklchHex(0.58, 0.15, hues.b),
      glowOpacity: 0.6,
      node: oklchHex(0.86, 0.09, hues.b),
      accent: oklchHex(0.86, 0.15, hues.c),
      line: oklchHex(0.82, 0.08, hues.a),
      lineOpacity: 0.34,
      ring: oklchHex(0.8, 0.05, hues.a),
      star: '#ffffff',
      core: [oklchHex(0.9, 0.12, hues.b), oklchHex(0.72, 0.17, hues.a)],
    }
  }
  return {
    base: oklchHex(0.965, 0.022, hues.a),
    baseEdge: oklchHex(0.93, 0.035, hues.b),
    glowA: oklchHex(0.78, 0.13, hues.a),
    glowB: oklchHex(0.82, 0.11, hues.b),
    glowOpacity: 0.7,
    node: oklchHex(0.52, 0.14, hues.b),
    accent: oklchHex(0.6, 0.17, hues.c),
    line: oklchHex(0.45, 0.12, hues.a),
    lineOpacity: 0.3,
    ring: oklchHex(0.5, 0.07, hues.a),
    star: oklchHex(0.4, 0.05, hues.a),
    core: [oklchHex(0.7, 0.15, hues.b), oklchHex(0.5, 0.18, hues.a)],
  }
}

/**
 * The seed's constellation as a standalone SVG document string (`width` x
 * `height`, scales with preserveAspectRatio "xMidYMid slice"). A glowing core
 * right of centre, orbit rings around it, nodes on the orbits tied to the core
 * by edges and to their nearest neighbour, and a faint star field.
 */
export function identityArt(seed: string, { width, height, theme, idPrefix = 'ia' }: IdentityArtOptions): string {
  const hues = identityHues(seed)
  const p = palette(hues, theme)
  // A second stream for layout, so hues and layout vary independently.
  const rand = prng(seedHash(`${seed}#layout`))
  const id = `${idPrefix}-${theme}`
  const cx = width * (0.56 + rand() * 0.16)
  const cy = height * (0.38 + rand() * 0.24)
  const unit = Math.min(width, height)
  // Orbits stretch with the picture: wide covers get wide ellipses.
  const orbits = [0.13, 0.25, 0.4].map((k) => Math.max(unit * 0.3, width * k) * (0.9 + rand() * 0.2))
  const tilt = r1(-12 + rand() * 24)
  const squash = Math.min(0.85, (height / width) * (1.5 + rand() * 0.5))

  // Nodes on the orbits (ellipses: x radius r, y radius r * squash, rotated by tilt).
  const count = 11 + Math.floor(rand() * 6)
  const tiltRad = (tilt * Math.PI) / 180
  const nodes: { x: number; y: number; r: number; accent: boolean }[] = []
  for (let i = 0; i < count; i++) {
    const orbit = orbits[i % orbits.length]
    const angle = rand() * Math.PI * 2
    const ex = orbit * Math.cos(angle)
    const ey = orbit * squash * Math.sin(angle)
    const node = {
      x: r1(cx + ex * Math.cos(tiltRad) - ey * Math.sin(tiltRad)),
      y: r1(cy + ex * Math.sin(tiltRad) + ey * Math.cos(tiltRad)),
      r: r1(2.4 + rand() * 3.6),
      accent: i % 4 === 1,
    }
    const inside = node.x > 8 && node.x < width - 8 && node.y > 8 && node.y < height - 8
    // Nodes keep apart (24 units) and clear of the core, so no two dots merge.
    const apart = [...nodes, { x: cx, y: cy }].every((m) => (m.x - node.x) ** 2 + (m.y - node.y) ** 2 > 24 ** 2)
    if (inside && apart) nodes.push(node)
  }

  const edges: string[] = []
  for (const [i, n] of nodes.entries()) {
    // Every node is tied to the core (the "signed" edges), every other one also to its nearest neighbour.
    if (i % 3 !== 2) edges.push(`M${r1(cx)} ${r1(cy)}L${n.x} ${n.y}`)
    if (i % 2 === 0) {
      let best: (typeof nodes)[number] | null = null
      let bestD = Infinity
      for (const m of nodes) {
        const d = (m.x - n.x) ** 2 + (m.y - n.y) ** 2
        if (m !== n && d < bestD) {
          bestD = d
          best = m
        }
      }
      if (best) edges.push(`M${n.x} ${n.y}L${best.x} ${best.y}`)
    }
  }

  const stars: string[] = []
  const starCount = Math.round((width * height) / 9000)
  for (let i = 0; i < starCount; i++) {
    const x = r1(rand() * width)
    const y = r1(rand() * height)
    const r = r1(0.5 + rand() * 0.9)
    stars.push(`<circle cx="${x}" cy="${y}" r="${r}" opacity="${r1(0.12 + rand() * 0.4)}"/>`)
  }

  const bx = r1(width * (0.12 + rand() * 0.3))
  const by = r1(height * (0.15 + rand() * 0.5))
  const nodeMarkup = nodes
    .map((n, i) => {
      const fill = n.accent ? p.accent : p.node
      const halo = n.r > 4.2 || n.accent ? `<circle cx="${n.x}" cy="${n.y}" r="${r1(n.r * 2.6)}" fill="none" stroke="${fill}" stroke-opacity="0.45"/>` : ''
      const twinkle = i % 3 === 0 ? ' class="rn-art-twinkle"' : ''
      return `${halo}<circle${twinkle} cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${fill}"/>`
    })
    .join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">`,
    `<defs>`,
    `<linearGradient id="${id}-base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.base}"/><stop offset="1" stop-color="${p.baseEdge}"/></linearGradient>`,
    `<radialGradient id="${id}-ga"><stop offset="0" stop-color="${p.glowA}" stop-opacity="${p.glowOpacity}"/><stop offset="1" stop-color="${p.glowA}" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="${id}-gb"><stop offset="0" stop-color="${p.glowB}" stop-opacity="${r1(p.glowOpacity * 0.75)}"/><stop offset="1" stop-color="${p.glowB}" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="${id}-core" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.core[0]}"/><stop offset="1" stop-color="${p.core[1]}"/></linearGradient>`,
    `</defs>`,
    `<rect width="${width}" height="${height}" fill="url(#${id}-base)"/>`,
    `<circle cx="${bx}" cy="${by}" r="${r1(unit * 0.9)}" fill="url(#${id}-gb)"/>`,
    `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(unit * 1.15)}" fill="url(#${id}-ga)"/>`,
    `<g fill="${p.star}">${stars.join('')}</g>`,
    `<g fill="none" stroke="${p.ring}" stroke-opacity="0.42" stroke-dasharray="2 7" transform="rotate(${tilt} ${r1(cx)} ${r1(cy)})">`,
    orbits.map((r) => `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(r)}" ry="${r1(r * squash)}"/>`).join(''),
    `</g>`,
    `<path d="${edges.join('')}" stroke="${p.line}" stroke-opacity="${p.lineOpacity}" stroke-width="1.2" fill="none"/>`,
    nodeMarkup,
    `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(unit * 0.075)}" fill="none" stroke="${p.core[0]}" stroke-opacity="0.5"/>`,
    `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(unit * 0.045)}" fill="url(#${id}-core)"/>`,
    `</svg>`,
  ].join('')
}

/** The seed's accent colour (mid lightness, reads on light and dark): the avatar ring, publisher accents. */
export function identityAccent(seed: string): string {
  return oklchHex(0.66, 0.15, identityHues(seed).a)
}
