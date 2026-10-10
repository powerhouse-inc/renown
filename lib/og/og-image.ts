// Converts a fetched image into a PNG the link-preview card can draw (Satori
// draws PNG/JPEG/GIF only). Node runtime only: sharp is a native module.
import sharp from 'sharp'

/** Larger inputs are refused before decoding (decompression bombs). 40 MP ~ 6300 x 6300. */
export const MAX_INPUT_PIXELS = 40_000_000

export interface ImageBox {
  width: number
  height: number
}

/** The card draws avatars at 220 px and logos at 200 px: 256 px is enough for both. */
export const AVATAR_BOX: ImageBox = { width: 256, height: 256 }
export const LOGO_BOX: ImageBox = { width: 256, height: 256 }

/**
 * `bytes` (PNG, JPEG, GIF, WebP, AVIF or SVG) as a PNG data URL, cropped to
 * fill `box` like the card's `objectFit: cover` and never enlarged. Only the
 * first frame of an animation is used; EXIF orientation is applied. Throws on
 * bytes sharp cannot decode and on images over MAX_INPUT_PIXELS.
 */
export async function toPngDataUrl(bytes: Uint8Array, box: ImageBox): Promise<string> {
  const png = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .rotate()
    .resize({ width: box.width, height: box.height, fit: 'cover', withoutEnlargement: true })
    .png()
    .toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}
