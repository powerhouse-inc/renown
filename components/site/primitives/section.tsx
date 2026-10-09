import type { ReactNode } from 'react'
import { cx } from '../../../utils/cx'
import { Container } from './container'

export interface SectionProps {
  children: ReactNode
  /** Anchor id (in-page links, TOC). */
  id?: string
  /** id of the heading that names this section. */
  labelledBy?: string
  /** plain: transparent; raised: a faint surface band with hairlines. */
  tone?: 'plain' | 'raised'
  /** Vertical rhythm: md = 64/80 px, sm = 48/56 px. */
  spacing?: 'sm' | 'md'
  className?: string
  /** Wrap children in a Container (default true). */
  contained?: boolean
}

/** One vertical band of a page, with consistent rhythm. */
export function Section({
  children,
  id,
  labelledBy,
  tone = 'plain',
  spacing = 'md',
  className,
  contained = true,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cx(
        'relative scroll-mt-24',
        spacing === 'md' ? 'py-16 md:py-20' : 'py-12 md:py-14',
        tone === 'raised' && 'border-hairline bg-surface-1 border-y',
        className,
      )}
    >
      {contained ? <Container>{children}</Container> : children}
    </section>
  )
}
