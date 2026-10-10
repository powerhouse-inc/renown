import type { IdentityArtSvgs } from '../../lib/identity-art'
import { cx } from '../../utils/cx'

export interface IdentityArtProps {
  /**
   * Both theme variants, computed on the server (lib/identity-art identityArtSvgs
   * in getServerSideProps): the browser never recomputes them, so a floating-point
   * difference between engines can never change the markup after hydration.
   */
  art: IdentityArtSvgs
  className?: string
}

/**
 * The seed's constellation, filling its box. Both theme variants are server
 * rendered and CSS shows the one for the current theme, so nothing changes
 * after hydration (no layout shift, no flash). Decorative.
 */
export function IdentityArt({ art, className }: IdentityArtProps) {
  return (
    // className gives the box its size (and position, e.g. "absolute inset-0"); both variants fill it.
    <div aria-hidden="true" className={cx('rn-art overflow-hidden', className)}>
      {/* Trusted: identityArt() emits numbers and fixed markup only; the seed is never echoed. */}
      <div className="h-full w-full dark:hidden" dangerouslySetInnerHTML={{ __html: art.light }} />
      <div className="hidden h-full w-full dark:block" dangerouslySetInnerHTML={{ __html: art.dark }} />
    </div>
  )
}
