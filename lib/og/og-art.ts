// The identity art behind profile and app link-preview cards, rasterised with
// sharp (Node runtime only). Satori cannot draw this SVG itself (gradients,
// many nodes), so it gets a PNG at card size.
import sharp from 'sharp'
import { identityArt } from '../identity-art'

export const CARD_BOX = { width: 1200, height: 630 }

/** The seed's dark-theme constellation as a 1200 x 630 PNG data URL; null when it cannot be drawn. */
export async function identityArtDataUrl(seed: string): Promise<string | null> {
  try {
    const svg = identityArt(seed, { ...CARD_BOX, theme: 'dark', idPrefix: 'og' })
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch (error) {
    console.warn('og: identity art could not be drawn:', error instanceof Error ? error.message : error)
    return null
  }
}
