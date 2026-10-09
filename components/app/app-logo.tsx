import { useMemo, useState } from 'react'
import { mediaUrl } from '../../services/media'

/** Legacy logos: https URLs and raster data URLs only. */
function safeLegacyLogo(url: string | null | undefined): string | null {
  if (!url) return null
  return /^https:\/\//i.test(url) || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(url) ? url : null
}

interface AppLogoProps {
  documentId: string
  /** attachment://v1:<sha256> of the uploaded logo (served from /media; its hash versions the URL). */
  logoRef?: string | null
  legacyLogo?: string | null
  name: string
  className?: string
}

/** The app's logo: uploaded → legacy URL → a monogram tile. An image that fails to load falls through. */
export function AppLogo({ documentId, logoRef, legacyLogo, name, className = 'h-24 w-24 text-4xl ring-4' }: AppLogoProps) {
  const sources = useMemo(
    () =>
      [logoRef ? mediaUrl(documentId, 'logo', '', logoRef) : null, safeLegacyLogo(legacyLogo)].filter(
        (src): src is string => !!src,
      ),
    [documentId, logoRef, legacyLogo],
  )
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const src = sources.find((candidate) => !failed.has(candidate))
  const shape = `shrink-0 rounded-2xl shadow-lg ring-white dark:ring-white/10 ${className}`
  if (!src) {
    return (
      <span aria-hidden="true" className={`bg-primary/15 text-primary flex items-center justify-center font-bold ${shape}`}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- /media 302s to signed storage URLs next/image can't allowlist
    <img
      src={src}
      alt={`${name} logo`}
      className={`bg-background object-cover ${shape}`}
      onError={() => setFailed((f) => new Set(f).add(src))}
    />
  )
}
