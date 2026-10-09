// Square avatar cropping. The math is pure (and tested in Node); rendering
// uses a canvas and runs only in the browser.

/** Avatars are stored as this many pixels square. */
export const AVATAR_SIZE = 256
/** Accepted source images, checked before any processing. */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
/** Largest source file accepted (before resizing). */
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024
export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

export interface CropState {
  /** 1 = the largest centred square; 4 = a quarter of its side. */
  zoom: number
  /** Pan of the crop centre, -1 (left/top edge) … 1 (right/bottom edge). */
  panX: number
  panY: number
}

export interface CropRect {
  sx: number
  sy: number
  size: number
}

export const INITIAL_CROP: CropState = { zoom: 1, panX: 0, panY: 0 }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Why `file` can't be used as an avatar source, or null when it can. */
export function sourceImageProblem(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Choose a PNG, JPEG or WebP image.'
  }
  if (file.size > MAX_SOURCE_BYTES) return 'Choose an image of at most 2 MB.'
  return null
}

/** The source square (in image pixels) a crop state selects; always inside the image. */
export function cropRect(width: number, height: number, crop: CropState): CropRect {
  const zoom = clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM)
  const size = Math.min(width, height) / zoom
  const slackX = (width - size) / 2
  const slackY = (height - size) / 2
  return {
    sx: Math.round(slackX + clamp(crop.panX, -1, 1) * slackX),
    sy: Math.round(slackY + clamp(crop.panY, -1, 1) * slackY),
    size: Math.round(size),
  }
}

/**
 * The pan after dragging by (dx, dy) screen pixels in a viewport `viewport`
 * pixels wide that shows `rect.size` source pixels.
 */
export function panBy(
  crop: CropState,
  width: number,
  height: number,
  viewport: number,
  dx: number,
  dy: number,
): CropState {
  const { size } = cropRect(width, height, crop)
  const scale = size / viewport
  const slackX = (width - size) / 2
  const slackY = (height - size) / 2
  return {
    ...crop,
    panX: slackX > 0 ? clamp(crop.panX - (dx * scale) / slackX, -1, 1) : 0,
    panY: slackY > 0 ? clamp(crop.panY - (dy * scale) / slackY, -1, 1) : 0,
  }
}

/**
 * Draws the crop into a 256×256 canvas and encodes it as WebP. Browsers that
 * cannot encode WebP (older Safari) return PNG instead, which is also accepted.
 */
export async function renderAvatar(image: HTMLImageElement, crop: CropState): Promise<Blob> {
  const { sx, sy, size } = cropRect(image.naturalWidth, image.naturalHeight, crop)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot resize images')
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.9),
  )
  if (!blob) throw new Error('Could not encode the image')
  return blob
}

/** Lowercase hex SHA-256 of the bytes (WebCrypto). */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
