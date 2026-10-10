import { useMemo } from 'react'
import { identityArt } from '../../lib/identity-art'
import { cx } from '../../utils/cx'

export interface IdentityArtProps {
  /** Wallet address or app DID. */
  seed: string
  /** Drawing size in SVG units; the picture fills its box (cropped, never stretched). */
  width?: number
  height?: number
  /** Unique per picture on a page (gradient ids). */
  idPrefix: string
  className?: string
}

/**
 * The seed's constellation, filling its box. Both theme variants are server
 * rendered and CSS shows the one for the current theme, so nothing changes
 * after hydration (no layout shift, no flash). Decorative.
 */
export function IdentityArt({ seed, width = 1200, height = 320, idPrefix, className }: IdentityArtProps) {
  const [light, dark] = useMemo(
    () => [identityArt(seed, { width, height, theme: 'light', idPrefix }), identityArt(seed, { width, height, theme: 'dark', idPrefix })],
    [seed, width, height, idPrefix],
  )
  return (
    // className gives the box its size (and position, e.g. "absolute inset-0"); both variants fill it.
    <div aria-hidden="true" className={cx('rn-art overflow-hidden', className)}>
      {/* Trusted: identityArt() emits numbers and fixed markup only; the seed is never echoed. */}
      <div className="h-full w-full dark:hidden" dangerouslySetInnerHTML={{ __html: light }} />
      <div className="hidden h-full w-full dark:block" dangerouslySetInnerHTML={{ __html: dark }} />
    </div>
  )
}
