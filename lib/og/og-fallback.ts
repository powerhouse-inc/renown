// The link-preview route's last line of defence: whatever fails, it answers
// with an image. Pure apart from the draw function it is given.
import type { OgCard } from './og-data'

/** A plain 1200 x 630 PNG in the card's background colour (#050A1A), for when no card can be drawn at all. */
export const STATIC_CARD_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAABLAAAAJ2CAMAAAB4notuAAAAA1BMVEUFChqmPO7BAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAC9ElEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACeDIw7AAFVlxRJAAAAAElFTkSuQmCC',
  'base64',
)

export type DrawCard<F> = (card: OgCard, fonts: F | null) => Promise<Buffer>

export interface DrawnCard {
  png: Buffer
  /** The card that was drawn (the default card after any failure). */
  card: OgCard
  /** A failure forced a fallback. */
  degraded: boolean
  /** Not even the default card could be drawn: `png` is STATIC_CARD_PNG. */
  static: boolean
}

/**
 * Draws `card`; when that throws, the default card; when that throws too, the
 * default card without the custom fonts; and when even that throws, the
 * static PNG. Never throws.
 */
export async function drawWithFallback<F>(card: OgCard, fonts: F | null, draw: DrawCard<F>): Promise<DrawnCard> {
  try {
    return { png: await draw(card, fonts), card, degraded: false, static: false }
  } catch (error) {
    // Satori refused this card (e.g. an image it cannot lay out): draw the default card instead.
    console.error('og: drawing failed, falling back to the default card:', error)
  }
  const fallback: OgCard = { variant: 'default' }
  for (const withFonts of fonts ? [fonts, null] : [null]) {
    try {
      return { png: await draw(fallback, withFonts), card: fallback, degraded: true, static: false }
    } catch (error) {
      console.error(`og: the default card failed too (${withFonts ? 'custom fonts' : 'default font'}):`, error)
    }
  }
  return { png: STATIC_CARD_PNG, card: fallback, degraded: true, static: true }
}
