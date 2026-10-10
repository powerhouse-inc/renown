import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from '../../services/media'
import { cx } from '../../utils/cx'
import { IdentityArt } from '../identity/identity-art'

/**
 * The app's cover, over its identity art: the art shows while the cover loads,
 * when there is none, and when it fails to load (the frame never changes size).
 */
export function AppHeroCover({ documentId, coverRef, appDid, className }: { documentId: string; coverRef: string | null; appDid: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  // A server-rendered <img> can fail before hydration (no React error event): catch it once mounted.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [coverRef])
  return (
    <div className={cx('border-hairline rounded-panel relative overflow-hidden border', className)}>
      <IdentityArt seed={appDid} idPrefix="app" className="absolute inset-0" />
      {coverRef && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- /media 302s to signed storage URLs next/image can't allowlist
        <img
          ref={imgRef}
          src={mediaUrl(documentId, 'cover', '', coverRef)}
          alt=""
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
