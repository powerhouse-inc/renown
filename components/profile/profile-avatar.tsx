import { useEffect, useMemo, useRef, useState } from 'react'
import { avatarSources } from '../../utils/avatar-sources'
import { Identicon } from './identicon'

interface ProfileAvatarProps {
  /** Profile document id; with `avatar`, the uploaded avatar is served from /media. */
  documentId?: string | null
  /** attachment://v1:<sha256> of the uploaded avatar; its hash versions the /media URL. */
  avatar?: string | null
  /** Avatar exists but only the flag is known (no ref): serves the bare /media URL. */
  hasAvatar?: boolean
  /** External image (ENS avatar or legacy URL); used when there is no upload. */
  userImage?: string | null
  /** A local preview (object URL) that wins over everything else. */
  previewUrl?: string | null
  /** Seed for the generated fallback, usually the address. */
  seed: string
  alt: string
  className?: string
}

/**
 * The profile picture: local preview → uploaded avatar → external image →
 * generated identicon. An image that fails to load falls through to the next.
 */
export function ProfileAvatar({
  documentId,
  avatar,
  hasAvatar,
  userImage,
  previewUrl,
  seed,
  alt,
  className = 'h-32 w-32',
}: ProfileAvatarProps) {
  const sources = useMemo(
    () => avatarSources({ documentId, avatar, hasAvatar, userImage, previewUrl }),
    [documentId, avatar, hasAvatar, userImage, previewUrl],
  )
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const src = sources.find((candidate) => !failed.has(candidate))
  const imgRef = useRef<HTMLImageElement>(null)

  // A server-rendered <img> can fail before hydration, so React never sees its
  // error event: catch an already-broken image once mounted.
  useEffect(() => {
    const img = imgRef.current
    if (src && img?.complete && img.naturalWidth === 0) setFailed((f) => new Set(f).add(src))
  }, [src])
  const shape = `rounded-full object-cover ${className}`

  if (!src) return <Identicon seed={seed} className={shape} />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- /media 302s to signed storage URLs next/image can't allowlist
    <img ref={imgRef} src={src} alt={alt} className={shape} onError={() => setFailed((f) => new Set(f).add(src))} />
  )
}
