// A deterministic 5×5 mirrored identicon for profiles without any image.

export interface Identicon {
  /** HSL colour of the filled cells. */
  color: string
  /** Row-major 5×5, mirrored left↔right. */
  cells: boolean[]
}

/** FNV-1a over the lowercased seed: stable across runtimes, no crypto needed. */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (const char of seed.toLowerCase()) {
    h ^= char.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

export function identicon(seed: string): Identicon {
  const h = hash(seed)
  const cells: boolean[] = []
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const mirrored = col < 3 ? col : 4 - col
      cells.push(((h >>> (row * 3 + mirrored)) & 1) === 1)
    }
  }
  return { color: `hsl(${h % 360} 70% 55%)`, cells }
}
