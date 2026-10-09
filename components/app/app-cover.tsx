import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from '../../services/media'

/** A stable hue per seed (FNV-1a), for the gradient shown without a cover. */
function hueOf(seed: string): number {
  let h = 0x811c9dc5
  for (const char of seed) {
    h ^= char.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % 360
}

/** The 3:1 cover: the uploaded image, or a gradient derived from the app DID. */
export function AppCover({ documentId, coverRef, seed }: { documentId: string; coverRef?: string | null; seed: string }) {
  const [failedRef, setFailedRef] = useState<string | null>(null)
  const failed = failedRef === coverRef
  const imgRef = useRef<HTMLImageElement>(null)

  // A server-rendered <img> can fail before hydration (no React error event): catch it once mounted.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailedRef(coverRef ?? null)
  }, [coverRef])
  if (coverRef && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- /media 302s to signed storage URLs next/image can't allowlist
      <img ref={imgRef} src={mediaUrl(documentId, 'cover', '', coverRef)} alt="" loading="lazy" decoding="async" className="aspect-[3/1] w-full object-cover" onError={() => setFailedRef(coverRef ?? null)} />
    )
  }
  const hue = hueOf(seed)
  return (
    <div
      aria-hidden="true"
      className="aspect-[3/1] w-full"
      style={{ backgroundImage: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 50) % 360} 70% 32%))` }}
    />
  )
}
